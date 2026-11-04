import assert from 'node:assert/strict';
import webdriver from 'selenium-webdriver';
import { USERS, PASSWORD, SUPABASE_KEY, SUPABASE_URL, API_URL } from './helpers/config.js';
import { cleanupE2E, createPublishedPecaApi, issuePassportApi, proposeApi, requestAs, loginApi, createUserApi, deleteUsersByEmail } from './helpers/api.js';
import { createDriver, clearSession, loginAndWaitDashboard, open, clickLabeled, fill, waitForText } from './helpers/browser.js';

const { By, until } = webdriver;
const stamp = Date.now();
const prefix = `E2E Entrega ${stamp}`;
const outsider = { email: `e2e-entrega-${stamp}@lastro.com` };
const as = async (driver, user) => { await clearSession(driver); await loginAndWaitDashboard(driver, user.email); await open(driver, '/dashboard/transacoes'); };
const step = (t, user, path, body) => requestAs(user, `/transacoes/${t.id}/${path}`, { method: 'POST', body });
const current = async (t) => (await requestAs(USERS.admin, `/transacoes?peca=${t.pecaId}`)).data.find((x) => x.id === t.id);
const acceptDialog = async (driver) => { await driver.wait(until.alertIsPresent(), 5000); await driver.switchTo().alert().accept(); };
const prepareConference = async (suffix) => {
  const p = await createPublishedPecaApi({ nome: `${prefix} ${suffix}`, valor: 1000 });
  const t = await proposeApi(p.id, 1000);
  for (const [user, path, body] of [[USERS.vendedor, 'confirmar'], [USERS.comprador, 'pagamento'], [USERS.vendedor, 'envio', { rastreio: 'E2E rastreio' }], [USERS.comprador, 'recebimento']]) {
    const r = await step(t, user, path, body); assert.equal(r.status, 200, r.data?.message);
  }
  return t;
};

describe('RFC12/RFC13 - Conferência de entrega e pagamento retido', function () {
  let driver, piece, transaction, refund, release;
  before(async () => {
    piece = await createPublishedPecaApi({ nome: `${prefix} Principal`, valor: 12345.67 });
    await issuePassportApi(piece.id);
    transaction = await proposeApi(piece.id, 12345.67);
    const u = await createUserApi({ email: outsider.email, senha: PASSWORD, nome: `${prefix} Outro comprador`, perfil: 'Comprador' });
    assert.equal(u.status, 201, u.data?.message);
    driver = await createDriver();
  });
  after(async () => { if (driver) await driver.quit(); await cleanupE2E(prefix); await deleteUsersByEmail(outsider.email); });

  it('bloqueia pagamento, envio, recebimento e aprovação fora de ordem', async () => {
    for (const [user, path, body] of [[USERS.comprador, 'pagamento'], [USERS.vendedor, 'envio', { rastreio: 'Teste' }], [USERS.comprador, 'recebimento'], [USERS.comprador, 'conferencia', { aprovada: true }]]) {
      assert.equal((await step(transaction, user, path, body)).status, 400);
    }
    assert.equal((await current(transaction)).status, 'pendente');
  });
  it('vendedor aceita a proposta sem transferir propriedade nem gerar comissão', async () => {
    await as(driver, USERS.vendedor); await waitForText(driver, piece.nome);
    await clickLabeled(driver, `Aceitar proposta de ${piece.nome}`); await acceptDialog(driver);
    await waitForText(driver, 'Proposta aceita.');
    const t = await current(transaction); assert.equal(t.status, 'aceita'); assert.equal(t.comissao, null); assert.equal(t.pagamentoStatus, null);
    const p = await requestAs(USERS.admin, `/pecas/${piece.id}`);
    assert.equal(p.data.vendida, false); assert.equal(p.data.emNegociacao, true); assert.equal(p.data.proprietarioId, t.vendedor.id);
  });
  it('nega pagamento por terceiro do mesmo perfil e acesso ao histórico alheio', async () => {
    assert.equal((await step(transaction, outsider, 'pagamento')).status, 403);
    assert.equal((await requestAs(outsider, `/transacoes/${transaction.id}/historico`)).status, 404);
    assert.equal((await step(transaction, USERS.admin, 'pagamento')).status, 403);
  });
  it('comprador registra pagamento simulado, retido até a conferência', async () => {
    await as(driver, USERS.comprador); await waitForText(driver, piece.nome);
    await clickLabeled(driver, `Pagar simulado ${piece.nome}`); await waitForText(driver, 'Pagamento simulado registrado e retido');
    const t = await current(transaction); assert.equal(t.status, 'paga'); assert.equal(t.pagamentoStatus, 'retido'); assert.equal(t.comissao, null);
    assert.equal((await step(transaction, USERS.comprador, 'pagamento')).status, 400);
    assert.equal((await step(transaction, USERS.comprador, 'cancelar', {})).status, 400);
  });
  it('não permite contornar o fluxo por RPC interna ou escrita direta na tabela', async () => {
    const token = await loginApi(USERS.comprador.email);
    const headers = { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/concluir_venda_conferida`, { method: 'POST', headers, body: JSON.stringify({ p_id: transaction.id }) });
    assert.ok([401, 403, 404].includes(r.status));
    const patch = await fetch(`${SUPABASE_URL}/rest/v1/transacoes?id=eq.${transaction.id}`, { method: 'PATCH', headers, body: JSON.stringify({ status: 'confirmada' }) });
    assert.ok([401, 403].includes(patch.status));
    assert.equal((await current(transaction)).pagamentoStatus, 'retido');
  });
  it('vendedor informa envio e comprador confirma recebimento pela interface', async () => {
    await as(driver, USERS.vendedor); await waitForText(driver, piece.nome);
    await clickLabeled(driver, `Registrar envio de ${piece.nome}`); await fill(driver, `entrega-${transaction.id}`, 'BR123456789');
    await clickLabeled(driver, `Salvar envio de ${piece.nome}`); await waitForText(driver, 'Envio registrado.');
    assert.equal((await step(transaction, USERS.vendedor, 'recebimento')).status, 403);
    await as(driver, USERS.comprador); await waitForText(driver, 'BR123456789');
    await clickLabeled(driver, `Receber ${piece.nome}`); await waitForText(driver, 'Recebimento confirmado.');
    const t = await current(transaction); assert.equal(t.status, 'em_conferencia'); assert.equal(t.pagamentoStatus, 'retido');
  });
  it('aprovação conclui a venda, transfere o passaporte e libera o valor líquido', async () => {
    await clickLabeled(driver, `Aprovar entrega de ${piece.nome}`); await acceptDialog(driver); await waitForText(driver, 'Entrega aprovada.');
    const t = await current(transaction); assert.equal(t.status, 'confirmada'); assert.equal(t.pagamentoStatus, 'liberado');
    assert.equal(t.comissao, 1234.57); assert.equal(t.repasse, 11111.10);
    const p = await requestAs(USERS.admin, `/pecas/${piece.id}`); assert.equal(p.data.proprietarioId, t.comprador.id); assert.equal(p.data.vendida, true); assert.equal(p.data.emNegociacao, false);
    await open(driver, `/peca/${piece.id}/passaporte`); await waitForText(driver, 'Beatriz Almeida');
    const text = await driver.findElement(By.css('body')).getText(); assert.match(text, /Beatriz Almeida\s*ATUAL/i);
  });
  it('preserva sequência de eventos e impede segunda aprovação ou estorno após liberação', async () => {
    const h = await requestAs(USERS.comprador, `/transacoes/${transaction.id}/historico`);
    assert.deepEqual(h.data.map((e) => e.situacao), ['pendente', 'aceita', 'paga', 'enviada', 'em_conferencia', 'confirmada']);
    assert.equal((await step(transaction, USERS.comprador, 'conferencia', { aprovada: true })).status, 400);
    assert.equal((await step(transaction, USERS.admin, 'resolucao', { decisao: 'estornar', motivo: 'Inválido' })).status, 400);
  });
  it('comprador contesta com motivo e mantém pagamento retido', async () => {
    refund = await prepareConference('Estorno');
    assert.equal((await step(refund, USERS.comprador, 'conferencia', { aprovada: false, motivo: ' ' })).status, 400);
    await as(driver, USERS.comprador); await waitForText(driver, `${prefix} Estorno`);
    await clickLabeled(driver, `Contestar entrega de ${prefix} Estorno`); await fill(driver, `entrega-${refund.id}`, 'Peça divergente do anúncio');
    await clickLabeled(driver, `Salvar contestar de ${prefix} Estorno`); await waitForText(driver, 'Entrega contestada.');
    const t = await current(refund); assert.equal(t.status, 'contestada'); assert.equal(t.pagamentoStatus, 'retido');
    assert.equal((await step(refund, USERS.vendedor, 'resolucao', { decisao: 'liberar', motivo: 'Não autorizado' })).status, 403);
  });
  it('administrador estorna contestação; não gera comissão nem transfere a peça', async () => {
    await as(driver, USERS.admin); await waitForText(driver, `${prefix} Estorno`);
    await clickLabeled(driver, `Estornar pagamento de ${prefix} Estorno`); await fill(driver, `entrega-${refund.id}`, 'Divergência confirmada; devolução acordada');
    await clickLabeled(driver, `Salvar estornar de ${prefix} Estorno`); await waitForText(driver, 'pagamento simulado estornado');
    const t = await current(refund); assert.equal(t.status, 'cancelada'); assert.equal(t.pagamentoStatus, 'estornado'); assert.equal(t.comissao, null);
    const p = await requestAs(USERS.admin, `/pecas/${refund.pecaId}`); assert.equal(p.data.vendida, false); assert.equal(p.data.proprietarioId, t.vendedor.id); assert.equal(p.data.emNegociacao, false);
  });
  it('administrador pode liberar contestação com justificativa registrada', async () => {
    release = await prepareConference('Liberacao');
    assert.equal((await step(release, USERS.comprador, 'conferencia', { aprovada: false, motivo: 'Solicita revisão' })).status, 200);
    assert.equal((await step(release, USERS.admin, 'resolucao', { decisao: 'liberar', motivo: '' })).status, 400);
    const r = await step(release, USERS.admin, 'resolucao', { decisao: 'liberar', motivo: 'Documentação e peça conferidas' });
    assert.equal(r.status, 200); assert.equal(r.data.status, 'confirmada'); assert.equal(r.data.pagamentoStatus, 'liberado'); assert.equal(r.data.resolucao, 'Documentação e peça conferidas');
  });
  it('aprovações simultâneas resultam em uma única conclusão e comissão', async () => {
    const t = await prepareConference('Concorrencia');
    const token = await loginApi(USERS.comprador.email);
    const results = await Promise.all([1, 2].map(() => fetch(`${API_URL}/api/transacoes/${t.id}/conferencia`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ aprovada: true }) })));
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 400]);
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
    const financial = await requestAs(USERS.admin, `/relatorios/financeiro?dataInicial=${date}&dataFinal=${date}`);
    assert.equal(financial.data.lancamentos.filter((l) => l.transacao_id === t.id).length, 1);
  });
});

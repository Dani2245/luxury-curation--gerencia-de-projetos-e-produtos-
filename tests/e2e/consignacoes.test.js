import assert from 'node:assert/strict';
import webdriver from 'selenium-webdriver';
import { USERS } from './helpers/config.js';
import { cleanupE2E, createPublishedPecaApi, requestAs, proposeApi, confirmSaleApi } from './helpers/api.js';
import {
  createDriver,
  loginAndWaitDashboard,
  clearSession,
  open,
  fill,
  select,
  clickButton,
  clickLabeled,
  waitForText,
  waitForPath,
} from './helpers/browser.js';
const { By } = webdriver;
const prefix = `E2E Consignacao ${Date.now()}`;
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
describe('RFC08 - Estoque em consignação (RFS25 a RFS28)', function () {
  let driver, piece, other, entry, vendedor;
  const body = (p, date = today) => ({
    pecaId: p.id,
    vendedorId: vendedor,
    entradaEm: date,
    condicoes: 'Comissão de 10%, devolução mediante solicitação',
  });
  before(async () => {
    piece = await createPublishedPecaApi({ nome: `${prefix} Relógio` });
    other = await createPublishedPecaApi({ nome: `${prefix} Joia`, categoria: 'joia' });
    const r = await requestAs(USERS.admin, '/consignacoes/pecas');
    assert.equal(r.status, 200, JSON.stringify(r.data));
    vendedor = r.data.find((p) => p.id === piece.id).vendedor_id;
    driver = await createDriver();
  });
  after(async () => {
    if (driver) await driver.quit();
    await cleanupE2E(prefix);
  });
  it('restringe tela, cadastro, edição, baixa e histórico ao administrador', async () => {
    await loginAndWaitDashboard(driver, USERS.comprador.email);
    await open(driver, '/dashboard/consignacoes');
    await waitForPath(driver, '/dashboard');
    for (const u of [USERS.comprador, USERS.vendedor, USERS.perito])
      for (const [path, method, b] of [
        ['', 'GET'],
        ['', 'POST', body(piece)],
        ['/1', 'PATCH', { condicoes: 'x' }],
        ['/1/devolucao', 'POST', { saidaEm: today, observacao: 'x' }],
        ['/1/historico', 'GET'],
      ])
        assert.equal((await requestAs(u, `/consignacoes${path}`, { method, body: b })).status, 403);
    await clearSession(driver);
    await loginAndWaitDashboard(driver, USERS.admin.email);
    await open(driver, '/dashboard/consignacoes');
    await waitForText(driver, 'Receber peça');
  });
  it('exige peça e condições e rejeita data futura ou consignante diferente', async () => {
    await clickButton(driver, 'Registrar consignação');
    assert.equal(await driver.executeScript('return document.getElementById("co-peca").checkValidity()'), false);
    for (const patch of [
      { condicoes: ' ' },
      { entradaEm: '2100-01-01' },
      { vendedorId: '00000000-0000-4000-8000-000000000001' },
    ])
      assert.equal(
        (await requestAs(USERS.admin, '/consignacoes', { method: 'POST', body: { ...body(piece), ...patch } })).status,
        400,
      );
  });
  it('registra recebimento com vendedor, data e condições pela interface', async () => {
    await select(driver, 'co-peca', String(piece.id));
    assert.ok((await driver.findElement(By.id('co-vendedor')).getAttribute('value')).length);
    await fill(driver, 'co-condicoes', body(piece).condicoes);
    await clickButton(driver, 'Registrar consignação');
    await waitForText(driver, 'Consignação registrada.');
    const r = await requestAs(USERS.admin, `/consignacoes?peca=${piece.id}`);
    entry = r.data[0];
    assert.equal(entry.vendedor_id, vendedor);
    assert.equal(entry.status, 'em estoque');
  });
  it('impede recebimentos duplicados e exclusão da peça com histórico', async () => {
    assert.equal((await requestAs(USERS.admin, '/consignacoes', { method: 'POST', body: body(piece) })).status, 409);
    assert.equal((await requestAs(USERS.vendedor, `/pecas/${piece.id}`, { method: 'DELETE' })).status, 409);
  });
  it('consulta por nome e situação e ordena entradas da mais antiga para a mais recente', async () => {
    assert.equal(
      (await requestAs(USERS.admin, '/consignacoes', { method: 'POST', body: body(other, '2020-01-01') })).status,
      201,
    );
    await fill(driver, 'co-filtro', prefix);
    await select(driver, 'co-status', 'em estoque');
    await clickButton(driver, 'Buscar');
    await waitForText(driver, `${prefix} Joia`);
    const r = await requestAs(USERS.admin, `/consignacoes?peca=${encodeURIComponent(prefix)}`);
    assert.deepEqual(
      r.data.map((c) => c.peca_id),
      [other.id, piece.id],
    );
  });
  it('edita condições em estoque e preserva o acordo anterior no histórico', async () => {
    await clickLabeled(driver, `Editar consignação ${entry.id}`);
    await fill(driver, 'co-edicao', 'Comissão negociada de 8%');
    await clickButton(driver, 'Salvar consignação');
    await waitForText(driver, 'Condições atualizadas.');
    await clickLabeled(driver, `Histórico da consignação ${entry.id}`);
    await waitForText(driver, 'Comissão negociada de 8%');
    const r = await requestAs(USERS.admin, `/consignacoes/${entry.id}/historico`);
    assert.equal(r.data.length, 2);
    assert.equal(r.data[1].anterior.condicoes, body(piece).condicoes);
  });
  it('rejeita devolução anterior à entrada e registra baixa sem excluir histórico', async () => {
    assert.equal(
      (
        await requestAs(USERS.admin, `/consignacoes/${entry.id}/devolucao`, {
          method: 'POST',
          body: { saidaEm: '2000-01-01', observacao: 'Teste' },
        })
      ).status,
      400,
    );
    await clickLabeled(driver, `Devolver consignação ${entry.id}`);
    await fill(driver, 'co-motivo', 'Retirada pelo consignante');
    await clickButton(driver, 'Salvar consignação');
    await waitForText(driver, 'Devolução registrada.');
    await select(driver, 'co-status', 'devolucao');
    await clickButton(driver, 'Buscar');
    await waitForText(driver, 'Retirada pelo consignante');
    const r = await requestAs(USERS.admin, `/consignacoes/${entry.id}/historico`);
    assert.equal(r.data.length, 3);
    assert.equal(r.data[2].acao, 'devolucao');
  });
  it('bloqueia edição e segunda baixa após encerramento e permite nova entrada', async () => {
    assert.equal(
      (
        await requestAs(USERS.admin, `/consignacoes/${entry.id}`, {
          method: 'PATCH',
          body: { condicoes: 'Alteração indevida' },
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await requestAs(USERS.admin, `/consignacoes/${entry.id}/devolucao`, {
          method: 'POST',
          body: { saidaEm: today, observacao: 'Repetida' },
        })
      ).status,
      400,
    );
    const r = await requestAs(USERS.admin, '/consignacoes', { method: 'POST', body: body(piece) });
    assert.equal(r.status, 201);
    entry = { ...entry, id: r.data.id };
  });
  it('mantém estoque durante negociação e dá baixa somente após conferência e pagamento liberado', async () => {
    const t = await proposeApi(piece.id, 50000);
    assert.equal(
      (
        await requestAs(USERS.admin, `/consignacoes/${entry.id}/devolucao`, {
          method: 'POST',
          body: { saidaEm: today, observacao: 'Não pode devolver' },
        })
      ).status,
      400,
    );
    const before = await requestAs(USERS.admin, `/consignacoes?peca=${piece.id}&status=em%20estoque`);
    assert.equal(before.data.length, 1);
    await confirmSaleApi(t.id);
    const r = await requestAs(USERS.admin, `/consignacoes?peca=${piece.id}&status=venda`);
    assert.equal(r.data.length, 1);
    assert.equal(r.data[0].transacao_id, t.id);
    await select(driver, 'co-status', 'venda');
    await clickButton(driver, 'Buscar');
    await waitForText(driver, `Transação #${t.id}`);
    assert.equal((await requestAs(USERS.admin, '/consignacoes', { method: 'POST', body: body(piece) })).status, 400);
  });
});

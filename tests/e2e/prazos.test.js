import assert from 'node:assert/strict';
import webdriver from 'selenium-webdriver';
import { USERS } from './helpers/config.js';
import { adjustDeadlineApi, cleanupE2E, createPublishedPecaApi, proposeApi, requestAs } from './helpers/api.js';
import {
  clearSession, clickButton, clickLabeled, createDriver, fill, loginAndWaitDashboard, open, select, waitForText
} from './helpers/browser.js';

const { By, until } = webdriver;

const stamp = Date.now();
const prefix = `E2E Prazo ${stamp}`;
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const DIA = 24 * 60 * 60 * 1000;
const dataBR = (iso) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });

const step = (t, user, path, body) => requestAs(user, `/transacoes/${t.id}/${path}`, { method: 'POST', body });
const current = async (t) => (await requestAs(USERS.admin, `/transacoes?peca=${t.pecaId}`)).data.find((x) => x.id === t.id);
const advance = async (t, ...etapas) => {
  const fluxo = {
    aceita: [USERS.vendedor, 'confirmar', {}],
    paga: [USERS.comprador, 'pagamento'],
    enviada: [USERS.vendedor, 'envio', { rastreio: 'E2E rastreio prazo' }],
    recebida: [USERS.comprador, 'recebimento']
  };
  for (const etapa of etapas) {
    const [user, path, body] = fluxo[etapa];
    const r = await step(t, user, path, body);
    assert.equal(r.status, 200, `${etapa}: ${r.data?.message}`);
  }
};
const nova = async (sufixo) => {
  const peca = await createPublishedPecaApi({ nome: `${prefix} ${sufixo}`, categoria: 'joia', valor: 2000 });
  return proposeApi(peca.id, 2000);
};

const asUser = async (driver, user, path = '/dashboard/transacoes') => {
  await clearSession(driver);
  await loginAndWaitDashboard(driver, user.email);
  await open(driver, path);
};
const prazoText = async (driver, t) =>
  (await driver.wait(until.elementLocated(By.css(`[data-testid="prazo-${t.id}"]`)), 10000)).getText();
const statusText = async (driver, esperado) => {
  await driver.wait(async () => {
    const status = await driver.findElements(By.css('[role="status"]'));
    return status.length > 0 && (await status[0].getText()).includes(esperado);
  }, 10000, `Mensagem não exibida: ${esperado}`);
};

// RFC12/RFC13 - prazos da conferência e da disputa (RFS37 a RFS39), pagamentos por status e período (RFS42)
// e exclusão da retenção registrada por erro (RFS44)
describe('RFC12/RFC13 - Prazos da conferência e pagamentos retidos', function () {
  let driver;
  let principal;
  let atrasada;
  let retencao;

  before(async () => {
    principal = await nova('Colar');
    atrasada = await nova('Anel');
    retencao = await nova('Brinco');
    driver = await createDriver();
  });

  after(async () => {
    if (driver) await driver.quit();
    await cleanupE2E(prefix);
  });

  describe('RFS37 - Inserir Conferência: prazo declarado na transação', () => {
    it('o prazo de conferência deve ser de 1 a 30 dias', async () => {
      const r = await step(principal, USERS.vendedor, 'confirmar', { prazoConferenciaDias: 45 });
      assert.equal(r.status, 400);
      assert.equal(r.data.message, 'O prazo de conferência deve ser de 1 a 30 dias');
      assert.equal((await current(principal)).status, 'pendente');
    });

    it('o vendedor declara o prazo de conferência ao aceitar a proposta', async () => {
      await asUser(driver, USERS.vendedor);
      await waitForText(driver, `${prefix} Colar`);
      await clickLabeled(driver, `Aceitar proposta de ${prefix} Colar`);
      await driver.wait(until.alertIsPresent(), 5000);
      const prompt = await driver.switchTo().alert();
      assert.match(await prompt.getText(), /prazo de conferência/i);
      await prompt.sendKeys('3');
      await prompt.accept();
      await statusText(driver, 'Proposta aceita.');
      assert.match(await prazoText(driver, principal), /Prazo de conferência: 3 dias após o recebimento/);
      assert.equal((await current(principal)).prazoConferenciaDias, 3);
    });

    it('sem prazo informado, vale o padrão da plataforma (7 dias)', async () => {
      await advance(atrasada, 'aceita');
      assert.equal((await current(atrasada)).prazoConferenciaDias, 7);
    });

    it('o recebimento abre o prazo de conferência para o comprador', async () => {
      await advance(principal, 'paga', 'enviada');
      await asUser(driver, USERS.comprador);
      await clickLabeled(driver, `Receber ${prefix} Colar`);
      await statusText(driver, 'Recebimento confirmado.');
      const t = await current(principal);
      assert.equal(t.status, 'em_conferencia');
      assert.ok(Math.abs(new Date(t.conferenciaAte) - new Date(t.recebidaEm) - 3 * DIA) < 1000, 'prazo de 3 dias após o recebimento');
      assert.match(await prazoText(driver, principal), new RegExp(`Conferir até ${dataBR(t.conferenciaAte)}`));
      assert.equal(t.prazoSituacao, 'no prazo');
    });
  });

  describe('RFS38 - Consultar Conferência: disputas perto da data limite', () => {
    it('destaca a conferência perto da data limite', async () => {
      await adjustDeadlineApi(principal.id, 20);
      await asUser(driver, USERS.comprador);
      assert.match(await prazoText(driver, principal), /Perto da data limite/);
    });

    it('o administrador filtra só as conferências e disputas perto do prazo', async () => {
      await asUser(driver, USERS.admin);
      await fill(driver, 't-peca', prefix);
      await driver.findElement(By.id('t-prazo')).click();
      await clickButton(driver, 'Buscar');
      await driver.wait(until.elementLocated(By.css(`[data-testid="transacao-${principal.id}"]`)), 10000);
      await driver.wait(async () => (await driver.findElements(By.css(`[data-testid="transacao-${retencao.id}"]`))).length === 0, 10000,
        'proposta sem prazo em aberto não deve aparecer');

      const { status, data } = await requestAs(USERS.admin, `/transacoes?prazo=proximo&peca=${encodeURIComponent(prefix)}`);
      assert.equal(status, 200);
      assert.deepEqual(data.map((t) => t.id), [principal.id]);
    });
  });

  describe('RFS39 - Editar Conferência: dentro do prazo e decisão em até 5 dias', () => {
    it('a contestação registra o estado observado e abre o prazo de 5 dias para a decisão', async () => {
      await asUser(driver, USERS.comprador);
      await clickLabeled(driver, `Contestar entrega de ${prefix} Colar`);
      await fill(driver, `entrega-${principal.id}`, 'Fecho diferente do anunciado');
      await fill(driver, `estado-${principal.id}`, 'Fecho trocado, corrente sem marcas');
      await clickLabeled(driver, `Salvar contestar de ${prefix} Colar`);
      await statusText(driver, 'Entrega contestada.');

      const t = await current(principal);
      assert.equal(t.status, 'contestada');
      assert.equal(t.estadoObservado, 'Fecho trocado, corrente sem marcas');
      assert.ok(Math.abs(new Date(t.decisaoAte) - new Date(t.conferidaEm) - 5 * DIA) < 1000, 'decisão em até 5 dias');
      const texto = await prazoText(driver, principal);
      assert.match(texto, new RegExp(`Decisão até ${dataBR(t.decisaoAte)}`));
      assert.match(await driver.findElement(By.css(`[data-testid="transacao-${principal.id}"]`)).getText(), /Estado observado: Fecho trocado, corrente sem marcas/);
    });

    it('a disputa sem decisão no prazo aparece vencida para o administrador', async () => {
      await adjustDeadlineApi(principal.id, -1);
      await asUser(driver, USERS.admin);
      assert.match(await prazoText(driver, principal), /Prazo vencido/);
      const r = await step(principal, USERS.admin, 'resolucao', { decisao: 'estornar', motivo: 'Fecho divergente confirmado' });
      assert.equal(r.status, 200, r.data?.message);
      assert.equal(r.data.pagamentoStatus, 'estornado');
    });

    it('depois do prazo, a entrega não pode mais ser contestada', async () => {
      await advance(atrasada, 'paga', 'enviada', 'recebida');
      await adjustDeadlineApi(atrasada.id, -1);
      const r = await step(atrasada, USERS.comprador, 'conferencia', { aprovada: false, motivo: 'Fora do prazo' });
      assert.equal(r.status, 400);
      assert.match(r.data.message, /^O prazo de conferência terminou em \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}\. A entrega não pode mais ser contestada$/);

      await asUser(driver, USERS.comprador);
      assert.match(await prazoText(driver, atrasada), /Prazo vencido/);
      assert.equal((await driver.findElements(By.css(`[aria-label="Contestar entrega de ${prefix} Anel"]`))).length, 0);
    });

    it('vencido o prazo sem conferência, o administrador libera o pagamento com justificativa', async () => {
      const dentro = await step(retencao, USERS.admin, 'resolucao', { decisao: 'liberar', motivo: 'x' });
      assert.equal(dentro.status, 400, 'sem prazo vencido não há o que liberar');

      await asUser(driver, USERS.admin);
      await clickLabeled(driver, `Liberar pagamento de ${prefix} Anel`);
      await fill(driver, `entrega-${atrasada.id}`, 'Comprador não conferiu no prazo');
      await clickLabeled(driver, `Salvar liberar de ${prefix} Anel`);
      await statusText(driver, 'Prazo de conferência vencido: venda concluída');
      const t = await current(atrasada);
      assert.equal(t.status, 'confirmada');
      assert.equal(t.pagamentoStatus, 'liberado');
      assert.equal(t.resolucao, 'Comprador não conferiu no prazo');
    });
  });

  describe('RFS44 - Remover Pagamento Retido registrado por erro', () => {
    it('o administrador exclui a retenção antes do envio e a transação volta a aguardar o pagamento', async () => {
      await advance(retencao, 'aceita', 'paga');
      assert.equal((await requestAs(USERS.comprador, `/transacoes/${retencao.id}/pagamento`, { method: 'DELETE', body: { motivo: 'x' } })).status, 403);

      await asUser(driver, USERS.admin);
      await clickLabeled(driver, `Excluir retenção de ${prefix} Brinco`);
      await fill(driver, `entrega-${retencao.id}`, 'Pagamento registrado em duplicidade');
      await clickLabeled(driver, `Salvar excluir de ${prefix} Brinco`);
      await statusText(driver, 'Retenção excluída.');

      const t = await current(retencao);
      assert.equal(t.status, 'aceita');
      assert.equal(t.pagamentoStatus, null);
      const historico = await requestAs(USERS.admin, `/transacoes/${retencao.id}/historico`);
      assert.ok(historico.data.some((e) => e.descricao === 'Retenção excluída por erro: Pagamento registrado em duplicidade'));
    });

    it('não exclui a retenção depois do envio nem a liberada', async () => {
      await advance(retencao, 'paga', 'enviada');
      for (const t of [retencao, atrasada]) {
        const r = await requestAs(USERS.admin, `/transacoes/${t.id}/pagamento`, { method: 'DELETE', body: { motivo: 'Erro' } });
        assert.equal(r.status, 400);
      }
    });
  });

  describe('RFS42 - Consultar Pagamento Retido por status e período', () => {
    it('o administrador filtra os pagamentos simulados por status e período', async () => {
      await asUser(driver, USERS.admin, '/dashboard/relatorios');
      await clickButton(driver, 'Financeiro');
      await waitForText(driver, 'Pagamentos simulados');
      await fill(driver, 'p-inicio', today.split('-').reverse().join(''));
      await fill(driver, 'p-fim', today.split('-').reverse().join(''));
      await select(driver, 'p-status', 'retido');
      await clickButton(driver, 'Filtrar pagamentos');
      const linha = await driver.wait(until.elementLocated(By.css(`[data-testid="pagamento-${retencao.id}"]`)), 10000);
      assert.match(await linha.getText(), new RegExp(`${prefix} Brinco[\\s\\S]*retido`, 'i'));
      await driver.wait(async () => (await driver.findElements(By.css(`[data-testid="pagamento-${atrasada.id}"]`))).length === 0, 10000,
        'o pagamento liberado não deve aparecer no filtro de retidos');

      const liberados = await requestAs(USERS.admin, `/relatorios/pagamentos?dataInicial=${today}&dataFinal=${today}&status=liberado`);
      assert.equal(liberados.status, 200);
      assert.ok(liberados.data.pagamentos.some((p) => p.transacaoId === atrasada.id));
      assert.ok(liberados.data.pagamentos.every((p) => p.status === 'liberado'));
      const antigo = await requestAs(USERS.admin, '/relatorios/pagamentos?dataInicial=2001-01-01&dataFinal=2001-01-31');
      assert.equal(antigo.data.pagamentos.length, 0);
      assert.equal((await requestAs(USERS.admin, '/relatorios/pagamentos?status=x')).status, 400);
      assert.equal((await requestAs(USERS.vendedor, '/relatorios/pagamentos')).status, 403);
    });
  });
});

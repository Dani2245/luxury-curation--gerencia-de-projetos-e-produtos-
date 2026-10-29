import assert from 'node:assert/strict';
import webdriver from 'selenium-webdriver';
import { USERS } from './helpers/config.js';
import { cleanupE2E, createPublishedPecaApi, proposeApi, confirmSaleApi, requestAs } from './helpers/api.js';
import { createDriver, loginAndWaitDashboard, open, fill, select, clickButton, clickLabeled, waitForText } from './helpers/browser.js';

const { By, until } = webdriver;
const prefix = `E2E Relatorios ${Date.now()}`;
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const period = `dataInicial=${today}&dataFinal=${today}`;
const historical = 'dataInicial=2001-01-01&dataFinal=2001-01-31';
const cents = (v) => Math.round(Number(v) * 100);
const report = async (kind, query = period) => {
  const r = await requestAs(USERS.admin, `/relatorios/${kind}?${query}`);
  assert.equal(r.status, 200, r.data?.message); return r.data;
};

describe('RF01, RF02 e RFC11 - Relatórios e contas', function () {
  let driver, baseline, financeBaseline, sale, revenueId, expenseId;
  before(async () => {
    baseline = await report('transacoes'); financeBaseline = await report('financeiro', historical);
    for (const [categoria, valor] of [['joia', 1000.10], ['relógio', 2500.20], ['obra de arte', 90.30]]) {
      const p = await createPublishedPecaApi({ nome: `${prefix} ${categoria}`, categoria, valor });
      const t = await proposeApi(p.id, valor);
      if (categoria === 'relógio') sale = await confirmSaleApi(t.id);
      if (categoria === 'obra de arte') await requestAs(USERS.comprador, `/transacoes/${t.id}/cancelar`, { method: 'POST', body: {} });
    }
    driver = await createDriver(); await loginAndWaitDashboard(driver, USERS.admin.email);
  });
  after(async () => { if (driver) await driver.quit(); await cleanupE2E(prefix); });

  it('restringe os relatórios e lançamentos a administradores', async () => {
    for (const user of [USERS.comprador, USERS.vendedor, USERS.perito]) {
      assert.equal((await requestAs(user, `/relatorios/transacoes?${period}`)).status, 403);
      assert.equal((await requestAs(user, `/relatorios/financeiro?${period}`)).status, 403);
      assert.equal((await requestAs(user, '/relatorios/lancamentos', { method: 'POST', body: {} })).status, 403);
    }
  });
  it('agrupa transações por categoria com subtotais e total exatos', async () => {
    const r = await report('transacoes');
    assert.equal(r.quantidade - baseline.quantidade, 3);
    assert.equal(cents(r.total) - cents(baseline.total), 359060);
    for (const [cat, value] of [['joia', 100010], ['relógio', 250020], ['obra de arte', 9030]]) {
      const previous = baseline.grupos.find((g) => g.categoria === cat)?.subtotal || 0;
      assert.equal(cents(r.grupos.find((g) => g.categoria === cat).subtotal) - cents(previous), value);
    }
    assert.equal(cents(r.vendasConcluidas) - cents(baseline.vendasConcluidas), 250020);
  });
  it('filtra categoria, situação e período sem confundir propostas com vendas concluídas', async () => {
    const r = await report('transacoes', `${period}&categoria=${encodeURIComponent('relógio')}&status=confirmada`);
    assert.ok(r.grupos.every((g) => g.categoria === 'relógio' && g.transacoes.every((t) => t.status === 'confirmada')));
    assert.ok(r.grupos[0].transacoes.some((t) => t.id === sale.id));
    const other = await report('transacoes', historical);
    assert.ok(other.grupos.every((g) => g.transacoes.every((t) => !t.peca.startsWith(prefix))));
  });
  it('mostra o relatório agrupado e o filtro de categoria no navegador', async () => {
    await open(driver, '/dashboard/relatorios'); await waitForText(driver, `${prefix} relógio`);
    await select(driver, 'r-categoria', 'joia'); await clickButton(driver, 'Gerar relatório');
    await driver.wait(async () => (await driver.findElements(By.css('[data-testid="subtotal-joia"]'))).length === 1 && (await driver.findElements(By.css('[data-testid="subtotal-relógio"]'))).length === 0, 10000);
    assert.match(await driver.findElement(By.css('[data-testid="r-total"]')).getText(), /R\$/);
  });
  it('rejeita datas inválidas, período invertido e categorias desconhecidas', async () => {
    for (const q of ['dataInicial=2026-02-31&dataFinal=2026-03-01', 'dataInicial=2026-10-30&dataFinal=2026-10-01', `${period}&categoria=carro`]) {
      assert.equal((await requestAs(USERS.admin, `/relatorios/transacoes?${q}`)).status, 400);
    }
    assert.equal((await requestAs(USERS.admin, '/relatorios/financeiro')).status, 400);
  });
  it('registra a comissão apenas na conclusão e não trata o valor total como receita', async () => {
    const r = await report('financeiro');
    const rows = r.lancamentos.filter((l) => l.transacao_id === sale.id);
    assert.equal(rows.length, 1); assert.equal(rows[0].categoria, 'comissao_venda'); assert.equal(cents(rows[0].valor), 25002); assert.equal(rows[0].status, 'liquidado');
    assert.equal((await requestAs(USERS.admin, `/relatorios/lancamentos/${rows[0].id}`, { method: 'PATCH', body: { acao: 'cancelar', motivo: 'Não deve permitir' } })).status, 400);
  });
  it('registra uma conta a receber pela interface', async () => {
    await clickButton(driver, 'Financeiro'); await waitForText(driver, 'Registrar conta');
    await fill(driver, 'f-descricao', `${prefix} Emissão`); await fill(driver, 'f-valor', '125.50');
    await fill(driver, 'f-competencia', '10012001'); await fill(driver, 'f-vencimento', '20012001');
    await clickButton(driver, 'Registrar lançamento'); await waitForText(driver, 'Lançamento registrado.');
    const r = await report('financeiro', historical);
    const entry = r.lancamentos.find((l) => l.descricao === `${prefix} Emissão`);
    assert.ok(entry); revenueId = entry.id;
    assert.equal(cents(r.aReceber) - cents(financeBaseline.aReceber), 12550);
  });
  it('registra despesa e calcula contas a pagar e resultado previsto', async () => {
    const r = await requestAs(USERS.admin, '/relatorios/lancamentos', { method: 'POST', body: { tipo: 'despesa', categoria: 'comissao_perito', descricao: `${prefix} Perícia`, valor: 40.25, competencia: '2001-01-10', vencimento: '2001-01-20' } });
    assert.equal(r.status, 201); expenseId = r.data.id;
    const f = await report('financeiro', historical);
    assert.equal(cents(f.aPagar) - cents(financeBaseline.aPagar), 4025);
    assert.equal(cents(f.resultadoPrevisto) - cents(financeBaseline.resultadoPrevisto), 8525);
    assert.equal(cents(f.saldoRealizado), cents(financeBaseline.saldoRealizado));
  });
  it('liquida o recebimento pela interface e atualiza os totais', async () => {
    await fill(driver, 'r-inicio', '01012001'); await fill(driver, 'r-fim', '31012001'); await clickButton(driver, 'Gerar relatório');
    await waitForText(driver, `${prefix} Emissão`); await clickLabeled(driver, `Liquidar lançamento ${revenueId}`); await waitForText(driver, 'Lançamento liquidado.');
    const f = await report('financeiro', historical);
    assert.equal(cents(f.aReceber), cents(financeBaseline.aReceber));
    assert.equal(cents(f.recebido) - cents(financeBaseline.recebido), 12550);
    assert.equal((await requestAs(USERS.admin, `/relatorios/lancamentos/${revenueId}`, { method: 'PATCH', body: { acao: 'liquidar' } })).status, 400);
  });
  it('cancela uma despesa em aberto sem apagá-la e mantém auditoria', async () => {
    await clickLabeled(driver, `Cancelar lançamento ${expenseId}`); await driver.wait(until.alertIsPresent(), 5000);
    await driver.switchTo().alert().sendKeys('Serviço não realizado'); await driver.switchTo().alert().accept();
    await waitForText(driver, 'Lançamento cancelado.');
    const f = await report('financeiro', historical);
    assert.equal(cents(f.aPagar), cents(financeBaseline.aPagar));
    assert.equal(f.lancamentos.find((l) => l.id === expenseId).status, 'cancelado');
    await clickLabeled(driver, `Histórico do lançamento ${expenseId}`); await waitForText(driver, 'Histórico:');
    const audit = await requestAs(USERS.admin, `/relatorios/lancamentos/${expenseId}/historico`);
    assert.deepEqual(audit.data.map((e) => e.acao), ['criacao', 'cancelamento']);
  });
  it('rejeita valor negativo, precisão inválida e categoria incompatível', async () => {
    const base = { tipo: 'receita', categoria: 'emissao_passaporte', descricao: `${prefix} Inválido`, valor: 10, competencia: '2001-01-10', vencimento: '2001-01-20' };
    for (const patch of [{ valor: -1 }, { valor: 0.001 }, { categoria: 'comissao_perito' }, { categoria: 'comissao_venda' }]) {
      assert.equal((await requestAs(USERS.admin, '/relatorios/lancamentos', { method: 'POST', body: { ...base, ...patch } })).status, 400);
    }
  });
  it('filtra receitas e despesas por categoria no relatório financeiro', async () => {
    const f = await report('financeiro', `${historical}&tipo=receita&categoria=emissao_passaporte`);
    assert.ok(f.lancamentos.every((l) => l.tipo === 'receita' && l.categoria === 'emissao_passaporte'));
    assert.ok(f.lancamentos.some((l) => l.id === revenueId));
  });
});

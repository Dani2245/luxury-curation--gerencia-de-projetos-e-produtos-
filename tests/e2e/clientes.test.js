import assert from 'node:assert/strict';
import webdriver from 'selenium-webdriver';
import { USERS, PASSWORD } from './helpers/config.js';
import {
  requestAs,
  createPublishedPecaApi,
  issuePassportApi,
  cleanupE2E,
  createUserApi,
  deleteUsersByEmail,
} from './helpers/api.js';
import { rpcAs } from './helpers/release3.js';
import {
  createDriver,
  loginAndWaitDashboard,
  clearSession,
  open,
  fill,
  select,
  clickButton,
  waitForText,
  waitForPath,
} from './helpers/browser.js';
const { By } = webdriver;
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const prefix = `E2E Clientes ${Date.now()}`;
const novo = {
  email: `e2e-health-${Date.now()}@example.invalid`,
  nome: `${prefix} Novo vendedor`,
  perfil: 'Vendedor',
  senha: PASSWORD,
};
describe('RFC14, RFC15 e RF03 - Onboarding e saúde da base', function () {
  let driver, piece, config;
  const report = `/clientes/saude?dataInicial=${today.slice(0, 8)}01&dataFinal=${today}`;
  before(async () => {
    piece = await createPublishedPecaApi({ nome: `${prefix} Relógio` });
    driver = await createDriver();
    config = (await requestAs(USERS.admin, '/clientes/health-config')).data;
  });
  after(async () => {
    if (config?.id)
      assert.equal(
        (
          await requestAs(USERS.admin, '/clientes/health-config', {
            method: 'PUT',
            body: { ...config, motivo: `${prefix} restauração da configuração` },
          })
        ).status,
        204,
      );
    if (driver) await driver.quit();
    await cleanupE2E(prefix);
    await deleteUsersByEmail(novo.email);
  });
  it('uma conta nova tem onboarding vazio e pontua somente um dia de login, sem duplicar sessões', async () => {
    assert.equal((await createUserApi(novo)).status, 201);
    const steps = await requestAs(novo, '/clientes/onboarding');
    assert.deepEqual(steps.data.pecas, []);
    const h = (await requestAs(novo, '/clientes/meu-health')).data;
    assert.equal(h.diasAtivos, 1);
    assert.equal(h.usoPassaporte, false);
    assert.equal(h.fluxoConcluido, false);
    assert.equal(Number(h.pontuacao), Math.round((config.peso_atividade / config.dias_meta) * 10) / 10);
    assert.equal((await requestAs(novo, '/clientes/meu-health')).data.diasAtivos, 1);
    assert.equal(
      steps.data.pecas.some((p) => p.id === piece.id),
      false,
    );
  });
  it('onboarding mostra etapas reais da peça e orienta pendências', async () => {
    await loginAndWaitDashboard(driver, USERS.vendedor.email);
    await open(driver, '/dashboard/onboarding');
    await waitForText(driver, 'Primeiros passos do vendedor');
    await waitForText(driver, piece.nome);
    const r = await requestAs(USERS.vendedor, '/clientes/onboarding');
    const p = r.data.pecas.find((p) => p.id === piece.id);
    assert.equal(p.passaporte, false);
    assert.equal(p.fotografias, false);
    assert.equal(p.notaFiscal, false);
    assert.equal(p.publicacao, 'publicada');
    const card = await driver.findElement(By.css(`[data-testid="onboarding-${piece.id}"]`));
    assert.match(await card.getText(), /2 de 4 etapas/);
  });
  it('atualiza automaticamente o checklist após emissão do passaporte', async () => {
    await issuePassportApi(piece.id);
    await open(driver, '/dashboard/onboarding');
    await waitForText(driver, piece.nome);
    const card = await driver.findElement(By.css(`[data-testid="onboarding-${piece.id}"]`));
    assert.match(await card.getText(), /3 de 4 etapas/);
    assert.equal(
      (await requestAs(USERS.vendedor, '/clientes/onboarding')).data.pecas.find((p) => p.id === piece.id).passaporte,
      true,
    );
  });
  it('protege onboarding, relatório e configuração de perfis indevidos', async () => {
    for (const user of [USERS.comprador, USERS.perito, USERS.admin])
      assert.equal((await requestAs(user, '/clientes/onboarding')).status, 403);
    for (const user of [USERS.comprador, USERS.vendedor, USERS.perito]) {
      assert.equal((await requestAs(user, report)).status, 403);
      assert.equal((await requestAs(user, '/clientes/health-config')).status, 403);
      assert.equal((await rpcAs(user, 'relatorio_saude_base', { p_inicio: today, p_fim: today })).status, 403);
      assert.equal((await rpcAs(user, 'health_sinais', { p_inicio: today, p_fim: today })).status, 403);
    }
    await clearSession(driver);
    await loginAndWaitDashboard(driver, USERS.comprador.email);
    await open(driver, '/dashboard/onboarding');
    await waitForPath(driver, '/dashboard');
  });
  it('mostra pontuação própria, período e fórmula sem expor outras contas', async () => {
    await open(driver, '/dashboard/saude');
    await waitForText(driver, 'Meu Health Score');
    await waitForText(driver, 'Como a pontuação é calculada');
    const r = await requestAs(USERS.comprador, '/clientes/meu-health');
    assert.equal(r.status, 200);
    const d = r.data,
      c = d.config;
    const expected =
      Math.round(
        (c.peso_atividade * Math.min(d.diasAtivos / c.dias_meta, 1) +
          (d.usoPassaporte ? c.peso_passaporte : 0) +
          (d.fluxoConcluido ? c.peso_fluxo : 0)) *
          10,
      ) / 10;
    assert.equal(Number(d.pontuacao), expected);
    assert.equal(Object.hasOwn(d, 'usuario_id'), false);
    assert.ok(d.pontuacao >= 0 && d.pontuacao <= 100);
    assert.equal((await driver.findElements(By.id('hs-motivo'))).length, 0);
  });
  it('RF03 consolida contas por perfil e faixa sem nomes, e-mails ou eventos individuais', async () => {
    await clearSession(driver);
    await loginAndWaitDashboard(driver, USERS.admin.email);
    await open(driver, '/dashboard/saude');
    await waitForText(driver, 'Saúde da base de clientes');
    await waitForText(driver, 'Como a pontuação é calculada');
    const r = await requestAs(USERS.admin, report);
    assert.equal(r.status, 200);
    assert.equal(
      r.data.total,
      r.data.grupos.reduce((n, g) => n + g.quantidade, 0),
    );
    assert.ok(r.data.ativos <= r.data.total);
    const serialized = JSON.stringify(r.data);
    for (const user of Object.values(USERS)) {
      assert.equal(serialized.includes(user.email), false);
      assert.equal(serialized.includes(user.nome), false);
    }
    await select(driver, 'hs-perfil', 'Perito');
    await clickButton(driver, 'Consultar saúde');
    await waitForText(driver, 'Perito');
    const filtered = await requestAs(USERS.admin, `${report}&perfil=Perito`);
    assert.ok(filtered.data.grupos.every((g) => g.perfil === 'Perito'));
  });
  it('trata coorte vazia sem inventar média e rejeita períodos inválidos', async () => {
    const r = await requestAs(USERS.admin, `${report}&coorte=1900-01`);
    assert.equal(r.status, 200);
    assert.equal(r.data.total, 0);
    assert.equal(r.data.media, null);
    assert.deepEqual(r.data.grupos, []);
    assert.equal(
      (await requestAs(USERS.admin, '/clientes/saude?dataInicial=2026-11-02&dataFinal=2026-11-01')).status,
      400,
    );
    assert.equal((await requestAs(USERS.admin, `${report}&coorte=2026-99`)).status, 400);
  });
  it('rejeita pesos que não somam 100 e faixas invertidas', async () => {
    for (const patch of [
      { peso_atividade: 101 },
      { peso_fluxo: 0, peso_atividade: 0, peso_passaporte: 0 },
      { limite_atencao: 80, limite_saudavel: 70 },
      { motivo: '' },
    ])
      assert.equal(
        (
          await requestAs(USERS.admin, '/clientes/health-config', {
            method: 'PUT',
            body: { ...config, motivo: 'Teste', ...patch },
          })
        ).status,
        400,
      );
  });
  it('altera parâmetros com justificativa e mantém versões no histórico', async () => {
    await fill(driver, 'hs-peso_atividade', '50');
    await fill(driver, 'hs-peso_passaporte', '25');
    await fill(driver, 'hs-peso_fluxo', '25');
    await fill(driver, 'hs-motivo', `${prefix} ajuste de pesos`);
    await clickButton(driver, 'Salvar regras');
    await waitForText(driver, 'Regras atualizadas com histórico.');
    await clickButton(driver, 'Histórico de regras');
    await waitForText(driver, `${prefix} ajuste de pesos`);
    const h = await requestAs(USERS.admin, '/clientes/health-config/historico');
    assert.equal(h.data[0].atual.peso_atividade, 50);
    assert.equal(h.data[0].anterior.peso_atividade, config.peso_atividade);
    const own = await requestAs(USERS.vendedor, '/clientes/meu-health');
    assert.equal(own.data.config.peso_atividade, 50);
  });
});

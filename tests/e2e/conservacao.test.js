import assert from 'node:assert/strict';
import webdriver from 'selenium-webdriver';
import { SUPABASE_KEY, SUPABASE_URL, USERS } from './helpers/config.js';
import { cleanupGrowthE2E, deleteAlertsApi, loginApi, requestAs } from './helpers/api.js';
import {
  clearSession, clickButton, clickLabeled, createDriver, loginAndWaitDashboard, open, waitForPath, waitForText
} from './helpers/browser.js';

const { By, until } = webdriver;

const stamp = Date.now();
const prefix = `E2E Conservação ${stamp}`;
const TITULO = '1 peça da coleção para atualizar o estado de conservação';

const statusText = async (driver, esperado) => {
  await driver.wait(async () => {
    const status = await driver.findElements(By.css('[role="status"]'));
    return status.length > 0 && (await status[0].getText()).includes(esperado);
  }, 10000, `Mensagem não exibida: ${esperado}`);
};
const as = async (driver, user, pagina) => {
  await clearSession(driver);
  await loginAndWaitDashboard(driver, user.email);
  if (pagina) await open(driver, pagina);
};
const notificationsOf = (driver, texto) =>
  driver.executeScript(
    'return [...document.querySelectorAll(\'[data-testid^="notificacao-"]\')].filter((li) => li.innerText.includes(arguments[0])).map((li) => ({ id: li.dataset.testid.slice(12), texto: li.innerText }))',
    texto
  );
// antecipa a última atualização da peça de teste (função de test-support.sql)
const envelhecer = async (itemId, dias) => {
  const token = await loginApi(USERS.admin.email);
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/e2e_envelhecer_item_colecao`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_item: itemId, p_dias: dias })
  });
  assert.ok(r.ok, `Execute backend/database/test-support.sql no ambiente de testes (${r.status})`);
};

// RFC21 - lembrete de atualizar o estado de conservação das peças da coleção privada (RFC23), opcional e desligável (RNF05)
describe('RFC21 - Lembrete de conservação da coleção', function () {
  let driver;
  let item;
  let alerta;

  before(async () => {
    await deleteAlertsApi(USERS.comprador);
    const r = await requestAs(USERS.comprador, '/colecao', { method: 'POST', body: { nome: `${prefix} Colar de pérolas`, categoria: 'joia', estadoConservacao: 'bom' } });
    assert.equal(r.status, 201, r.data?.message);
    item = r.data;
    driver = await createDriver();
  });

  after(async () => {
    if (driver) await driver.quit();
    await deleteAlertsApi(USERS.comprador);
    await cleanupGrowthE2E();
  });

  it('RFS73 - o comprador configura o lembrete de conservação, mensal por padrão', async () => {
    await as(driver, USERS.comprador, '/dashboard/alertas');
    await waitForText(driver, 'Lembrete de conservação');
    assert.equal(await driver.findElement(By.id('alerta-conservacao-frequencia')).getAttribute('value'), 'mensal');
    await clickButton(driver, 'Criar lembrete de conservação');
    await statusText(driver, 'Lembrete de conservação criado.');
    alerta = (await requestAs(USERS.comprador, '/alertas')).data.find((a) => a.tipo === 'conservacao');
    assert.equal(alerta.frequencia, 'mensal');
    const texto = await driver.wait(until.elementLocated(By.css(`[data-testid="alerta-${alerta.id}"]`)), 10000).getText();
    assert.match(texto, /Conservação das peças da coleção/);
  });

  it('não permite um segundo lembrete e é exclusivo do comprador', async () => {
    const dup = await requestAs(USERS.comprador, '/alertas', { method: 'POST', body: { tipo: 'conservacao' } });
    assert.equal(dup.status, 409);
    assert.equal(dup.data.message, 'Você já tem um lembrete de conservação');
    const vendedor = await requestAs(USERS.vendedor, '/alertas', { method: 'POST', body: { tipo: 'conservacao' } });
    assert.equal(vendedor.status, 400);
  });

  it('RFS74 - avisa na plataforma das peças sem atualização do estado há mais de 90 dias', async () => {
    await open(driver, '/dashboard');
    await waitForText(driver, 'Bem-vindo de volta');
    assert.equal((await notificationsOf(driver, `${prefix} Colar de pérolas`)).length, 0, 'peça recém-atualizada não gera lembrete');

    await envelhecer(item.id, 120);
    await open(driver, '/dashboard');
    await driver.wait(async () => (await notificationsOf(driver, TITULO)).length > 0, 10000, 'lembrete não exibido');
    const [notificacao] = await notificationsOf(driver, TITULO);
    assert.match(notificacao.texto, new RegExp(`${prefix} Colar de pérolas \\(estado: bom\\)`));

    await clickLabeled(driver, `Abrir notificação ${notificacao.id}`);
    await waitForPath(driver, '/dashboard/colecao');
    await driver.wait(until.elementLocated(By.css(`[data-testid="colecao-${item.id}-conservacao"]`)), 10000);
  });

  it('a atualização da peça encerra o aviso e o lembrete não se repete antes do próximo período', async () => {
    await clickLabeled(driver, `Editar ${prefix} Colar de pérolas`);
    await clickButton(driver, 'Salvar peça');
    await statusText(driver, 'Peça atualizada.');
    await driver.wait(async () => (await driver.findElements(By.css(`[data-testid="colecao-${item.id}-conservacao"]`))).length === 0, 10000);

    await envelhecer(item.id, 200);
    await open(driver, '/dashboard');
    await driver.wait(async () => (await notificationsOf(driver, TITULO)).length > 0, 10000);
    assert.equal((await notificationsOf(driver, TITULO)).length, 1, 'mensal: não repete no mesmo período');
  });

  it('o lembrete é desligado com uma ação e o administrador o vê na taxa de desativação', async () => {
    await open(driver, '/dashboard/alertas');
    await clickLabeled(driver, `Ligar ou desligar alerta ${alerta.id}`);
    await statusText(driver, 'Alerta desligado.');

    await as(driver, USERS.admin);
    const linha = await driver.wait(until.elementLocated(By.css('[data-testid="resumo-alerta-conservacao"]')), 10000);
    assert.match(await linha.getText(), /Conservação das peças da coleção/);
    assert.ok(Number(await linha.findElement(By.css('[data-col="desativados"]')).getText()) >= 1);
  });
});

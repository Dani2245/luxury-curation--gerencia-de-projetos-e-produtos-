import assert from 'node:assert/strict';
import webdriver from 'selenium-webdriver';
import { PASSWORD, USERS } from './helpers/config.js';
import { cleanupGrowthE2E, createUserApi, deleteUsersByEmail, joinWaitlistApi, loginApi, requestAs } from './helpers/api.js';
import {
  clearSession, clickButton, clickLabeled, createDriver, fill, loginAndWaitDashboard, open, select, tableRows, waitForText
} from './helpers/browser.js';

const { By, until } = webdriver;

const stamp = Date.now();
const prefix = `E2E Indicação ${stamp}`;
const email = (nome) => `e2e-${nome}-${stamp}@lastro.com`;

const statusText = async (driver, esperado) => {
  await driver.wait(async () => {
    const status = await driver.findElements(By.css('[role="status"]'));
    return status.length > 0 && (await status[0].getText()).includes(esperado);
  }, 10000, `Mensagem não exibida: ${esperado}`);
};
const openReferrals = async (driver, user) => {
  await clearSession(driver);
  await loginAndWaitDashboard(driver, user.email);
  await open(driver, '/dashboard/indicacoes');
  await waitForText(driver, 'Indique quem pode comprar ou vender');
};
const indicacaoDe = async (user, contato) => (await requestAs(user, '/indicacoes')).data.find((i) => i.contato === contato);
const usuario = async (mail) => (await requestAs(USERS.admin, `/usuarios?email=${encodeURIComponent(mail)}`)).data[0];

// RFC18 - Manter Indicações (RFS61 a RFS64) e origem de toda conta nova
describe('RFC18 - Indicações', function () {
  let driver;
  let convite;
  let carlos;

  before(async () => {
    driver = await createDriver();
  });

  after(async () => {
    if (driver) await driver.quit();
    await deleteUsersByEmail(`-${stamp}@lastro.com`);
    await cleanupGrowthE2E();
  });

  describe('RFS61 - Inserir Indicação', () => {
    it('o vendedor indica um novo vendedor e recebe o link do convite', async () => {
      await openReferrals(driver, USERS.vendedor);
      await fill(driver, 'ind-nome', `${prefix} Carlos`);
      await fill(driver, 'ind-contato', email('carlos'));
      await select(driver, 'ind-perfil', 'vendedor');
      await clickButton(driver, 'Indicar');
      await statusText(driver, 'Indicação registrada.');
      convite = await driver.wait(until.elementLocated(By.css('[data-testid="convite-link"]')), 10000).getText();
      assert.match(convite, /\/lista-de-espera\?convite=[0-9a-f]{16}$/);

      carlos = await indicacaoDe(USERS.vendedor, email('carlos'));
      assert.equal(carlos.status, 'enviada');
      assert.equal(carlos.perfil, 'vendedor');
    });

    it('comprador, perito e administrador também indicam; não indica quem já tem conta nem repete o convite', async () => {
      for (const [user, nome] of [[USERS.comprador, 'cpr'], [USERS.perito, 'per'], [USERS.admin, 'adm']]) {
        const r = await requestAs(user, '/indicacoes', { method: 'POST', body: { nome: `${prefix} ${nome}`, contato: email(nome), perfil: 'comprador' } });
        assert.equal(r.status, 201, `${user.perfil}: ${r.data?.message}`);
      }
      const existente = await requestAs(USERS.comprador, '/indicacoes', { method: 'POST', body: { nome: 'Beatriz', contato: USERS.comprador.email, perfil: 'comprador' } });
      assert.equal(existente.status, 409);
      assert.equal(existente.data.message, 'Esta pessoa já tem conta na Lastro');
      const repetida = await requestAs(USERS.perito, '/indicacoes', { method: 'POST', body: { nome: 'Outro', contato: email('carlos'), perfil: 'vendedor' } });
      assert.equal(repetida.status, 409);
      assert.equal(repetida.data.message, 'Esta pessoa já foi indicada e o convite ainda não foi aceito');
    });
  });

  describe('RFS62 - Consultar Indicação e origem da conta nova', () => {
    it('o indicado entra pela lista de espera com o convite e a conta nova registra a origem indicação', async () => {
      await clearSession(driver);
      await driver.get(convite);
      await fill(driver, 'le-nome', `${prefix} Carlos`);
      await fill(driver, 'le-email', email('carlos'));
      await select(driver, 'le-perfil', 'vendedor');
      await driver.findElement(By.id('le-consentimento')).click();
      await clickButton(driver, 'Entrar na lista de espera');
      await statusText(driver, 'Inscrição confirmada');

      const conta = await createUserApi({ nome: `${prefix} Carlos`, email: email('carlos'), senha: PASSWORD, perfil: 'Vendedor' });
      assert.equal(conta.status, 201, conta.data?.message);
      assert.equal(conta.data.origem, 'indicação');
      assert.equal((await indicacaoDe(USERS.vendedor, email('carlos'))).status, 'cadastrada');
    });

    it('o primeiro acesso da conta indicada ativa a indicação, acompanhada por quem indicou', async () => {
      await loginApi(email('carlos'));
      await openReferrals(driver, USERS.vendedor);
      const status = await driver.wait(until.elementLocated(By.css(`[data-testid="indicacao-${carlos.id}-status"]`)), 10000);
      assert.equal(await status.getText(), 'Conta ativada');
      // quem indicou vê só as próprias indicações; o administrador vê todas
      assert.ok(!(await requestAs(USERS.comprador, '/indicacoes')).data.some((i) => i.id === carlos.id));
      assert.ok((await requestAs(USERS.admin, '/indicacoes')).data.some((i) => i.id === carlos.id && i.indicador.nome === USERS.vendedor.nome));
    });

    it('a conta vinda da lista de espera e a conta informada pelo administrador também registram a origem', async () => {
      assert.equal((await joinWaitlistApi({ nome: `${prefix} Dora`, email: email('dora') })).status, 201);
      const dora = await createUserApi({ nome: `${prefix} Dora`, email: email('dora'), senha: PASSWORD, perfil: 'Comprador' });
      assert.equal(dora.data.origem, 'lista de espera');

      await clearSession(driver);
      await loginAndWaitDashboard(driver, USERS.admin.email);
      await open(driver, '/dashboard/usuarios');
      await clickButton(driver, 'Novo Usuário');
      await fill(driver, 'usuario-nome', `${prefix} Eva`);
      await fill(driver, 'usuario-email', email('eva'));
      await fill(driver, 'usuario-senha', PASSWORD);
      await select(driver, 'usuario-origem', 'anúncio');
      await clickButton(driver, 'Salvar');
      await driver.wait(async () => (await usuario(email('eva')))?.origem === 'anúncio', 10000, 'origem anúncio não registrada');
      await fill(driver, 'filtro-email', email('eva'));
      await clickButton(driver, 'Buscar');
      await driver.wait(async () => (await tableRows(driver)).some((r) => r.includes(email('eva')) && r.includes('Anúncio')), 10000);
    });
  });

  describe('RFS63 - Editar Indicação', () => {
    it('corrige o contato enquanto o convite não foi aceito', async () => {
      const r = await requestAs(USERS.vendedor, '/indicacoes', { method: 'POST', body: { nome: `${prefix} Fabi`, contato: email('fabi-errado'), perfil: 'comprador' } });
      assert.equal(r.status, 201);
      await openReferrals(driver, USERS.vendedor);
      await clickLabeled(driver, `Editar indicação ${email('fabi-errado')}`);
      await fill(driver, 'ind-e-contato', email('fabi'));
      await clickButton(driver, 'Salvar indicação');
      await statusText(driver, 'Indicação atualizada.');
      assert.ok(await indicacaoDe(USERS.vendedor, email('fabi')));
    });

    it('não altera a indicação cujo convite já foi aceito', async () => {
      assert.equal((await driver.findElements(By.css(`[aria-label="Editar indicação ${email('carlos')}"]`))).length, 0);
      const r = await requestAs(USERS.vendedor, `/indicacoes/${carlos.id}`, { method: 'PUT', body: { nome: 'X', contato: email('x') } });
      assert.equal(r.status, 400);
      assert.equal(r.data.message, 'O convite já foi aceito; a indicação não pode mais ser alterada');
    });
  });

  describe('RFS64 - Remover Indicação', () => {
    it('cancela a indicação ainda não aceita', async () => {
      const fabi = await indicacaoDe(USERS.vendedor, email('fabi'));
      await clickLabeled(driver, `Cancelar indicação ${email('fabi')}`);
      await driver.wait(until.alertIsPresent(), 5000);
      await driver.switchTo().alert().accept();
      await statusText(driver, 'Indicação cancelada.');
      assert.equal((await driver.findElements(By.css(`[data-testid="indicacao-${fabi.id}"]`))).length, 0);
    });

    it('não cancela a indicação aceita nem a de outra pessoa', async () => {
      const aceita = await requestAs(USERS.vendedor, `/indicacoes/${carlos.id}`, { method: 'DELETE' });
      assert.equal(aceita.status, 400);
      const outra = await indicacaoDe(USERS.perito, email('per'));
      assert.equal((await requestAs(USERS.vendedor, `/indicacoes/${outra.id}`, { method: 'DELETE' })).status, 404);
    });
  });
});

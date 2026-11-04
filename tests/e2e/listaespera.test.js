import assert from 'node:assert/strict';
import webdriver from 'selenium-webdriver';
import { USERS } from './helpers/config.js';
import {
  cleanupE2E, cleanupGrowthE2E, createLinkApi, createPublishedPecaApi, issuePassportApi, joinWaitlistApi, requestAs
} from './helpers/api.js';
import {
  clearSession, clickButton, clickLabeled, clickLink, createDriver, fill, loginAndWaitDashboard, open, select, waitForPath, waitForText
} from './helpers/browser.js';

const { By, until } = webdriver;

const stamp = Date.now();
const prefix = `E2E Espera ${stamp}`;
const origem = `e2e-anuncio-${stamp}`;
const email = (nome) => `e2e-${nome}-${stamp}@lastro.com`;

const statusText = async (driver, esperado) => {
  await driver.wait(async () => {
    const status = await driver.findElements(By.css('[role="status"]'));
    return status.length > 0 && (await status[0].getText()).includes(esperado);
  }, 10000, `Mensagem não exibida: ${esperado}`);
};
const signUp = async (driver, nome, mail) => {
  await fill(driver, 'le-nome', nome);
  await fill(driver, 'le-email', mail);
  await driver.findElement(By.id('le-consentimento')).click();
  await clickButton(driver, 'Entrar na lista de espera');
  await statusText(driver, 'Inscrição confirmada');
};
// texto de um data-testid que pode ainda não existir (a lista chega pela API)
const testidText = async (driver, testid) => {
  const found = await driver.findElements(By.css(`[data-testid="${testid}"]`));
  return found.length ? found[0].getText() : null;
};
const inscricoes = async (params) => (await requestAs(USERS.admin, `/lista-espera?${new URLSearchParams(params)}`)).data;
const asAdmin = async (driver) => {
  await clearSession(driver);
  await loginAndWaitDashboard(driver, USERS.admin.email);
  await open(driver, '/dashboard/lista-espera');
  await waitForText(driver, 'Inscrições feitas pela página pública');
};

// RFC17 - Manter Lista de Espera (RFS57 a RFS60) e cadastros originados do link do passaporte (RFS54)
describe('RFC17 - Lista de Espera', function () {
  let driver;
  let ana;

  before(async () => {
    driver = await createDriver();
  });

  after(async () => {
    if (driver) await driver.quit();
    await cleanupGrowthE2E();
    await cleanupE2E(prefix);
  });

  describe('RFS57 - Inserir Inscrição (Visitante)', () => {
    it('o visitante se inscreve pela landing, sem cadastro, com versão da página e origem registradas', async () => {
      await clearSession(driver);
      await open(driver, `/landing?v=b&utm_source=${origem}`);
      await clickLink(driver, 'Entrar na lista de espera');
      await waitForPath(driver, '/lista-de-espera');
      await select(driver, 'le-perfil', 'comprador');
      await driver.findElement(By.id('le-cat-bolsa')).click();
      await driver.findElement(By.id('le-cat-joia')).click();
      await signUp(driver, `${prefix} Ana`, email('ana'));

      const data = await inscricoes({ origem });
      assert.equal(data.total, 1);
      ana = data.inscricoes[0];
      assert.equal(ana.versao, 'b');
      assert.equal(ana.status, 'aguardando');
      assert.deepEqual([...ana.categorias].sort(), ['bolsa', 'joia']);
    });

    it('a versão padrão da página não oferece bolsas (experimento X5)', async () => {
      await open(driver, '/lista-de-espera');
      await driver.wait(until.elementLocated(By.id('le-cat-joia')), 10000);
      assert.equal((await driver.findElements(By.id('le-cat-bolsa'))).length, 0);
    });

    it('exige o consentimento e não aceita o mesmo e-mail duas vezes', async () => {
      await fill(driver, 'le-nome', `${prefix} Sem consentimento`);
      await fill(driver, 'le-email', email('sem'));
      await clickButton(driver, 'Entrar na lista de espera');
      assert.equal(await driver.executeScript('return document.getElementById("le-consentimento").checkValidity()'), false);

      const semConsentimento = await joinWaitlistApi({ nome: 'X', email: email('sem'), consentimento: false });
      assert.equal(semConsentimento.status, 400);
      assert.equal(semConsentimento.data.message, 'É preciso concordar com o uso dos dados para entrar na lista de espera');
      const repetido = await joinWaitlistApi({ nome: 'Ana', email: email('ana') });
      assert.equal(repetido.status, 409);
      assert.equal(repetido.data.message, 'Este e-mail já está na lista de espera');
    });
  });

  describe('RFS58 - Consultar Inscrição (Administrador)', () => {
    it('filtra por perfil, categoria, versão, origem e período, com o total por versão', async () => {
      await joinWaitlistApi({ nome: `${prefix} Bruno`, email: email('bruno'), perfil: 'vendedor', categorias: ['relógio'], versao: 'a', origem });
      await asAdmin(driver);
      await fill(driver, 'le-f-origem', origem);
      await clickButton(driver, 'Buscar');
      await driver.wait(async () => (await testidText(driver, 'le-total')) === '2', 10000);
      assert.equal(await driver.findElement(By.css('[data-testid="versao-a"]')).getText(), '1');
      assert.equal(await driver.findElement(By.css('[data-testid="versao-b"]')).getText(), '1');

      await select(driver, 'le-f-categoria', 'bolsa');
      await clickButton(driver, 'Buscar');
      await driver.wait(async () => (await testidText(driver, 'le-total')) === '1', 10000);
      await driver.findElement(By.css(`[data-testid="inscricao-${ana.id}"]`));

      const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
      assert.equal((await inscricoes({ origem, perfil: 'vendedor', dataInicial: hoje, dataFinal: hoje })).total, 1);
      assert.equal((await inscricoes({ origem, dataInicial: '2001-01-01', dataFinal: '2001-01-31' })).total, 0);
      for (const user of [USERS.comprador, USERS.vendedor, USERS.perito]) {
        assert.equal((await requestAs(user, '/lista-espera')).status, 403);
      }
    });
  });

  describe('RFS59 - Editar Inscrição (Administrador)', () => {
    it('atualiza os dados e o status da inscrição', async () => {
      await asAdmin(driver);
      await fill(driver, 'le-f-origem', origem);
      await clickButton(driver, 'Buscar');
      await clickLabeled(driver, `Editar inscrição ${email('ana')}`);
      await fill(driver, 'le-e-nome', `${prefix} Ana Lima`);
      await select(driver, 'le-e-status', 'convidado');
      await clickButton(driver, 'Salvar inscrição');
      await statusText(driver, 'Inscrição atualizada.');
      const row = await driver.findElement(By.css(`[data-testid="inscricao-${ana.id}"]`)).getText();
      assert.match(row, new RegExp(`${prefix} Ana Lima`));
      assert.match(row, /Convidado/);
    });
  });

  describe('RFS60 - Remover Inscrição (Administrador)', () => {
    it('exclui a inscrição, inclusive a pedido do inscrito', async () => {
      await clickLabeled(driver, `Excluir inscrição ${email('ana')}`);
      await driver.wait(until.alertIsPresent(), 5000);
      await driver.switchTo().alert().accept();
      await statusText(driver, 'Inscrição excluída.');
      assert.equal((await driver.findElements(By.css(`[data-testid="inscricao-${ana.id}"]`))).length, 0);
      assert.equal((await inscricoes({ origem })).total, 1);
    });
  });

  describe('RFS54 - Cadastros originados pelo link do passaporte', () => {
    it('a inscrição feita a partir do link do passaporte é contada para quem gerou o link', async () => {
      const peca = await createPublishedPecaApi({ nome: `${prefix} Relógio`, valor: 54321 });
      const passaporte = await issuePassportApi(peca.id);
      const link = await createLinkApi(passaporte.id);

      await clearSession(driver);
      await open(driver, `/p/${link.token}`);
      await clickLink(driver, 'Lista de espera');
      await waitForPath(driver, '/lista-de-espera');
      await signUp(driver, `${prefix} Carla`, email('carla'));

      const data = await inscricoes({ origem: 'link' });
      assert.ok(data.inscricoes.some((i) => i.email === email('carla')), 'inscrição com origem link');
      const links = await requestAs(USERS.vendedor, `/links?passaporteId=${passaporte.id}`);
      assert.equal(links.data.find((l) => l.id === link.id).cadastros, 1);

      await clearSession(driver);
      await loginAndWaitDashboard(driver, USERS.vendedor.email);
      await open(driver, `/peca/${peca.id}/passaporte`);
      const cadastros = await driver.wait(until.elementLocated(By.css(`[data-testid="cadastros-${link.id}"]`)), 10000);
      assert.equal(await cadastros.getText(), '1 cadastro originado');
    });
  });
});

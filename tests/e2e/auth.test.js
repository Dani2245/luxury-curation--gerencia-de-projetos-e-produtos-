import assert from 'node:assert/strict';
import webdriver from 'selenium-webdriver';
import { USERS } from './helpers/config.js';
import {
  alertText, clearSession, clickButton, clickLabeled, createDriver, fill, loginAndWaitDashboard, loginAs,
  open, waitForPath, waitForText
} from './helpers/browser.js';

const { By } = webdriver;

const TITULOS = {
  admin: 'Painel do Administrador',
  vendedor: 'Painel do Vendedor',
  comprador: 'Painel do Comprador',
  perito: 'Painel do Perito'
};

// RFC01 - Manter Usuários: autenticação e perfis de acesso
describe('RFC01 - Autenticação e perfis', function () {
  let driver;

  before(async () => {
    driver = await createDriver();
  });

  after(async () => {
    await driver.quit();
  });

  beforeEach(async () => {
    await clearSession(driver);
  });

  for (const [chave, titulo] of Object.entries(TITULOS)) {
    it(`autentica o perfil ${USERS[chave].perfil} e exibe o painel correspondente`, async () => {
      await loginAndWaitDashboard(driver, USERS[chave].email);
      await waitForText(driver, titulo);
      await waitForText(driver, USERS[chave].nome);
    });
  }

  it('rejeita senha incorreta e permanece na tela de login', async () => {
    await loginAs(driver, USERS.vendedor.email, 'senha-incorreta');
    assert.equal(await alertText(driver), 'E-mail ou senha inválidos');
    await waitForPath(driver, '/login');
  });

  it('rejeita e-mail não cadastrado', async () => {
    await loginAs(driver, 'inexistente@lastro.com');
    assert.equal(await alertText(driver), 'E-mail ou senha inválidos');
  });

  it('exige e-mail e senha preenchidos', async () => {
    await open(driver, '/login');
    await clickButton(driver, 'Entrar');
    const valid = await driver.executeScript('return document.getElementById("email").checkValidity()');
    assert.equal(valid, false);
    await waitForPath(driver, '/login');
  });

  it('redireciona visitante sem sessão para o login ao acessar rotas protegidas', async () => {
    for (const path of ['/dashboard', '/catalogo', '/dashboard/usuarios', '/dashboard/nova-peca']) {
      await open(driver, path);
      await waitForPath(driver, '/login');
    }
  });

  it('encerra a sessão ao sair e volta a proteger o painel', async () => {
    await loginAndWaitDashboard(driver, USERS.comprador.email);
    await clickLabeled(driver, 'Sair');
    await waitForPath(driver, '/');
    await open(driver, '/dashboard');
    await waitForPath(driver, '/login');
  });

  it('mantém a sessão após recarregar a página', async () => {
    await loginAndWaitDashboard(driver, USERS.admin.email);
    await driver.navigate().refresh();
    await waitForText(driver, TITULOS.admin);
  });

  describe('restrição de acesso por perfil', () => {
    it('comprador não acessa gestão de usuários nem cadastro de peças', async () => {
      await loginAndWaitDashboard(driver, USERS.comprador.email);
      for (const path of ['/dashboard/usuarios', '/dashboard/nova-peca']) {
        await open(driver, path);
        await waitForPath(driver, '/dashboard');
      }
    });

    it('vendedor não acessa o catálogo de compra nem a gestão de usuários', async () => {
      await loginAndWaitDashboard(driver, USERS.vendedor.email);
      for (const path of ['/catalogo', '/dashboard/usuarios']) {
        await open(driver, path);
        await waitForPath(driver, '/dashboard');
      }
    });

    it('perito não acessa o catálogo', async () => {
      await loginAndWaitDashboard(driver, USERS.perito.email);
      await open(driver, '/catalogo');
      await waitForPath(driver, '/dashboard');
    });

    it('somente o administrador vê o atalho para Usuários', async () => {
      await loginAndWaitDashboard(driver, USERS.admin.email);
      assert.equal((await driver.findElements(By.css('a[href="/dashboard/usuarios"]'))).length, 1);

      await clearSession(driver);
      await loginAndWaitDashboard(driver, USERS.vendedor.email);
      await waitForText(driver, 'Painel do Vendedor');
      assert.equal((await driver.findElements(By.css('a[href="/dashboard/usuarios"]'))).length, 0);
    });
  });
});

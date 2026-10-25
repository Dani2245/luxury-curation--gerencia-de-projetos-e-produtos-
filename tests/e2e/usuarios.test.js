import assert from 'node:assert/strict';
import webdriver from 'selenium-webdriver';
import { USERS } from './helpers/config.js';
import { deleteUsersByEmail } from './helpers/api.js';
import {
  alertText, clearSession, clickButton, clickLabeled, createDriver, fill, loginAndWaitDashboard, loginAs,
  open, select, tableRows, waitForPath, waitForText, waitGone
} from './helpers/browser.js';

const { By, until } = webdriver;

const stamp = Date.now();
const prefix = `e2e.user.${stamp}`;
const usuario = { nome: `Usuário E2E ${stamp}`, email: `${prefix}@lastro.com`, senha: 'Senha#E2E2026' };

const submitForm = async (driver) => {
  await clickButton(driver, 'Salvar');
};

const rowFor = async (driver, email) => {
  const rows = await tableRows(driver);
  return rows.find((row) => row.includes(email));
};

// RFC01 - RFS09 a RFS12: Inserir, Consultar, Editar e Remover Usuário (Administrador)
describe('RFC01 - Manter Usuários', function () {
  let driver;

  before(async () => {
    driver = await createDriver();
    await clearSession(driver);
    await loginAndWaitDashboard(driver, USERS.admin.email);
    await open(driver, '/dashboard/usuarios');
    await waitForText(driver, USERS.admin.email);
  });

  after(async () => {
    await deleteUsersByEmail(prefix);
    await driver.quit();
  });

  it('RFS09 - cadastra um usuário com perfil de acesso', async () => {
    await clickButton(driver, 'Novo Usuário');
    await fill(driver, 'usuario-nome', usuario.nome);
    await fill(driver, 'usuario-email', usuario.email);
    await select(driver, 'usuario-perfil', 'Perito');
    await fill(driver, 'usuario-senha', usuario.senha);
    await submitForm(driver);

    await waitForText(driver, 'Usuário cadastrado com sucesso.');
    await driver.wait(async () => rowFor(driver, usuario.email), 10000, 'usuário deve aparecer na listagem');
    const row = await rowFor(driver, usuario.email);
    assert.match(row, /Perito/);
  });

  it('RFS09 - rejeita e-mail já cadastrado', async () => {
    await clickButton(driver, 'Novo Usuário');
    await fill(driver, 'usuario-nome', 'Duplicado E2E');
    await fill(driver, 'usuario-email', usuario.email.toUpperCase());
    await fill(driver, 'usuario-senha', usuario.senha);
    await submitForm(driver);

    assert.equal(await alertText(driver), 'Já existe um usuário com este e-mail');
    await clickButton(driver, 'Cancelar');
  });

  it('RFS09 - exige senha com no mínimo 8 caracteres', async () => {
    await clickButton(driver, 'Novo Usuário');
    await fill(driver, 'usuario-nome', 'Senha Curta E2E');
    await fill(driver, 'usuario-email', `${prefix}.curta@lastro.com`);
    await fill(driver, 'usuario-senha', '123');
    await submitForm(driver);

    const valid = await driver.executeScript('return document.getElementById("usuario-senha").checkValidity()');
    assert.equal(valid, false);
    await clickButton(driver, 'Cancelar');
  });

  it('o usuário cadastrado consegue autenticar com o perfil definido', async () => {
    await clearSession(driver);
    await loginAndWaitDashboard(driver, usuario.email, usuario.senha);
    await waitForText(driver, 'Painel do Perito');

    await clearSession(driver);
    await loginAndWaitDashboard(driver, USERS.admin.email);
    await open(driver, '/dashboard/usuarios');
    await waitForText(driver, usuario.email);
  });

  it('RFS10 - consulta usuários por perfil', async () => {
    await select(driver, 'filtro-perfil', 'Perito');
    await clickButton(driver, 'Buscar');
    await driver.wait(async () => {
      const rows = await tableRows(driver);
      return rows.length > 0 && rows.every((row) => row.includes('Perito'));
    }, 10000);

    const rows = await tableRows(driver);
    assert.ok(rows.some((row) => row.includes(usuario.email)));
    assert.ok(!rows.some((row) => row.includes(USERS.vendedor.email)));
    await select(driver, 'filtro-perfil', '');
  });

  it('RFS10 - consulta usuários por e-mail e por nome', async () => {
    await fill(driver, 'filtro-email', prefix);
    await clickButton(driver, 'Buscar');
    await driver.wait(async () => (await tableRows(driver)).length === 1, 10000);
    assert.ok(await rowFor(driver, usuario.email));

    await fill(driver, 'filtro-email', '');
    await fill(driver, 'filtro-nome', 'Helena');
    await clickButton(driver, 'Buscar');
    await driver.wait(async () => (await tableRows(driver)).length === 1, 10000);
    assert.ok(await rowFor(driver, USERS.admin.email));

    await fill(driver, 'filtro-nome', '');
    await clickButton(driver, 'Buscar');
  });

  it('RFS11 - edita nome e perfil mantendo a senha quando o campo fica em branco', async () => {
    await fill(driver, 'filtro-email', prefix);
    await clickButton(driver, 'Buscar');
    await driver.wait(async () => (await tableRows(driver)).length === 1, 10000);

    await clickLabeled(driver, `Editar ${usuario.nome}`);
    const nome = `${usuario.nome} Editado`;
    await fill(driver, 'usuario-nome', nome);
    await select(driver, 'usuario-perfil', 'Comprador');
    await submitForm(driver);

    await waitForText(driver, 'Usuário atualizado com sucesso.');
    await driver.wait(async () => (await rowFor(driver, usuario.email))?.includes('Comprador'), 10000);
    assert.match(await rowFor(driver, usuario.email), /Editado/);

    await clearSession(driver);
    await loginAndWaitDashboard(driver, usuario.email, usuario.senha);
    await waitForText(driver, 'Painel do Comprador');
  });

  it('RFS11 - altera a senha do usuário', async () => {
    await clearSession(driver);
    await loginAndWaitDashboard(driver, USERS.admin.email);
    await open(driver, '/dashboard/usuarios');
    await fill(driver, 'filtro-email', prefix);
    await clickButton(driver, 'Buscar');
    await driver.wait(async () => (await tableRows(driver)).length === 1, 10000);

    await clickLabeled(driver, `Editar ${usuario.nome} Editado`);
    await fill(driver, 'usuario-senha', 'NovaSenha#2026');
    await submitForm(driver);
    await waitForText(driver, 'Usuário atualizado com sucesso.');

    await clearSession(driver);
    await loginAs(driver, usuario.email, usuario.senha);
    assert.equal(await alertText(driver), 'E-mail ou senha inválidos');
    await loginAndWaitDashboard(driver, usuario.email, 'NovaSenha#2026');
  });

  it('RFS12 - o administrador não pode remover o próprio usuário', async () => {
    await clearSession(driver);
    await loginAndWaitDashboard(driver, USERS.admin.email);
    await open(driver, '/dashboard/usuarios');
    const button = await driver.wait(until.elementLocated(By.css(`[aria-label="Remover ${USERS.admin.nome}"]`)), 10000);
    assert.equal(await button.isEnabled(), false);
  });

  it('RFS12 - não permite remover usuário que possui peças cadastradas', async () => {
    await driver.wait(until.elementLocated(By.css(`[aria-label="Remover ${USERS.vendedor.nome}"]`)), 10000);
    await clickLabeled(driver, `Remover ${USERS.vendedor.nome}`);
    await driver.wait(until.alertIsPresent(), 5000);
    await driver.switchTo().alert().accept();

    assert.equal(await alertText(driver), 'O usuário possui peças cadastradas e não pode ser removido');
    assert.ok(await rowFor(driver, USERS.vendedor.email));
  });

  it('RFS12 - remove o usuário e impede novo login', async () => {
    await fill(driver, 'filtro-email', prefix);
    await clickButton(driver, 'Buscar');
    await driver.wait(async () => (await tableRows(driver)).length === 1, 10000);

    await clickLabeled(driver, `Remover ${usuario.nome} Editado`);
    await driver.wait(until.alertIsPresent(), 5000);
    await driver.switchTo().alert().accept();

    await waitForText(driver, 'Usuário removido com sucesso.');
    await waitForText(driver, 'Nenhum usuário encontrado.');

    await clearSession(driver);
    await loginAs(driver, usuario.email, 'NovaSenha#2026');
    assert.equal(await alertText(driver), 'E-mail ou senha inválidos');
    await waitForPath(driver, '/login');
    await waitGone(driver, 'Painel do');
  });
});

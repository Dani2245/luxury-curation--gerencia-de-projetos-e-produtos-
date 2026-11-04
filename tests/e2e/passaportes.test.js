import assert from 'node:assert/strict';
import path from 'node:path';
import webdriver from 'selenium-webdriver';
import { FIXTURES, USERS } from './helpers/config.js';
import { cleanupE2E, createPublishedPecaApi } from './helpers/api.js';
import {
  alertText, clearSession, clickButton, createDriver, fill, loginAndWaitDashboard, open, select,
  waitForPath, waitForText
} from './helpers/browser.js';

const { By, until } = webdriver;

const stamp = Date.now();
const nome = `E2E Passaporte ${stamp}`;
const valor = 3000000 + (stamp % 100000);
const pdf = (file) => path.join(FIXTURES, file);

const as = async (driver, user) => {
  await clearSession(driver);
  await loginAndWaitDashboard(driver, user.email);
};

const attach = async (driver, id, file) => {
  await driver.findElement(By.id(id)).sendKeys(pdf(file));
  await driver.wait(until.elementLocated(By.css(`[aria-label="Remover ${file}"]`)), 5000);
};

const bodyText = (driver) => driver.executeScript('return document.body.innerText');

// RFC03 e RFC07 - Passaporte Digital com assinatura digital do Perito (RFS05 a RFS08)
describe('RFC03/RFC07 - Passaporte Digital', function () {
  let driver;
  let peca;

  before(async () => {
    peca = await createPublishedPecaApi({ nome, valor });
    driver = await createDriver();
  });

  after(async () => {
    await driver.quit();
    await cleanupE2E();
  });

  describe('RFS05 - Inserir Passaporte Digital (Perito)', () => {
    before(async () => {
      await as(driver, USERS.perito);
    });

    it('lista a peça entre as que aguardam passaporte', async () => {
      await waitForText(driver, 'Peças aguardando passaporte');
      await waitForText(driver, nome);
    });

    it('exige ao menos um certificado de autenticidade', async () => {
      await open(driver, `/dashboard/passaportes/${peca.id}/emitir`);
      await waitForText(driver, nome);
      await clickButton(driver, 'Emitir e Assinar');
      assert.equal(await alertText(driver), 'Anexe ao menos um certificado de autenticidade');
    });

    it('emite o passaporte com certificado, laudo, nota fiscal e proprietários anteriores', async () => {
      await open(driver, `/dashboard/passaportes/${peca.id}/emitir`);
      await waitForText(driver, nome);
      await select(driver, 'status', 'valido');
      await fill(driver, 'proprietarios', 'Casa de Leilões Aurora\nFamília Prado');
      await attach(driver, 'certificados', 'certificado.pdf');
      await attach(driver, 'laudos', 'laudo.pdf');
      await attach(driver, 'notasFiscais', 'nota-fiscal.pdf');
      await clickButton(driver, 'Emitir e Assinar');

      await waitForPath(driver, `/peca/${peca.id}/passaporte`);
      await waitForText(driver, 'Assinatura válida');
      const text = await bodyText(driver);
      assert.match(text, /Status: valido/i);
      assert.match(text, /Perito responsável\s+Carlos Menezes/);
      assert.match(text, /Certificados de autenticidade/i);
      assert.match(text, /Laudos periciais/i);
      assert.match(text, /Notas fiscais/i);
      assert.match(text, /Casa de Leilões Aurora/);
      assert.match(text, /Família Prado/);
      assert.match(text, /Passaporte emitido e assinado digitalmente pelo perito/);
    });

    it('a peça deixa a fila de passaportes pendentes', async () => {
      await open(driver, '/dashboard');
      await waitForText(driver, 'Peças aguardando passaporte');
      await driver.sleep(500);
      assert.ok(!(await bodyText(driver)).includes(nome));
    });

    it('não permite emitir um segundo passaporte para a mesma peça', async () => {
      await open(driver, `/dashboard/passaportes/${peca.id}/emitir`);
      await waitForText(driver, nome);
      await attach(driver, 'certificados', 'certificado.pdf');
      await clickButton(driver, 'Emitir e Assinar');
      assert.equal(await alertText(driver), 'A peça já possui passaporte digital');
    });
  });

  describe('RFS06 - Consultar Passaporte Digital', () => {
    it('comprador consulta o passaporte com a identidade dos proprietários protegida (RNF04)', async () => {
      await as(driver, USERS.comprador);
      await open(driver, `/peca/${peca.id}/passaporte`);
      await waitForText(driver, 'Assinatura válida');
      const text = await bodyText(driver);
      assert.match(text, /Proprietário 1/);
      assert.match(text, /Proprietário 3/);
      assert.ok(!text.includes('Casa de Leilões Aurora'));
      assert.ok(!text.includes(USERS.vendedor.nome));
      assert.match(text, /A identidade dos proprietários é privada/);
    });

    it('a nota fiscal fica restrita ao dono, ao perito e ao administrador', async () => {
      const text = await bodyText(driver);
      assert.ok(!/Notas fiscais/i.test(text));
      assert.match(text, /Certificados de autenticidade/i);
    });

    it('comprador não vê o formulário de atualização', async () => {
      assert.equal((await driver.findElements(By.css('form[aria-label="Atualizar passaporte"]'))).length, 0);
    });

    it('o status do passaporte aparece na consulta de peças', async () => {
      await open(driver, '/catalogo');
      await driver.wait(until.elementLocated(By.id('f-min')), 10000);
      await fill(driver, 'f-min', String(valor));
      await fill(driver, 'f-max', String(valor));
      await clickButton(driver, 'Buscar');
      await driver.wait(until.elementLocated(By.css('a[href^="/peca/"]')), 10000);
      assert.match(await driver.findElement(By.css('a[href^="/peca/"]')).getText(), /Passaporte: valido/i);
    });

    it('o vendedor dono vê os proprietários e decide torná-los públicos (RNF04)', async () => {
      await as(driver, USERS.vendedor);
      await open(driver, `/peca/${peca.id}/passaporte`);
      await waitForText(driver, 'Assinatura válida');
      let text = await bodyText(driver);
      assert.match(text, /Casa de Leilões Aurora/);
      assert.match(text, /Notas fiscais/i);

      await clickButton(driver, 'Identidade dos proprietários: privada');
      await waitForText(driver, 'Preferência de privacidade atualizada.');
      await waitForText(driver, 'Identidade dos proprietários: pública');

      await as(driver, USERS.comprador);
      await open(driver, `/peca/${peca.id}/passaporte`);
      await waitForText(driver, 'Assinatura válida');
      text = await bodyText(driver);
      assert.match(text, /Casa de Leilões Aurora/);
      assert.match(text, /Família Prado/);
    });

    it('perito e administrador consultam o passaporte completo', async () => {
      for (const user of [USERS.perito, USERS.admin]) {
        await as(driver, user);
        await open(driver, `/peca/${peca.id}/passaporte`);
        await waitForText(driver, 'Assinatura válida');
        assert.match(await bodyText(driver), /Notas fiscais/i);
      }
    });

    it('informa quando a peça ainda não possui passaporte', async () => {
      const semPassaporte = await createPublishedPecaApi({ nome: `E2E Sem Passaporte ${stamp}` });
      await as(driver, USERS.comprador);
      await open(driver, `/peca/${semPassaporte.id}/passaporte`);
      await waitForText(driver, 'Esta peça ainda não possui passaporte digital.');
      await open(driver, `/peca/${semPassaporte.id}`);
      await waitForText(driver, 'sem passaporte');
    });
  });

  describe('RFS07 - Atualizar Passaporte Digital (Perito e Administrador)', () => {
    it('o perito acrescenta um laudo e altera o status; a assinatura é renovada', async () => {
      await as(driver, USERS.perito);
      await open(driver, `/peca/${peca.id}/passaporte`);
      await waitForText(driver, 'Atualizar passaporte');
      await select(driver, 'novo-status', 'em revisão');
      await fill(driver, 'atualizacao-descricao', 'Reanálise do mostrador');
      await attach(driver, 'up-laudos', 'laudo.pdf');
      await clickButton(driver, 'Atualizar e Assinar');

      await waitForText(driver, 'Passaporte atualizado e assinado novamente.');
      await waitForText(driver, 'Status: em revisão');
      const text = await bodyText(driver);
      assert.match(text, /v2/);
      assert.match(text, /Assinatura válida/);
      assert.match(text, /1 documento\(s\) adicionado\(s\); status alterado de valido para em revisão; Reanálise do mostrador/);
    });

    it('exige ao menos uma alteração', async () => {
      await driver.navigate().refresh();
      await waitForText(driver, 'Atualizar passaporte');
      await clickButton(driver, 'Atualizar e Assinar');
      assert.match(await alertText(driver), /Informe ao menos uma alteração/);
    });

    it('o administrador revoga o passaporte e passa a constar como signatário', async () => {
      await as(driver, USERS.admin);
      await open(driver, `/peca/${peca.id}/passaporte`);
      await waitForText(driver, 'Atualizar passaporte');
      await select(driver, 'novo-status', 'revogado');
      await fill(driver, 'atualizacao-descricao', 'Revogado por divergência documental');
      await clickButton(driver, 'Atualizar e Assinar');

      await waitForText(driver, 'Status: revogado');
      const text = await bodyText(driver);
      assert.match(text, /Assinado por\s+Helena Duarte/);
      assert.match(text, /Perito responsável\s+Carlos Menezes/);
      assert.match(text, /Assinatura válida/);
      assert.match(text, /v3/);
    });

    it('o vendedor não pode atualizar o passaporte', async () => {
      await as(driver, USERS.vendedor);
      await open(driver, `/peca/${peca.id}/passaporte`);
      await waitForText(driver, 'Assinatura válida');
      assert.equal((await driver.findElements(By.css('form[aria-label="Atualizar passaporte"]'))).length, 0);
    });

    it('somente o perito acessa a emissão de passaportes', async () => {
      for (const user of [USERS.admin, USERS.comprador, USERS.vendedor]) {
        await as(driver, user);
        await open(driver, `/dashboard/passaportes/${peca.id}/emitir`);
        await waitForPath(driver, '/dashboard');
      }
    });
  });
});

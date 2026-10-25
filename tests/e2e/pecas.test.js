import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import webdriver from 'selenium-webdriver';
import { USERS } from './helpers/config.js';
import { deletePecasByName } from './helpers/api.js';
import {
  clearSession, clickButton, clickLabeled, createDriver, fill, loginAndWaitDashboard, open, select,
  tableRows, waitForPath, waitForText
} from './helpers/browser.js';

const { By, until } = webdriver;

const FOTO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public/seed/silver-watch.jpg');
const stamp = Date.now();
const nome = `E2E Colar ${stamp}`;
const valor = 7000000 + (stamp % 100000); // valor único para isolar a peça nos filtros de faixa
const valorEditado = valor + 1000;

const as = async (driver, user) => {
  await clearSession(driver);
  await loginAndWaitDashboard(driver, user.email);
};

const catalogNames = async (driver) => {
  await driver.wait(async () => (await driver.findElements(By.css('.animate-spin'))).length === 0, 10000);
  const titles = await driver.findElements(By.css('h3'));
  return Promise.all(titles.map((title) => title.getText()));
};

const searchCatalog = async (driver, filters = {}) => {
  await open(driver, '/catalogo');
  await driver.wait(until.elementLocated(By.id('f-categoria')), 10000);
  await select(driver, 'f-categoria', filters.categoria || '');
  await fill(driver, 'f-min', filters.min ?? '');
  await fill(driver, 'f-max', filters.max ?? '');
  await fill(driver, 'f-vendedor', filters.vendedor ?? '');
  await clickButton(driver, 'Buscar');
  return catalogNames(driver);
};

const listingFor = (driver, name) =>
  driver.wait(until.elementLocated(By.xpath(`//li[.//a[normalize-space(.)="${name}"]]`)), 10000);

// RFC02 - Manter Peças (RFS01 a RFS04) e validação do anúncio pelo Administrador
describe('RFC02 - Manter Peças', function () {
  let driver;

  before(async () => {
    driver = await createDriver();
  });

  after(async () => {
    await deletePecasByName(`E2E Colar ${stamp}`);
    await driver.quit();
  });

  describe('RFS01 - Inserir Peça (Vendedor)', () => {
    before(async () => {
      await as(driver, USERS.vendedor);
    });

    it('exige os campos obrigatórios nome, categoria e valor', async () => {
      await open(driver, '/dashboard/nova-peca');
      await clickButton(driver, 'Cadastrar Peça');
      for (const id of ['nome', 'categoria', 'valor']) {
        const valid = await driver.executeScript(`return document.getElementById("${id}").checkValidity()`);
        assert.equal(valid, false, `campo ${id} deve ser obrigatório`);
      }
      await waitForPath(driver, '/dashboard/nova-peca');
    });

    it('oferece somente as categorias obra de arte, joia e relógio', async () => {
      const options = await driver.findElements(By.css('#categoria option:not([disabled])'));
      const values = await Promise.all(options.map((option) => option.getAttribute('value')));
      assert.deepEqual(values, ['obra de arte', 'joia', 'relógio']);
    });

    it('limita o nome da peça a 256 caracteres', async () => {
      assert.equal(await driver.findElement(By.id('nome')).getAttribute('maxlength'), '256');
    });

    it('cadastra a peça com fotografia e a envia para validação', async () => {
      await open(driver, '/dashboard/nova-peca');
      await fill(driver, 'nome', nome);
      await select(driver, 'categoria', 'joia');
      await fill(driver, 'valor', String(valor));
      await fill(driver, 'descricao', 'Colar de pérolas cultivadas, fecho em ouro branco.');
      await driver.findElement(By.id('fotografias')).sendKeys(FOTO);
      await driver.wait(until.elementLocated(By.css('ul img')), 5000);

      await clickButton(driver, 'Cadastrar Peça');
      await waitForText(driver, 'Peça Registrada');
      await waitForPath(driver, '/dashboard');

      await waitForText(driver, nome);
      const row = (await tableRows(driver)).find((r) => r.includes(nome));
      assert.match(row, /Em validação/);
      assert.match(row, /joia/i);
    });
  });

  describe('validação do anúncio (Administrador)', () => {
    it('comprador não enxerga a peça enquanto o anúncio não é publicado', async () => {
      await as(driver, USERS.comprador);
      assert.ok(!(await searchCatalog(driver, { min: valor, max: valor })).includes(nome));
    });

    it('administrador vê o anúncio pendente e o publica', async () => {
      await as(driver, USERS.admin);
      const item = await listingFor(driver, nome);
      await item.findElement(By.xpath('.//button[normalize-space(.)="Publicar"]')).click();
      await driver.wait(until.stalenessOf(item), 10000);
    });

    it('comprador passa a ver a peça publicada com vendedor e status do passaporte', async () => {
      await as(driver, USERS.comprador);
      const names = await searchCatalog(driver, { min: valor, max: valor });
      assert.deepEqual(names, [nome]);
      const card = await driver.findElement(By.css('a[href^="/peca/"]'));
      const text = await card.getText();
      assert.match(text, new RegExp(USERS.vendedor.nome));
      assert.match(text, /em revisão/i);
    });
  });

  describe('RFS02 - Consultar Peça (Comprador)', () => {
    before(async () => {
      await as(driver, USERS.comprador);
    });

    it('filtra por categoria', async () => {
      const names = await searchCatalog(driver, { categoria: 'joia', min: valor, max: valor });
      assert.ok(names.includes(nome));
      const outras = await searchCatalog(driver, { categoria: 'relógio', min: valor, max: valor });
      assert.ok(!outras.includes(nome));
    });

    it('filtra por faixa de valor', async () => {
      assert.ok((await searchCatalog(driver, { min: valor - 1, max: valor + 1 })).includes(nome));
      assert.ok(!(await searchCatalog(driver, { min: valor + 1 })).includes(nome));
      assert.ok(!(await searchCatalog(driver, { max: valor - 1 })).includes(nome));
    });

    it('filtra por nome do vendedor', async () => {
      assert.ok((await searchCatalog(driver, { vendedor: 'rafael', min: valor })).includes(nome));
      assert.deepEqual(await searchCatalog(driver, { vendedor: 'vendedor-inexistente-xyz' }), []);
      await waitForText(driver, 'Nenhuma peça encontrada');
    });

    it('lista as peças em ordem alfabética pelo nome', async () => {
      const names = await searchCatalog(driver);
      const sorted = [...names].sort((a, b) => a.localeCompare(b, 'pt-BR'));
      assert.deepEqual(names, sorted);
    });

    it('exibe o detalhe da peça com valor, vendedor e status do passaporte', async () => {
      await searchCatalog(driver, { min: valor, max: valor });
      await driver.findElement(By.css('a[href^="/peca/"]')).click();
      await waitForText(driver, nome);
      await waitForText(driver, USERS.vendedor.nome);
      await waitForText(driver, 'Status do Passaporte');
      const price = await driver.findElement(By.css('p.text-2xl')).getText();
      assert.match(price.replace(/\s/g, ' '), /R\$\s7\.\d{3}\.\d{3},00/);
    });
  });

  describe('RFS03 - Editar Peça (Vendedor)', () => {
    before(async () => {
      await as(driver, USERS.vendedor);
    });

    it('edita os dados da peça e devolve o anúncio para validação', async () => {
      await clickLabeled(driver, `Editar ${nome}`);
      await driver.wait(until.elementLocated(By.id('nome')), 10000);
      await driver.wait(async () => (await driver.findElement(By.id('nome')).getAttribute('value')) === nome, 10000);
      assert.equal(await driver.findElement(By.id('categoria')).getAttribute('value'), 'joia');
      assert.equal(await driver.findElements(By.css('ul img')).then((imgs) => imgs.length), 1);

      await fill(driver, 'valor', String(valorEditado));
      await clickButton(driver, 'Salvar Alterações');
      await waitForPath(driver, '/dashboard');

      await waitForText(driver, nome);
      const row = (await tableRows(driver)).find((r) => r.includes(nome));
      assert.match(row, /7\.\d{3}\.\d{3},00/);
      assert.match(row, /Em validação/);
    });

    it('a peça editada some do catálogo até ser validada novamente', async () => {
      await as(driver, USERS.comprador);
      assert.ok(!(await searchCatalog(driver, { min: valorEditado, max: valorEditado })).includes(nome));
    });

    it('administrador pode rejeitar o anúncio e o vendedor vê a situação', async () => {
      await as(driver, USERS.admin);
      const item = await listingFor(driver, nome);
      await item.findElement(By.xpath('.//button[normalize-space(.)="Rejeitar"]')).click();
      await driver.wait(until.stalenessOf(item), 10000);

      await as(driver, USERS.vendedor);
      await waitForText(driver, nome);
      assert.match((await tableRows(driver)).find((r) => r.includes(nome)), /Rejeitada/);
    });
  });

  describe('RFS04 - Remover Peça (Vendedor)', () => {
    before(async () => {
      await as(driver, USERS.vendedor);
    });

    it('remove a peça após confirmação', async () => {
      await waitForText(driver, nome);
      await clickLabeled(driver, `Remover ${nome}`);
      await driver.wait(until.alertIsPresent(), 5000);
      await driver.switchTo().alert().accept();

      await driver.wait(async () => !(await tableRows(driver)).some((r) => r.includes(nome)), 10000);
    });

    it('não remove a peça quando a confirmação é cancelada', async () => {
      const outra = (await tableRows(driver))[0];
      const outraNome = outra.split(/[\t\n]/)[0];
      await clickLabeled(driver, `Remover ${outraNome}`);
      await driver.wait(until.alertIsPresent(), 5000);
      await driver.switchTo().alert().dismiss();

      assert.ok((await tableRows(driver)).some((r) => r.includes(outraNome)));
    });
  });
});

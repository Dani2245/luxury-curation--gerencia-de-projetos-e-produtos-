import assert from 'node:assert/strict';
import webdriver from 'selenium-webdriver';
import { USERS } from './helpers/config.js';
import { cleanupE2E, createPublishedPecaApi, issuePassportApi } from './helpers/api.js';
import {
  clearSession, clickButton, clickLabeled, createDriver, fill, loginAndWaitDashboard, open,
  tableRows, waitForText
} from './helpers/browser.js';

const { By, until } = webdriver;

const stamp = Date.now();
const prefix = `E2E Transação ${stamp}`;
const valor = 4000000 + (stamp % 100000);

const as = async (driver, user) => {
  await clearSession(driver);
  await loginAndWaitDashboard(driver, user.email);
};

const bodyText = (driver) => driver.executeScript('return document.body.innerText');

const openTransactions = async (driver) => {
  await open(driver, '/dashboard/transacoes');
  await driver.wait(until.elementLocated(By.id('t-peca')), 10000);
};

const rowOf = async (driver, nome) => {
  await driver.wait(async () => (await tableRows(driver)).some((row) => row.includes(nome)), 10000, `Linha não encontrada: ${nome}`);
  return (await tableRows(driver)).find((row) => row.includes(nome));
};

const filterByPiece = async (driver, nome) => {
  await fill(driver, 't-peca', nome);
  await clickButton(driver, 'Buscar');
};

const sendProposal = async (driver, pecaId, proposalValue) => {
  await open(driver, `/peca/${pecaId}`);
  await driver.wait(until.elementLocated(By.id('proposta-valor')), 10000);
  if (proposalValue !== undefined) await fill(driver, 'proposta-valor', String(proposalValue));
  await clickButton(driver, 'Enviar Proposta');
  await waitForText(driver, 'Proposta registrada.');
};

// RFC04 - Manter Transações (RFS13 a RFS16) e atualização do passaporte (RFS08)
describe('RFC04 - Manter Transações', function () {
  let driver;
  let comPassaporte;
  let semPassaporte;

  before(async () => {
    comPassaporte = await createPublishedPecaApi({ nome: `${prefix} A`, valor });
    await issuePassportApi(comPassaporte.id, { proprietarios: 'Colecionador Anterior' });
    semPassaporte = await createPublishedPecaApi({ nome: `${prefix} B`, valor: valor + 1 });
    driver = await createDriver();
  });

  after(async () => {
    await driver.quit();
    await cleanupE2E();
  });

  describe('RFS13 - Inserir Transação', () => {
    it('somente comprador e administrador veem o envio de proposta; o vendedor não', async () => {
      await as(driver, USERS.vendedor);
      await open(driver, `/peca/${comPassaporte.id}`);
      await waitForText(driver, 'Passaporte Digital');
      assert.equal((await driver.findElements(By.id('proposta-valor'))).length, 0);

      await as(driver, USERS.perito);
      await open(driver, `/peca/${comPassaporte.id}`);
      await waitForText(driver, 'Passaporte Digital');
      assert.equal((await driver.findElements(By.id('proposta-valor'))).length, 0);
    });

    it('exige um valor maior que zero', async () => {
      await as(driver, USERS.comprador);
      await open(driver, `/peca/${comPassaporte.id}`);
      await driver.wait(until.elementLocated(By.id('proposta-valor')), 10000);
      await fill(driver, 'proposta-valor', '0');
      await clickButton(driver, 'Enviar Proposta');
      assert.equal(await driver.executeScript('return document.getElementById("proposta-valor").checkValidity()'), false);
    });

    it('o comprador registra uma proposta de compra com o valor oferecido', async () => {
      await sendProposal(driver, comPassaporte.id, valor - 500);
      await openTransactions(driver);
      await filterByPiece(driver, `${prefix} A`);
      const row = await rowOf(driver, `${prefix} A`);
      assert.match(row, /Aguardando vendedor/);
      assert.match(row, /Beatriz Almeida/);
      assert.match(row, /Rafael Moreira/);
      assert.match(row, /R\$/);
    });

    it('a peça passa a constar em negociação e não aceita outra proposta', async () => {
      await open(driver, `/peca/${comPassaporte.id}`);
      await waitForText(driver, 'Esta peça possui uma proposta em andamento.');
      assert.equal((await driver.findElements(By.id('proposta-valor'))).length, 0);

      await as(driver, USERS.admin);
      await open(driver, `/peca/${comPassaporte.id}`);
      await waitForText(driver, 'Esta peça possui uma proposta em andamento.');
    });

    it('o vendedor não consegue editar nem remover a peça em negociação (RFS03 e RFS04)', async () => {
      await as(driver, USERS.vendedor);
      await waitForText(driver, `${prefix} A`);
      const row = await rowOf(driver, `${prefix} A`);
      assert.match(row, /Em negociação/);
      const remove = await driver.findElement(By.css(`[aria-label="Remover ${prefix} A"]`));
      assert.equal(await remove.isEnabled(), false);
      const edit = await driver.findElement(By.css(`[aria-label="Editar ${prefix} A"]`));
      assert.match(await edit.getAttribute('class'), /pointer-events-none/);
    });

    it('o administrador registra a proposta em nome de um comprador', async () => {
      await as(driver, USERS.admin);
      await open(driver, `/peca/${semPassaporte.id}`);
      await driver.wait(until.elementLocated(By.id('proposta-comprador')), 10000);
      await driver.wait(async () => (await driver.findElements(By.css('#proposta-comprador option'))).length > 0, 10000);
      await clickButton(driver, 'Enviar Proposta');
      await waitForText(driver, 'Proposta registrada.');

      await openTransactions(driver);
      await filterByPiece(driver, `${prefix} B`);
      assert.match(await rowOf(driver, `${prefix} B`), /Beatriz Almeida/);
    });
  });

  describe('RFS16 - Cancelar Transação', () => {
    it('o comprador não vê a confirmação, apenas o cancelamento', async () => {
      await as(driver, USERS.comprador);
      await openTransactions(driver);
      await filterByPiece(driver, `${prefix} A`);
      await rowOf(driver, `${prefix} A`);
      assert.equal((await driver.findElements(By.css(`[aria-label="Confirmar venda de ${prefix} A"]`))).length, 0);
      assert.equal((await driver.findElements(By.css(`[aria-label="Cancelar transação de ${prefix} A"]`))).length, 1);
    });

    it('o vendedor cancela a transação não confirmada informando o motivo', async () => {
      await as(driver, USERS.vendedor);
      await openTransactions(driver);
      await filterByPiece(driver, `${prefix} A`);
      await rowOf(driver, `${prefix} A`);
      await clickLabeled(driver, `Cancelar transação de ${prefix} A`);
      await driver.wait(until.alertIsPresent(), 5000);
      const prompt = driver.switchTo().alert();
      await prompt.sendKeys('Valor abaixo do esperado');
      await prompt.accept();

      await waitForText(driver, 'Transação cancelada.');
      await driver.wait(async () => /Cancelada/.test(await rowOf(driver, `${prefix} A`)), 10000);
      assert.match(await rowOf(driver, `${prefix} A`), /Valor abaixo do esperado/);
      assert.equal((await driver.findElements(By.css(`[aria-label="Cancelar transação de ${prefix} A"]`))).length, 0);
    });

    it('a peça volta a ficar disponível para novas propostas e pode ser editada', async () => {
      await as(driver, USERS.comprador);
      await open(driver, `/peca/${comPassaporte.id}`);
      await driver.wait(until.elementLocated(By.id('proposta-valor')), 10000);

      await as(driver, USERS.vendedor);
      await waitForText(driver, `${prefix} A`);
      const edit = await driver.findElement(By.css(`[aria-label="Editar ${prefix} A"]`));
      assert.doesNotMatch(await edit.getAttribute('class'), /pointer-events-none/);
    });
  });

  describe('RFS15 - Confirmar Transação e atualização do passaporte (RFC04)', () => {
    it('o vendedor confirma a venda: comissão gerada e peça vendida', async () => {
      await as(driver, USERS.comprador);
      await sendProposal(driver, comPassaporte.id, valor);

      await as(driver, USERS.vendedor);
      await openTransactions(driver);
      await filterByPiece(driver, `${prefix} A`);
      await driver.wait(async () => (await tableRows(driver)).some((r) => r.includes('Aguardando vendedor')), 10000);
      await clickLabeled(driver, `Confirmar venda de ${prefix} A`);
      await driver.wait(until.alertIsPresent(), 5000);
      await driver.switchTo().alert().accept();

      await waitForText(driver, 'Venda confirmada. O passaporte digital foi atualizado com o novo proprietário.');
      await driver.wait(async () => (await tableRows(driver)).some((r) => r.includes('Confirmada')), 10000);
      const confirmed = (await tableRows(driver)).find((r) => r.includes('Confirmada'));
      assert.match(confirmed, /Comissão R\$/);
      assert.ok(!confirmed.includes('Transferência pendente'));
    });

    it('a comissão não é exibida ao comprador', async () => {
      await as(driver, USERS.comprador);
      await openTransactions(driver);
      await filterByPiece(driver, `${prefix} A`);
      await driver.wait(async () => (await tableRows(driver)).some((r) => r.includes('Confirmada')), 10000);
      assert.ok(!(await bodyText(driver)).includes('Comissão'));
    });

    it('a peça vendida fica bloqueada para edição e remoção', async () => {
      await as(driver, USERS.vendedor);
      await waitForText(driver, `${prefix} A`);
      assert.match(await rowOf(driver, `${prefix} A`), /Vendida/);
      const remove = await driver.findElement(By.css(`[aria-label="Remover ${prefix} A"]`));
      assert.equal(await remove.isEnabled(), false);
      const edit = await driver.findElement(By.css(`[aria-label="Editar ${prefix} A"]`));
      assert.match(await edit.getAttribute('class'), /pointer-events-none/);
    });

    it('o passaporte registra o novo proprietário automaticamente', async () => {
      await as(driver, USERS.comprador);
      await open(driver, `/peca/${comPassaporte.id}/passaporte`);
      await waitForText(driver, 'Assinatura válida');
      const text = await bodyText(driver);
      assert.match(text, /Colecionador Anterior/);
      assert.match(text, /Rafael Moreira/);
      assert.match(text, /Beatriz Almeida\s*ATUAL/i);
      assert.match(text, /Transferência de propriedade registrada após a venda/);
      assert.match(text, /Identidade dos proprietários: privada/i);
    });

    it('a peça vendida não aceita novas propostas', async () => {
      await as(driver, USERS.admin);
      await open(driver, `/peca/${comPassaporte.id}`);
      await waitForText(driver, 'Esta peça já foi vendida.');
    });
  });

  describe('RFS08 - Registrar Transferência no Passaporte (Administrador)', () => {
    it('venda de peça sem passaporte deixa a transferência pendente', async () => {
      await as(driver, USERS.vendedor);
      await openTransactions(driver);
      await filterByPiece(driver, `${prefix} B`);
      await driver.wait(async () => (await tableRows(driver)).some((r) => r.includes('Aguardando vendedor')), 10000);
      await clickLabeled(driver, `Confirmar venda de ${prefix} B`);
      await driver.wait(until.alertIsPresent(), 5000);
      await driver.switchTo().alert().accept();
      await waitForText(driver, 'Venda confirmada.');

      await as(driver, USERS.admin);
      await openTransactions(driver);
      await filterByPiece(driver, `${prefix} B`);
      await driver.wait(async () => (await tableRows(driver)).some((r) => r.includes('Transferência pendente')), 10000);
    });

    it('o administrador registra a transferência depois que o passaporte é emitido', async () => {
      await issuePassportApi(semPassaporte.id, { proprietarios: 'Primeiro Dono' });
      await openTransactions(driver);
      await filterByPiece(driver, `${prefix} B`);
      await driver.wait(async () => (await tableRows(driver)).some((r) => r.includes('Transferência pendente')), 10000);
      await clickLabeled(driver, `Registrar transferência de ${prefix} B`);

      await waitForText(driver, 'Transferência registrada no passaporte digital.');
      await driver.wait(async () => !(await tableRows(driver)).some((r) => r.includes('Transferência pendente')), 10000);

      await open(driver, `/peca/${semPassaporte.id}/passaporte`);
      await waitForText(driver, 'Assinatura válida');
      const text = await bodyText(driver);
      assert.match(text, /Primeiro Dono/);
      assert.match(text, /Rafael Moreira/);
      assert.match(text, /Beatriz Almeida\s*ATUAL/i);
    });
  });

  describe('RFS14 - Consultar Transação', () => {
    before(async () => {
      await as(driver, USERS.admin);
      await openTransactions(driver);
    });

    it('filtra por peça, comprador e vendedor', async () => {
      await filterByPiece(driver, prefix);
      await driver.wait(async () => (await tableRows(driver)).filter((r) => r.includes(prefix)).length === 3, 10000);

      await fill(driver, 't-comprador', 'Beatriz');
      await fill(driver, 't-vendedor', 'Rafael');
      await clickButton(driver, 'Buscar');
      await driver.wait(async () => (await tableRows(driver)).filter((r) => r.includes(prefix)).length === 3, 10000);

      await fill(driver, 't-comprador', 'Ninguém Cadastrado');
      await clickButton(driver, 'Buscar');
      await waitForText(driver, 'Nenhuma transação encontrada.');
    });

    it('filtra por período', async () => {
      await fill(driver, 't-comprador', '');
      await fill(driver, 't-vendedor', '');
      // campo de data no formato do navegador (dd/mm/aaaa)
      const today = new Date().toLocaleDateString('pt-BR').replaceAll('/', '');
      await fill(driver, 't-inicio', today);
      await clickButton(driver, 'Buscar');
      await driver.wait(async () => (await tableRows(driver)).filter((r) => r.includes(prefix)).length === 3, 10000);

      await fill(driver, 't-inicio', '01012100');
      await clickButton(driver, 'Buscar');
      await waitForText(driver, 'Nenhuma transação encontrada.');
    });

    it('comprador e vendedor consultam somente as próprias transações', async () => {
      await as(driver, USERS.comprador);
      await openTransactions(driver);
      await filterByPiece(driver, prefix);
      await driver.wait(async () => (await tableRows(driver)).filter((r) => r.includes(prefix)).length === 3, 10000);
      assert.equal((await driver.findElements(By.id('t-comprador'))).length, 0);

      await as(driver, USERS.perito);
      await open(driver, '/dashboard/transacoes');
      await waitForText(driver, 'Painel do Perito');
    });
  });
});

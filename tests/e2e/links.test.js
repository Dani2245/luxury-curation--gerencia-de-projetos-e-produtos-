import assert from 'node:assert/strict';
import webdriver from 'selenium-webdriver';
import { USERS } from './helpers/config.js';
import {
  cleanupE2E, confirmSaleApi, createLinkApi, createPublishedPecaApi, issuePassportApi, proposeApi, requestAs
} from './helpers/api.js';
import {
  clearSession, clickButton, clickLabeled, createDriver, fill, loginAndWaitDashboard, open, waitForPath, waitForText
} from './helpers/browser.js';

const { By, until } = webdriver;

const stamp = Date.now();
const prefix = `E2E Link ${stamp}`;
const valor = 5000000 + (stamp % 100000);

const as = async (driver, user) => {
  await clearSession(driver);
  await loginAndWaitDashboard(driver, user.email);
};

const bodyText = (driver) => driver.executeScript('return document.body.innerText');

const openPassport = async (driver, pecaId) => {
  await open(driver, `/peca/${pecaId}/passaporte`);
  await waitForText(driver, 'Assinatura válida');
};

// Visitante sem cadastro: sessão limpa antes de abrir o link
const openAsVisitor = async (driver, path) => {
  await clearSession(driver);
  await open(driver, path);
};

const newestLink = async (driver) => {
  const item = await driver.wait(until.elementLocated(By.css('[data-testid^="link-"]')), 10000);
  const id = (await item.getAttribute('data-testid')).replace('link-', '');
  const url = await driver.findElement(By.css(`[aria-label="Endereço do link ${id}"]`)).getAttribute('value');
  return { id, path: new URL(url).pathname, item };
};

const linkText = (driver, id) => driver.findElement(By.css(`[data-testid="link-${id}"]`)).getText();

const toggle = async (driver, id) => {
  const box = await driver.findElement(By.id(id));
  await driver.executeScript('arguments[0].scrollIntoView({block: "center"})', box);
  await box.click();
};

// RFC16 - Manter Links de Compartilhamento do Passaporte (RFS53 a RFS56)
describe('RFC16 - Links de Compartilhamento do Passaporte', function () {
  let driver;
  let peca;
  let link;

  before(async () => {
    peca = await createPublishedPecaApi({ nome: `${prefix} A`, valor });
    await issuePassportApi(peca.id, { proprietarios: 'Colecionador Anterior' });
    driver = await createDriver();
  });

  after(async () => {
    await driver.quit();
    await cleanupE2E();
  });

  describe('RFS53 - Inserir Link (proprietário)', () => {
    it('somente o proprietário atual vê a área de compartilhamento', async () => {
      for (const user of [USERS.comprador, USERS.perito, USERS.admin]) {
        await as(driver, user);
        await openPassport(driver, peca.id);
        assert.equal((await driver.findElements(By.id('compartilhar'))).length, 0, `${user.perfil} não deve compartilhar`);
      }
      await as(driver, USERS.vendedor);
      await openPassport(driver, peca.id);
      await waitForText(driver, 'Compartilhar passaporte');
    });

    it('a identidade do dono e o valor ficam privados por padrão (RNF04)', async () => {
      for (const campo of ['identidade_proprietarios', 'valor']) {
        assert.equal(await driver.findElement(By.id(`campo-${campo}`)).isSelected(), false, `${campo} deve iniciar privado`);
      }
      for (const campo of ['descricao', 'fotografias', 'documentos', 'historico_proprietarios', 'historico_eventos']) {
        assert.equal(await driver.findElement(By.id(`campo-${campo}`)).isSelected(), true, `${campo} deve iniciar público`);
      }
    });

    it('gera o link com os campos públicos escolhidos e o destinatário', async () => {
      await fill(driver, 'link-destinatario', 'Aline, colecionadora');
      await clickButton(driver, 'Gerar link');
      await waitForText(driver, 'Link gerado.');

      link = await newestLink(driver);
      assert.match(link.path, /^\/p\/[0-9a-f]{32}$/);
      const text = await linkText(driver, link.id);
      assert.match(text, /Ativo/i);
      assert.match(text, /Para: Aline, colecionadora/);
      assert.match(text, /0 acessos \(0 pelo QR code\)/);
      assert.match(text, /Sem validade/);
    });

    it('gera o QR code do passaporte para impressão e download', async () => {
      await clickLabeled(driver, `QR code do link ${link.id}`);
      const canvas = await driver.wait(until.elementLocated(By.id(`qr-${link.id}`)), 5000);
      assert.ok(await canvas.isDisplayed());
      assert.ok(Number(await canvas.getAttribute('width')) > 0);
      await waitForText(driver, 'Baixar QR code');
    });
  });

  describe('RFS54 - Consultar Link (visitante sem cadastro)', () => {
    it('o visitante abre o passaporte pelo link, só com os campos públicos', async () => {
      await openAsVisitor(driver, link.path);
      await waitForText(driver, 'Assinatura válida');
      const text = await bodyText(driver);
      assert.match(text, new RegExp(`${prefix} A`));
      assert.match(text, /Consulta pública/i);
      assert.match(text, /Perito responsável\s+Carlos Menezes/);
      assert.match(text, /Certificados de autenticidade/i);
      assert.match(text, /Proprietário 1/);
      assert.match(text, /Histórico de autenticidade/);
      assert.ok(!text.includes('Colecionador Anterior'), 'identidade dos proprietários deve ficar privada');
      assert.ok(!text.includes(USERS.vendedor.nome), 'identidade do dono deve ficar privada');
      assert.ok(!text.includes('Valor:'), 'valor deve ficar privado');
      assert.match(text, /ACESSO PRIVADO/);
    });

    it('a consulta pelo link não dá acesso às áreas privadas', async () => {
      await open(driver, '/dashboard');
      await waitForPath(driver, '/login');
    });

    it('o acesso pelo QR code também é registrado', async () => {
      await openAsVisitor(driver, `${link.path}?origem=qr`);
      await waitForText(driver, 'Assinatura válida');
    });

    it('quem gerou vê os acessos registrados, separando link e QR code', async () => {
      await as(driver, USERS.vendedor);
      await openPassport(driver, peca.id);
      await waitForText(driver, '2 acessos (1 pelo QR code)');
      await clickLabeled(driver, `Acessos do link ${link.id}`);
      const historico = await driver.wait(until.elementLocated(By.css(`[aria-label="Histórico de acessos do link ${link.id}"]`)), 5000);
      const text = await historico.getText();
      assert.match(text, /QR code/);
      assert.match(text, /Link/);
    });
  });

  describe('RFS55 - Editar Link (proprietário)', () => {
    it('torna públicos a identidade e o valor e define a validade', async () => {
      await clickLabeled(driver, `Editar link ${link.id}`);
      await waitForText(driver, 'Salvar alterações');
      assert.equal(await driver.findElement(By.id('link-destinatario')).isEnabled(), false);
      await toggle(driver, 'campo-identidade_proprietarios');
      await toggle(driver, 'campo-valor');
      // campo de data no formato do navegador (dd/mm/aaaa)
      await fill(driver, 'link-validade', '31122099');
      await clickButton(driver, 'Salvar alterações');
      await waitForText(driver, 'Link atualizado.');
      assert.match(await linkText(driver, link.id), /Válido até 31\/12\/2099/);

      await openAsVisitor(driver, link.path);
      await waitForText(driver, 'Assinatura válida');
      const text = await bodyText(driver);
      assert.match(text, /Colecionador Anterior/);
      assert.match(text, new RegExp(USERS.vendedor.nome));
      assert.match(text, /Valor: R\$/);
    });

    it('não aceita validade anterior a hoje', async () => {
      await as(driver, USERS.vendedor);
      await openPassport(driver, peca.id);
      await clickLabeled(driver, `Editar link ${link.id}`);
      await fill(driver, 'link-validade', '01012020');
      await clickButton(driver, 'Salvar alterações');
      assert.equal(await driver.executeScript('return document.getElementById("link-validade").checkValidity()'), false);

      const { status, data } = await requestAs(USERS.vendedor, `/links/${link.id}`, {
        method: 'PUT',
        body: { camposPublicos: ['descricao'], validade: '2020-01-01' }
      });
      assert.equal(status, 400);
      assert.equal(data.message, 'A validade não pode ser anterior a hoje');
    });

    it('somente o proprietário altera o link', async () => {
      const { status } = await requestAs(USERS.comprador, `/links/${link.id}`, {
        method: 'PUT',
        body: { camposPublicos: ['descricao'], validade: null }
      });
      assert.equal(status, 404);
    });
  });

  describe('RFS56 - Remover Link (revogar)', () => {
    it('revoga o link, que deixa de dar acesso na hora', async () => {
      await as(driver, USERS.vendedor);
      await openPassport(driver, peca.id);
      await clickLabeled(driver, `Revogar link ${link.id}`);
      await driver.wait(until.alertIsPresent(), 5000);
      await driver.switchTo().alert().accept();
      await waitForText(driver, 'Link revogado.');
      assert.match(await linkText(driver, link.id), /Revogado/i);
      assert.equal((await driver.findElements(By.css(`[aria-label="Copiar link ${link.id}"]`))).length, 0);

      await openAsVisitor(driver, link.path);
      await waitForText(driver, 'Link indisponível');
      assert.match(await bodyText(driver), /revogado pelo proprietário/);
    });

    it('informa quando o link não existe', async () => {
      await openAsVisitor(driver, `/p/${'0'.repeat(32)}`);
      await waitForText(driver, 'Link de passaporte não encontrado');
    });

    it('após a venda, o link do antigo dono é encerrado e o novo dono passa a compartilhar', async () => {
      const vendida = await createPublishedPecaApi({ nome: `${prefix} B`, valor: valor + 1 });
      const passaporte = await issuePassportApi(vendida.id);
      const antigo = await createLinkApi(passaporte.id);
      const proposta = await proposeApi(vendida.id, valor);
      await confirmSaleApi(proposta.id);

      await openAsVisitor(driver, `/p/${antigo.token}`);
      await waitForText(driver, 'Link indisponível');
      assert.match(await bodyText(driver), /a peça mudou de proprietário/);

      await as(driver, USERS.comprador);
      await openPassport(driver, vendida.id);
      await waitForText(driver, 'Compartilhar passaporte');
      await clickButton(driver, 'Gerar link');
      await waitForText(driver, 'Link gerado.');
      const novo = await newestLink(driver);

      await openAsVisitor(driver, novo.path);
      await waitForText(driver, 'Assinatura válida');
      assert.match(await bodyText(driver), new RegExp(`${prefix} B`));
    });
  });
});

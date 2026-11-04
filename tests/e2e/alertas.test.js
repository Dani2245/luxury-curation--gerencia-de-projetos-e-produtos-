import assert from 'node:assert/strict';
import webdriver from 'selenium-webdriver';
import { USERS } from './helpers/config.js';
import {
  cleanupE2E, createListApi, createPublishedPecaApi, deleteAlertsApi, deleteListsApi, issuePassportApi, requestAs
} from './helpers/api.js';
import {
  clearSession, clickButton, clickLabeled, createDriver, loginAndWaitDashboard, open, select, waitForPath, waitForText
} from './helpers/browser.js';

const { By, until } = webdriver;

const stamp = Date.now();
const prefix = `E2E Alerta ${stamp}`;
const base = 30000000 + (stamp % 1000000) * 1000;

const as = async (driver, user) => {
  await clearSession(driver);
  await loginAndWaitDashboard(driver, user.email);
};

const openAlerts = async (driver) => {
  await open(driver, '/dashboard/alertas');
  await waitForText(driver, 'Meus alertas');
};

const alertItem = async (driver, id) => driver.wait(until.elementLocated(By.css(`[data-testid="alerta-${id}"]`)), 10000);

const notificationsOf = (driver, texto) =>
  driver.executeScript(
    'return [...document.querySelectorAll(\'[data-testid^="notificacao-"]\')].filter((li) => li.innerText.includes(arguments[0])).map((li) => ({ id: li.dataset.testid.slice(12), texto: li.innerText, naoLida: li.querySelector(\'[data-testid="nao-lida"]\') !== null }))',
    texto
  );

const waitNotification = async (driver, texto) => {
  await driver.wait(async () => (await notificationsOf(driver, texto)).length > 0, 10000, `Notificação não encontrada: ${texto}`);
  return (await notificationsOf(driver, texto))[0];
};

const accept = async (driver) => {
  await driver.wait(until.alertIsPresent(), 5000);
  await driver.switchTo().alert().accept();
};

// RFC21 - Manter Alertas e Lembretes (RFS73 a RFS76), opcionais e desligáveis (RNF05)
describe('RFC21 - Alertas e Lembretes', function () {
  let driver;
  let lista;
  let alertaId;
  let primeira;

  before(async () => {
    await deleteAlertsApi(USERS.comprador);
    await deleteAlertsApi(USERS.vendedor);
    lista = await createListApi({ nome: `${prefix} Relógios`, categorias: ['relógio'], valorMin: base, valorMax: base + 100 });
    // passaporte só com o certificado: faltam laudo, nota fiscal e fotografia
    const anel = await createPublishedPecaApi({ nome: `${prefix} Anel`, categoria: 'joia', valor: base + 500 });
    await issuePassportApi(anel.id);
    driver = await createDriver();
  });

  after(async () => {
    await driver.quit();
    await deleteAlertsApi(USERS.comprador);
    await deleteAlertsApi(USERS.vendedor);
    await deleteListsApi(prefix);
    await cleanupE2E();
  });

  describe('RFS73 - Inserir Alerta', () => {
    it('o comprador configura alerta de peça compatível, semanal e na plataforma por padrão', async () => {
      await as(driver, USERS.comprador);
      await openAlerts(driver);
      await select(driver, 'alerta-lista', String(lista.id));
      assert.equal(await driver.findElement(By.id('alerta-frequencia')).getAttribute('value'), 'semanal');
      assert.equal(await driver.findElement(By.id('alerta-canal')).getAttribute('value'), 'plataforma');
      assert.equal(await driver.findElement(By.css('#alerta-canal option[value="email"]')).isEnabled(), false);
      await clickButton(driver, 'Criar alerta');
      await waitForText(driver, 'Alerta criado.');

      const { data } = await requestAs(USERS.comprador, '/alertas');
      alertaId = data.find((a) => a.listaId === lista.id).id;
      const text = await (await alertItem(driver, alertaId)).getText();
      assert.match(text, /Peça compatível com lista de desejos/);
      assert.match(text, new RegExp(`Lista: ${prefix} Relógios`));
      assert.match(text, /Nenhum envio ainda · Sai assim que houver novidade/);
      assert.match(text, /Ligado/i);
    });

    it('não permite dois alertas para a mesma lista', async () => {
      const { status, data } = await requestAs(USERS.comprador, '/alertas', { method: 'POST', body: { tipo: 'peca compativel', listaId: lista.id } });
      assert.equal(status, 409);
      assert.equal(data.message, 'Já existe um alerta para esta lista de desejos');
    });

    it('o vendedor configura o lembrete de passaportes incompletos, mensal por padrão', async () => {
      await as(driver, USERS.vendedor);
      await openAlerts(driver);
      await waitForText(driver, 'Passaportes do estoque');
      const estoque = await driver.findElement(By.css('section[aria-labelledby="passaportes-estoque"]')).getText();
      assert.match(estoque, new RegExp(`${prefix} Anel\\s+Falta: laudo pericial, nota fiscal, fotografias da peça`));
      assert.equal(await driver.findElement(By.id('alerta-frequencia')).getAttribute('value'), 'mensal');
      await clickButton(driver, 'Criar alerta');
      await waitForText(driver, 'Alerta criado.');
      await waitForText(driver, 'Passaportes incompletos no estoque');
    });

    it('somente comprador e vendedor configuram alertas', async () => {
      for (const user of [USERS.perito, USERS.admin]) {
        await as(driver, user);
        await open(driver, '/dashboard/alertas');
        await waitForPath(driver, '/dashboard');
        const { status } = await requestAs(user, '/alertas', { method: 'POST', body: { tipo: 'passaporte incompleto' } });
        assert.equal(status, 403);
      }
    });
  });

  describe('RFS74 - Consultar Alerta e envio na plataforma', () => {
    it('o vendedor recebe o lembrete na plataforma com o que falta em cada peça', async () => {
      await as(driver, USERS.vendedor);
      const notificacao = await waitNotification(driver, 'com passaporte incompleto');
      assert.match(notificacao.texto, new RegExp(`${prefix} Anel: falta laudo pericial, nota fiscal, fotografias da peça`));
    });

    it('o comprador é avisado quando a curadoria publica uma peça compatível', async () => {
      primeira = await createPublishedPecaApi({ nome: `${prefix} Relógio Raro`, categoria: 'relógio', valor: base + 10 });
      await as(driver, USERS.comprador);
      const notificacao = await waitNotification(driver, `Nova peça compatível com "${prefix} Relógios"`);
      assert.match(notificacao.texto, new RegExp(`${prefix} Relógio Raro`));
      assert.ok(notificacao.naoLida);
    });

    it('abrir o alerta leva à lista de desejos e marca como lido', async () => {
      const notificacao = await waitNotification(driver, `"${prefix} Relógios"`);
      await clickLabeled(driver, `Abrir notificação ${notificacao.id}`);
      await waitForPath(driver, `/dashboard/listas/${lista.id}`);
      await waitForText(driver, `${prefix} Relógio Raro`);

      await open(driver, '/dashboard');
      await driver.wait(async () => !(await waitNotification(driver, `"${prefix} Relógios"`)).naoLida, 10000);
    });

    it('respeita a frequência: não repete o aviso antes do próximo período', async () => {
      await createPublishedPecaApi({ nome: `${prefix} Relógio Segundo`, categoria: 'relógio', valor: base + 20 });
      await open(driver, '/dashboard');
      await waitNotification(driver, `"${prefix} Relógios"`);
      assert.equal((await notificationsOf(driver, `"${prefix} Relógios"`)).length, 1);

      await openAlerts(driver);
      const proximo = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString('pt-BR');
      assert.match(await (await alertItem(driver, alertaId)).getText(), new RegExp(`Próximo envio a partir de ${proximo}`));
    });

    it('mostra o histórico de envios do alerta', async () => {
      await clickLabeled(driver, `Histórico do alerta ${alertaId}`);
      const historico = await driver.wait(until.elementLocated(By.css(`[aria-label="Envios do alerta ${alertaId}"]`)), 5000);
      const text = await historico.getText();
      assert.match(text, /Nova peça compatível/);
      assert.match(text, new RegExp(`${prefix} Relógio Raro`));
      assert.ok(primeira.id);
    });
  });

  describe('RFS75 - Editar Alerta', () => {
    it('altera a frequência; o e-mail ainda não está disponível', async () => {
      await select(driver, `alerta-${alertaId}-frequencia`, 'mensal');
      await clickLabeled(driver, `Salvar alerta ${alertaId}`);
      await waitForText(driver, 'Alerta atualizado.');
      assert.equal(await driver.findElement(By.id(`alerta-${alertaId}-frequencia`)).getAttribute('value'), 'mensal');

      const { status, data } = await requestAs(USERS.comprador, `/alertas/${alertaId}`, { method: 'PUT', body: { frequencia: 'semanal', canal: 'email' } });
      assert.equal(status, 400);
      assert.equal(data.message, 'O envio por e-mail ainda não está disponível. Use a plataforma');
    });

    it('desliga e religa o alerta com uma única ação', async () => {
      await clickLabeled(driver, `Ligar ou desligar alerta ${alertaId}`);
      await waitForText(driver, 'Alerta desligado.');
      let text = await (await alertItem(driver, alertaId)).getText();
      assert.match(text, /Desligado: nenhum envio/);

      await clickLabeled(driver, `Ligar ou desligar alerta ${alertaId}`);
      await waitForText(driver, 'Alerta ligado.');
      text = await (await alertItem(driver, alertaId)).getText();
      assert.match(text, /Próximo envio a partir de/);
    });

    it('o administrador vê a taxa de desativação dos alertas', async () => {
      await as(driver, USERS.admin);
      await waitForText(driver, 'Taxa de desativação');
      const linha = await driver.wait(until.elementLocated(By.css('[data-testid="resumo-alerta-peca-compativel"]')), 10000);
      const desativados = Number(await linha.findElement(By.css('[data-col="desativados"]')).getText());
      const taxa = await linha.findElement(By.css('[data-col="taxa"]')).getText();
      assert.ok(desativados >= 1);
      assert.match(taxa, /^\d+(\.\d+)?%$/);
    });
  });

  describe('RFS76 - Remover Alerta', () => {
    it('exclui o alerta definitivamente, com o histórico de envios', async () => {
      await as(driver, USERS.comprador);
      await openAlerts(driver);
      await clickLabeled(driver, `Excluir alerta ${alertaId}`);
      await accept(driver);
      await waitForText(driver, 'Alerta excluído.');
      assert.equal((await driver.findElements(By.css(`[data-testid="alerta-${alertaId}"]`))).length, 0);

      const { status } = await requestAs(USERS.comprador, `/alertas/${alertaId}/envios`);
      assert.equal(status, 404);
    });
  });
});

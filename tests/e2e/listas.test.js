import assert from 'node:assert/strict';
import webdriver from 'selenium-webdriver';
import { USERS } from './helpers/config.js';
import {
  cleanupE2E, confirmSaleApi, createPublishedPecaApi, deleteListsApi, proposeApi, requestAs
} from './helpers/api.js';
import {
  alertText, clearSession, clickButton, clickLabeled, createDriver, fill, loginAndWaitDashboard, open, select,
  waitForPath, waitForText
} from './helpers/browser.js';

const { By, until } = webdriver;

const stamp = Date.now();
const prefix = `E2E Lista ${stamp}`;
// faixa de valor exclusiva desta execução, para isolar as peças compatíveis
const base = 20000000 + (stamp % 1000000) * 1000;
const brl = (valor) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
// texto literal como expressão regular: escapa caracteres especiais (o "$" de "R$") e aceita qualquer espaço
const rx = (texto) => texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s/g, '\\s');

const as = async (driver, user) => {
  await clearSession(driver);
  await loginAndWaitDashboard(driver, user.email);
};

const textOf = async (driver, testid) => {
  const element = await driver.wait(until.elementLocated(By.css(`[data-testid="${testid}"]`)), 10000);
  return element.getText();
};

const absent = async (driver, testid) => (await driver.findElements(By.css(`[data-testid="${testid}"]`))).length === 0;

// as listas do seletor chegam pela API depois que a tela abre
const selectWhenReady = async (driver, id, value) => {
  await driver.wait(until.elementLocated(By.css(`#${id} option[value="${value}"]`)), 10000, `Opção ${value} não carregou`);
  await select(driver, id, value);
};

// mensagem de sucesso (role=status); o texto tem aspas e não serve para o localizador XPath
const statusText = async (driver, esperado) => {
  await driver.wait(async () => {
    const status = await driver.findElements(By.css('[role="status"]'));
    return status.length > 0 && (await status[0].getText()).includes(esperado);
  }, 10000, `Mensagem não exibida: ${esperado}`);
};

const openList = async (driver, id) => {
  await open(driver, `/dashboard/listas/${id}`);
  await waitForText(driver, 'Peças da curadoria compatíveis');
};

// RFC22 - Manter Lista de Desejos (RFS77 a RFS80)
describe('RFC22 - Lista de Desejos', function () {
  let driver;
  let antiga;
  let relogio;
  let obra;
  let nova;
  let listaId;

  before(async () => {
    antiga = await createPublishedPecaApi({ nome: `${prefix} Colar Antigo`, categoria: 'joia', valor: base + 10 });
    relogio = await createPublishedPecaApi({ nome: `${prefix} Relógio`, categoria: 'relógio', valor: base + 20 });
    obra = await createPublishedPecaApi({ nome: `${prefix} Escultura`, categoria: 'obra de arte', valor: base + 30 });
    driver = await createDriver();
  });

  after(async () => {
    await driver.quit();
    await deleteListsApi(prefix);
    await cleanupE2E();
  });

  describe('RFS77 - Inserir Lista de Desejos (Comprador)', () => {
    it('somente o comprador mantém listas de desejos', async () => {
      await as(driver, USERS.vendedor);
      assert.equal((await driver.findElements(By.id('listas-desejos'))).length, 0);
      for (const user of [USERS.vendedor, USERS.perito, USERS.admin]) {
        const { status } = await requestAs(user, '/listas');
        assert.equal(status, 403, `${user.perfil} não deve ter listas de desejos`);
      }
      await as(driver, USERS.comprador);
      await waitForText(driver, 'Listas de desejos');
    });

    it('exige o nome da lista', async () => {
      await clickButton(driver, 'Criar lista');
      assert.equal(await driver.executeScript('return document.getElementById("lista-nome").checkValidity()'), false);
      const { status, data } = await requestAs(USERS.comprador, '/listas', { method: 'POST', body: { categorias: ['joia'] } });
      assert.equal(status, 400);
      assert.equal(data.message, 'O nome da lista é obrigatório');
    });

    it('não aceita valor mínimo maior que o máximo', async () => {
      await fill(driver, 'lista-nome', `${prefix} Inválida`);
      await fill(driver, 'lista-min', String(base + 100));
      await fill(driver, 'lista-max', String(base));
      await clickButton(driver, 'Criar lista');
      assert.equal(await alertText(driver), 'O valor mínimo não pode ser maior que o valor máximo');
    });

    it('cria uma lista por categoria e faixa de valor', async () => {
      await open(driver, '/dashboard');
      await waitForText(driver, 'Nova lista');
      await fill(driver, 'lista-nome', `${prefix} Joias`);
      await driver.findElement(By.id('lista-cat-joia')).click();
      await fill(driver, 'lista-min', String(base));
      await fill(driver, 'lista-max', String(base + 100));
      await clickButton(driver, 'Criar lista');
      await waitForText(driver, 'Lista criada.');

      const item = await driver.wait(until.elementLocated(By.xpath(`//li[@data-testid][.//a[contains(normalize-space(.), "${prefix} Joias")]]`)), 10000);
      listaId = (await item.getAttribute('data-testid')).replace('lista-', '');
      const text = await item.getText();
      assert.match(text, new RegExp(rx(`joia · ${brl(base)} a ${brl(base + 100)}`), 'i'));
      assert.match(text, /0 peças salvas · 1 compatível/);
    });

    it('salva uma peça consultada em uma lista existente', async () => {
      await open(driver, `/peca/${relogio.id}`);
      await selectWhenReady(driver, 'lista-salvar', listaId);
      await clickButton(driver, 'Salvar na lista');
      await statusText(driver, `Peça salva em "${prefix} Joias".`);
      assert.match(await textOf(driver, 'salva-em'), new RegExp(`Salva em: ${prefix} Joias`));
    });

    it('salva uma peça consultada criando uma lista nova', async () => {
      await open(driver, `/peca/${obra.id}`);
      // espera as listas carregarem para escolher "Nova lista…" com o seletor já estável
      await driver.wait(until.elementLocated(By.css(`#lista-salvar option[value="${listaId}"]`)), 10000);
      await select(driver, 'lista-salvar', 'nova');
      await fill(driver, 'lista-nova-nome', `${prefix} Favoritas`);
      await clickButton(driver, 'Salvar na lista');
      await statusText(driver, `Peça salva em "${prefix} Favoritas".`);
    });
  });

  describe('RFS78 - Consultar Lista de Desejos', () => {
    it('mostra as peças salvas com a situação de cada uma', async () => {
      await openList(driver, listaId);
      assert.match(await textOf(driver, `salva-${relogio.id}`), /disponível/i);
    });

    it('mostra as peças compatíveis da curadoria e destaca as novas', async () => {
      nova = await createPublishedPecaApi({ nome: `${prefix} Colar Novo`, categoria: 'joia', valor: base + 50 });
      await openList(driver, listaId);
      await textOf(driver, `compativel-${nova.id}`);
      const novaItem = await driver.findElement(By.css(`[data-testid="compativel-${nova.id}"]`));
      assert.equal((await novaItem.findElements(By.css('[data-testid="nova"]'))).length, 1, 'publicada depois da lista: nova');
      const antigaItem = await driver.findElement(By.css(`[data-testid="compativel-${antiga.id}"]`));
      assert.equal((await antigaItem.findElements(By.css('[data-testid="nova"]'))).length, 0, 'publicada antes da lista: não é nova');
      assert.ok(await absent(driver, `compativel-${relogio.id}`), 'relógio não combina com a lista de joias');
    });

    it('a peça salva que é vendida continua na lista, marcada como vendida', async () => {
      const proposta = await proposeApi(relogio.id, base + 20);
      await confirmSaleApi(proposta.id);
      await openList(driver, listaId);
      assert.match(await textOf(driver, `salva-${relogio.id}`), /vendida/i);
    });

    it('o administrador vê só a demanda agregada, sem identificar o comprador', async () => {
      await as(driver, USERS.admin);
      await waitForText(driver, 'Demanda das listas de desejos');
      const linha = await textOf(driver, 'demanda-joia');
      assert.match(linha, /joia/i);
      const section = await driver.findElement(By.css('section[aria-labelledby="demanda-listas"]')).getText();
      assert.ok(!section.includes(USERS.comprador.nome) && !section.includes(USERS.comprador.email), 'não deve identificar o comprador');
      assert.match(section, new RegExp(prefix));

      const { status } = await requestAs(USERS.comprador, '/listas/demanda');
      assert.equal(status, 403);
    });
  });

  describe('RFS79 - Editar Lista de Desejos', () => {
    it('altera os critérios e as peças compatíveis acompanham', async () => {
      await as(driver, USERS.comprador);
      await openList(driver, listaId);
      await clickButton(driver, 'Editar critérios');
      await fill(driver, 'lista-min', String(base + 40));
      await clickButton(driver, 'Salvar critérios');
      await waitForText(driver, 'Lista atualizada.');
      assert.match(await textOf(driver, 'criterios'), new RegExp(rx(`${brl(base + 40)} a ${brl(base + 100)}`)));
      await textOf(driver, `compativel-${nova.id}`);
      assert.ok(await absent(driver, `compativel-${antiga.id}`), 'fora da nova faixa de valor');
    });

    it('inclui uma peça compatível direto da lista', async () => {
      await clickLabeled(driver, `Salvar ${prefix} Colar Novo na lista`);
      await waitForText(driver, 'Peça salva na lista.');
      await textOf(driver, `salva-${nova.id}`);
      assert.ok(await absent(driver, `compativel-${nova.id}`));
    });

    it('retira uma peça salva da lista', async () => {
      await clickLabeled(driver, `Retirar ${prefix} Relógio`);
      await waitForText(driver, 'Peça retirada da lista.');
      assert.ok(await absent(driver, `salva-${relogio.id}`));
    });
  });

  describe('RFS80 - Remover Lista de Desejos', () => {
    it('exclui a lista e os alertas vinculados a ela', async () => {
      const alerta = await requestAs(USERS.comprador, '/alertas', { method: 'POST', body: { tipo: 'peca compativel', listaId: Number(listaId) } });
      assert.equal(alerta.status, 201);

      await openList(driver, listaId);
      await clickButton(driver, 'Excluir lista');
      await driver.wait(until.alertIsPresent(), 5000);
      await driver.switchTo().alert().accept();
      await waitForPath(driver, '/dashboard');
      await waitForText(driver, 'Listas de desejos');
      assert.ok(await absent(driver, `lista-${listaId}`));

      const { data } = await requestAs(USERS.comprador, '/alertas');
      assert.ok(!data.some((a) => a.id === alerta.data.id), 'o alerta da lista deve ser excluído junto');
    });
  });
});

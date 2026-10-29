import assert from 'node:assert/strict';
import webdriver from 'selenium-webdriver';
import { USERS } from './helpers/config.js';
import { cleanupGrowthE2E, joinWaitlistApi, requestAs } from './helpers/api.js';
import {
  alertText, clickButton, clickLabeled, createDriver, fill, loginAndWaitDashboard, open, select, waitForText
} from './helpers/browser.js';

const { By, until } = webdriver;

const stamp = Date.now();
const prefix = `E2E Growth ${stamp}`;
const codigo = `T${stamp % 100000000}`;
const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const hojeBR = hoje.split('-').reverse().join('');

const statusText = async (driver, esperado) => {
  await driver.wait(async () => {
    const status = await driver.findElements(By.css('[role="status"]'));
    return status.length > 0 && (await status[0].getText()).includes(esperado);
  }, 10000, `Mensagem não exibida: ${esperado}`);
};
const tab = async (driver, nome) => {
  await clickButton(driver, nome);
  await driver.wait(until.elementLocated(By.css(`[aria-pressed="true"]`)), 5000);
};
const item = (driver, testid) => driver.wait(until.elementLocated(By.css(`[data-testid="${testid}"]`)), 10000);
const experimentos = async (params = {}) => (await requestAs(USERS.admin, `/growth/experimentos?${new URLSearchParams(params)}`)).data;
const indicador = async () => (await requestAs(USERS.admin, '/growth/indicadores')).data.find((i) => i.codigo === codigo);
const gerarPainel = async (driver, etapa = '') => {
  await fill(driver, 'g-inicio', hojeBR);
  await fill(driver, 'g-fim', hojeBR);
  await select(driver, 'g-etapa', etapa);
  await clickButton(driver, 'Gerar painel');
};

// RFC19 - Indicadores de Growth (RFS65 a RFS68), RFC20 - Experimentos de Growth (RFS69 a RFS72) e RF04 - Painel de growth
describe('RFC19, RFC20 e RF04 - Indicadores, experimentos e painel de growth', function () {
  let driver;
  let experimento;

  before(async () => {
    driver = await createDriver();
    await loginAndWaitDashboard(driver, USERS.admin.email);
    await open(driver, '/dashboard/growth');
    await waitForText(driver, 'North Star (passaportes vivos)');
  });

  after(async () => {
    if (driver) await driver.quit();
    await cleanupGrowthE2E();
  });

  it('somente o administrador acessa indicadores, experimentos e painel', async () => {
    for (const user of [USERS.comprador, USERS.vendedor, USERS.perito]) {
      for (const path of ['/growth/experimentos', '/growth/indicadores', `/growth/painel?dataInicial=${hoje}&dataFinal=${hoje}`]) {
        assert.equal((await requestAs(user, path)).status, 403, `${user.perfil} ${path}`);
      }
    }
  });

  describe('RFC20 - Experimentos de growth', () => {
    it('RFS69 - registra o experimento e calcula o ICE Score pela média das notas', async () => {
      await tab(driver, 'Experimentos');
      await fill(driver, 'x-titulo', `${prefix} Convite por perito`);
      await select(driver, 'x-etapa', 'aquisição');
      await fill(driver, 'x-indicador', 'A4 · Contatos de vendedor por indicação');
      await fill(driver, 'x-hipotese', 'Se o perito convidar clientes que já pediram laudo, a conversão deixa de ser zero.');
      await fill(driver, 'x-impacto', '9');
      await fill(driver, 'x-confianca', '8');
      await fill(driver, 'x-facilidade', '6');
      await fill(driver, 'x-criterio', 'Pelo menos 1 de 3 indicados chega ao diagnóstico.');
      assert.equal(await driver.findElement(By.css('[data-testid="x-ice"]')).getText(), '7.7');
      await clickButton(driver, 'Salvar experimento');
      await statusText(driver, 'Experimento registrado no backlog com ICE 7.7.');
      experimento = (await experimentos()).find((x) => x.titulo === `${prefix} Convite por perito`);
      assert.equal(experimento.ice, 7.7);
      assert.equal(experimento.status, 'backlog');
    });

    it('RFS70 - mostra o backlog ordenado pelo ICE Score, com filtro por etapa e status', async () => {
      const lista = await experimentos();
      assert.ok(lista.length >= 16, 'inclui o backlog X1 a X15 do Plano de Growth');
      assert.deepEqual(lista.map((x) => x.ice), [...lista.map((x) => x.ice)].sort((a, b) => b - a));
      assert.equal(lista[0].titulo, `${prefix} Convite por perito`);

      await select(driver, 'x-f-etapa', 'retenção');
      await clickButton(driver, 'Filtrar experimentos');
      await driver.wait(async () => (await driver.findElements(By.css(`[data-testid="experimento-${experimento.id}"]`))).length === 0, 10000);
      const retencao = await experimentos({ etapa: 'retenção' });
      assert.ok(retencao.length > 0 && retencao.every((x) => x.etapa === 'retenção'));
      await select(driver, 'x-f-etapa', '');
      await clickButton(driver, 'Filtrar experimentos');
    });

    it('RFS71 - atualiza o status e só conclui com resultado e decisão', async () => {
      await clickLabeled(driver, `Editar experimento ${prefix} Convite por perito`);
      await select(driver, 'x-status', 'em execução');
      await clickButton(driver, 'Salvar experimento');
      await statusText(driver, 'Experimento atualizado.');

      await clickLabeled(driver, `Editar experimento ${prefix} Convite por perito`);
      await select(driver, 'x-status', 'concluído');
      await clickButton(driver, 'Salvar experimento');
      assert.equal(await alertText(driver), 'Para concluir o experimento, registre o resultado e a decisão tomada');
      await fill(driver, 'x-resultado', '2 de 3 indicados chegaram ao diagnóstico');
      await fill(driver, 'x-decisao', 'Escalar para os quatro laboratórios');
      await clickButton(driver, 'Salvar experimento');
      await statusText(driver, 'Experimento atualizado.');
      const texto = await (await item(driver, `experimento-${experimento.id}`)).getText();
      assert.match(texto, /concluído/);
      assert.match(texto, /Resultado: 2 de 3 indicados chegaram ao diagnóstico · Decisão: Escalar para os quatro laboratórios/);
    });

    it('RFS72 - exclui só experimentos em backlog; os concluídos ficam no histórico', async () => {
      const novo = await requestAs(USERS.admin, '/growth/experimentos', {
        method: 'POST',
        body: { titulo: `${prefix} Descartável`, hipotese: 'H', etapa: 'receita', indicador: 'F1', impacto: 2, confianca: 2, facilidade: 2, criterioSucesso: 'C' }
      });
      assert.equal(novo.status, 201);
      await clickButton(driver, 'Filtrar experimentos');
      await clickLabeled(driver, `Excluir experimento ${prefix} Descartável`);
      await driver.wait(until.alertIsPresent(), 5000);
      await driver.switchTo().alert().accept();
      await statusText(driver, 'Experimento excluído.');
      assert.ok(!(await experimentos()).some((x) => x.id === novo.data.id));

      assert.equal((await driver.findElements(By.css(`[aria-label="Excluir experimento ${prefix} Convite por perito"]`))).length, 0);
      const r = await requestAs(USERS.admin, `/growth/experimentos/${experimento.id}`, { method: 'DELETE' });
      assert.equal(r.status, 400);
      assert.equal(r.data.message, 'Só é possível excluir experimentos em backlog');
    });
  });

  describe('RFC19 - Indicadores de growth', () => {
    it('RFS65 - cadastra o indicador com fórmula, meta e frequência', async () => {
      await tab(driver, 'Indicadores');
      await fill(driver, 'i-codigo', codigo);
      await fill(driver, 'i-nome', `${prefix} Inscrições do dia`);
      await select(driver, 'i-etapa', 'aquisição');
      await select(driver, 'i-lado', 'ambos');
      await select(driver, 'i-formula', 'inscricoes_lista_espera');
      await fill(driver, 'i-min', '1');
      await select(driver, 'i-frequencia', 'diária');
      await clickButton(driver, 'Salvar indicador');
      await statusText(driver, 'Indicador cadastrado.');
      const i = await indicador();
      assert.equal(i.formula, 'inscricoes_lista_espera');
      assert.equal(i.metaMin, 1);
      assert.equal(i.frequencia, 'diária');
    });

    it('RFS66 - lista por etapa e lado, com a North Star e as métricas de proteção do Plano de Growth', async () => {
      await select(driver, 'i-f-etapa', 'North Star');
      await clickButton(driver, 'Filtrar indicadores');
      assert.match(await (await item(driver, 'indicador-NSM')).getText(), /Passaportes vivos/);
      const protecao = (await requestAs(USERS.admin, '/growth/indicadores?etapa=proteção')).data;
      assert.deepEqual(protecao.map((i) => i.codigo).sort(), ['P1', 'P2', 'P3', 'P4']);
      await select(driver, 'i-f-etapa', '');
      await clickButton(driver, 'Filtrar indicadores');
    });
  });

  describe('RF04 - Painel de indicadores de growth', () => {
    it('agrupa os indicadores por etapa com valor, meta e status calculados dos eventos de uso', async () => {
      assert.equal((await joinWaitlistApi({ nome: `${prefix} Visitante`, email: `e2e-growth-${stamp}@lastro.com`, origem: 'e2e-painel' })).status, 201);
      const inscritosHoje = (await requestAs(USERS.admin, `/lista-espera?dataInicial=${hoje}&dataFinal=${hoje}`)).data.total;

      await tab(driver, 'Painel de growth');
      await gerarPainel(driver);
      const linha = await item(driver, `painel-${codigo}`);
      assert.equal(await linha.findElement(By.css('[data-col="valor"]')).getText(), String(inscritosHoje));
      assert.equal(await linha.findElement(By.css('[data-col="situacao"]')).getText(), 'na meta');
      for (const c of ['NSM', 'P1', 'A5', 'R1', 'F2', 'I4']) await item(driver, `painel-${c}`);
      const tabela = await driver.findElement(By.css('section[aria-label="Painel de growth"]')).getText();
      assert.match(tabela, /North Star[\s\S]*proteção[\s\S]*aquisição[\s\S]*ativação[\s\S]*retenção[\s\S]*receita[\s\S]*indicação/i);
    });

    it('lista os experimentos concluídos no período com resultado e decisão, e filtra por etapa', async () => {
      const exp = await item(driver, `painel-experimento-${experimento.id}`);
      assert.match(await exp.getText(), /Decisão: Escalar para os quatro laboratórios/);
      await gerarPainel(driver, 'proteção');
      await item(driver, 'painel-P1');
      await driver.wait(async () => (await driver.findElements(By.css(`[data-testid="painel-${codigo}"]`))).length === 0, 10000);
      assert.equal((await driver.findElements(By.css(`[data-testid="painel-experimento-${experimento.id}"]`))).length, 0);
    });
  });

  describe('RFC19 - Editar e desativar indicador', () => {
    it('RFS67 - atualiza as metas e guarda o histórico das metas anteriores', async () => {
      await tab(driver, 'Indicadores');
      await clickLabeled(driver, `Editar indicador ${codigo}`);
      await fill(driver, 'i-min', '5');
      await fill(driver, 'i-max', '50');
      await clickButton(driver, 'Salvar indicador');
      await statusText(driver, 'Indicador atualizado. As metas anteriores ficaram no histórico.');
      await clickLabeled(driver, `Histórico do indicador ${codigo}`);
      const historico = await item(driver, `indicador-${codigo}`);
      assert.match(await historico.getText(), /De 5 a 50/);
      const painelHistorico = await driver.wait(until.elementLocated(By.css(`section[aria-label="Histórico do indicador ${codigo}"]`)), 10000);
      await driver.wait(async () => /Pelo menos 1 · diária · vigente até/.test(await painelHistorico.getText()), 10000);
    });

    it('RFS68 - desativa o indicador preservando os valores já medidos', async () => {
      await clickLabeled(driver, `Desativar indicador ${codigo}`);
      await statusText(driver, 'Indicador desativado. Os valores medidos foram preservados.');
      assert.match(await (await item(driver, `indicador-${codigo}`)).getText(), /desativado/);
      const i = await indicador();
      assert.equal(i.ativo, false);
      const { data } = await requestAs(USERS.admin, `/growth/indicadores/${i.id}/historico`);
      assert.ok(data.medicoes.length >= 1, 'a medição do painel continua guardada');
      const painel = await requestAs(USERS.admin, `/growth/painel?dataInicial=${hoje}&dataFinal=${hoje}`);
      assert.ok(!painel.data.indicadores.some((x) => x.codigo === codigo), 'indicador desativado sai do painel');
    });
  });
});

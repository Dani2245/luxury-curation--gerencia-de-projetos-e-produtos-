import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import webdriver from 'selenium-webdriver';
import { USERS } from './helpers/config.js';
import { cleanupE2E, cleanupGrowthE2E, confirmSaleApi, createPublishedPecaApi, proposeApi, requestAs } from './helpers/api.js';
import {
  clearSession, clickButton, clickLabeled, createDriver, fill, loginAndWaitDashboard, open, select, waitForText
} from './helpers/browser.js';

const { By, until } = webdriver;

const stamp = Date.now();
const prefix = `E2E Hábito ${stamp}`;
const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const hojeBR = hoje.split('-').reverse().join('');

const statusText = async (driver, esperado) => {
  await driver.wait(async () => {
    const status = await driver.findElements(By.css('[role="status"]'));
    return status.length > 0 && (await status[0].getText()).includes(esperado);
  }, 10000, `Mensagem não exibida: ${esperado}`);
};
const as = async (driver, user, pagina) => {
  await clearSession(driver);
  await loginAndWaitDashboard(driver, user.email);
  await open(driver, pagina);
};
const colecao = async () => (await requestAs(USERS.comprador, '/colecao')).data;
const itemDe = async (nome) => (await colecao()).find((i) => i.nome === nome);
const accept = async (driver, texto) => {
  await driver.wait(until.alertIsPresent(), 5000);
  const alert = await driver.switchTo().alert();
  if (texto) await alert.sendKeys(texto);
  await alert.accept();
};

// RFC23 - Coleção Privada (RFS81 a RFS84) e exportação (RNF05), RFC24 - Avaliações e Reputação (RFS85 a RFS88)
// e RF05 - Relatório de indicadores do hábito
describe('RFC23, RFC24 e RF05 - Coleção privada, avaliações e indicadores do hábito', function () {
  let driver;
  let transacao;

  before(async () => {
    driver = await createDriver();
  });

  after(async () => {
    if (driver) await driver.quit();
    await cleanupGrowthE2E();
    await cleanupE2E(prefix);
  });

  describe('RFC23 - Coleção privada', () => {
    it('RFS81 - o comprador registra uma peça própria, privada por padrão, sem anunciá-la', async () => {
      await as(driver, USERS.comprador, '/dashboard/colecao');
      await waitForText(driver, 'Registre as peças que você já possui');
      await fill(driver, 'col-nome', `${prefix} Relógio do avô`);
      await select(driver, 'col-categoria', 'relógio');
      await select(driver, 'col-estado', 'bom');
      await fill(driver, 'col-valor', '15000');
      await driver.findElement(By.id('col-doc-nota-fiscal')).click();
      await clickButton(driver, 'Registrar peça');
      await statusText(driver, 'Peça registrada na sua coleção privada.');
      const item = await itemDe(`${prefix} Relógio do avô`);
      assert.equal(item.visibilidade, 'privado');
      assert.equal(item.valorReferencia, 15000);
    });

    it('RFS81 - importa a planilha do proprietário como itens em rascunho', async () => {
      const csv = path.join(os.tmpdir(), `colecao-${stamp}.csv`);
      fs.writeFileSync(csv, `nome;categoria;estado;valor;manutencao\n${prefix} Anel de safira;joia;muito bom;8000;2025-05-10\n${prefix} Bolsa vintage;bolsa;regular;;\n`);
      const input = await driver.findElement(By.id('col-planilha'));
      await driver.executeScript('arguments[0].classList.remove("sr-only")', input);
      await input.sendKeys(csv);
      await statusText(driver, '2 peça(s) importada(s) como rascunho.');
      const anel = await itemDe(`${prefix} Anel de safira`);
      assert.equal(anel.status, 'rascunho');
      assert.equal(anel.ultimaManutencao, '2025-05-10');
      assert.equal((await itemDe(`${prefix} Bolsa vintage`)).categoria, 'bolsa');
    });

    it('RFS82 - só o proprietário vê a coleção, com o estado e o que falta para o passaporte', async () => {
      const item = await itemDe(`${prefix} Relógio do avô`);
      const pendencias = await driver.wait(until.elementLocated(By.css(`[data-testid="colecao-${item.id}-pendencias"]`)), 10000);
      assert.equal(await pendencias.getText(), 'Para o passaporte falta: fotografias, laudo, certificado');
      assert.match(await driver.findElement(By.css(`[data-testid="colecao-${item.id}"]`)).getText(), /Estado: bom/);
      for (const user of [USERS.vendedor, USERS.perito, USERS.admin]) {
        assert.equal((await requestAs(user, '/colecao')).status, 403, user.perfil);
      }
    });

    it('RFS83 - atualiza fotos, documentos e estado, e cada atualização vai para o histórico', async () => {
      await clickLabeled(driver, `Editar ${prefix} Relógio do avô`);
      await select(driver, 'col-estado', 'muito bom');
      await fill(driver, 'col-fotos', 'https://exemplo.com/relogio.jpg');
      await driver.findElement(By.id('col-doc-laudo')).click();
      await driver.findElement(By.id('col-doc-certificado')).click();
      await clickButton(driver, 'Salvar peça');
      await statusText(driver, 'Peça atualizada. A alteração foi para o histórico.');
      const item = await itemDe(`${prefix} Relógio do avô`);
      assert.equal(await driver.findElement(By.css(`[data-testid="colecao-${item.id}-pendencias"]`)).getText(), 'Pronta para o passaporte');
      await clickLabeled(driver, `Histórico de ${prefix} Relógio do avô`);
      const historico = await driver.wait(until.elementLocated(By.css('section[aria-label="Histórico da peça"]')), 10000);
      await driver.wait(async () => /estado: bom → muito bom, fotografias, documentos/.test(await historico.getText()), 10000);
    });

    it('RFS84 - exclui a peça sem passaporte solicitado; a peça com passaporte solicitado fica', async () => {
      await clickLabeled(driver, `Solicitar passaporte de ${prefix} Relógio do avô`);
      await statusText(driver, 'Passaporte solicitado à curadoria.');
      const relogio = await itemDe(`${prefix} Relógio do avô`);
      assert.equal(relogio.status, 'passaporte solicitado');
      const r = await requestAs(USERS.comprador, `/colecao/${relogio.id}`, { method: 'DELETE' });
      assert.equal(r.status, 400);

      await clickLabeled(driver, `Excluir ${prefix} Bolsa vintage`);
      await accept(driver);
      await statusText(driver, 'Peça excluída da coleção.');
      assert.equal(await itemDe(`${prefix} Bolsa vintage`), undefined);
    });

    it('RNF05 - o proprietário exporta a coleção e os passaportes que possui', async () => {
      await clickButton(driver, 'Exportar meus dados');
      await statusText(driver, 'Exportação gerada:');
      const { status, data } = await requestAs(USERS.comprador, '/colecao/exportar');
      assert.equal(status, 200);
      const relogio = data.colecao.find((i) => i.nome === `${prefix} Relógio do avô`);
      assert.equal(relogio.estadoConservacao, 'muito bom');
      assert.ok(relogio.historico.length >= 3);
      assert.ok(Array.isArray(data.passaportes));
    });
  });

  describe('RFC24 - Avaliações e reputação', () => {
    it('RFS85 - a avaliação só é liberada depois da transação concluída', async () => {
      const peca = await createPublishedPecaApi({ nome: `${prefix} Broche`, categoria: 'joia', valor: 3000 });
      const proposta = await proposeApi(peca.id, 3000);
      const antes = await requestAs(USERS.comprador, '/avaliacoes', { method: 'POST', body: { transacaoId: proposta.id, nota: 5 } });
      assert.equal(antes.status, 400);
      assert.equal(antes.data.message, 'A avaliação só é liberada depois da transação concluída');
      transacao = await confirmSaleApi(proposta.id);

      await as(driver, USERS.comprador, '/dashboard/avaliacoes');
      await driver.wait(until.elementLocated(By.css(`[data-testid="pendente-${transacao.id}"]`)), 10000);
      await select(driver, `nota-${transacao.id}`, '4');
      await fill(driver, `comentario-${transacao.id}`, 'Peça conforme o passaporte');
      await clickLabeled(driver, `Avaliar transação ${transacao.id}`);
      await statusText(driver, 'Avaliação registrada.');
      const dup = await requestAs(USERS.comprador, '/avaliacoes', { method: 'POST', body: { transacaoId: transacao.id, nota: 5 } });
      assert.equal(dup.status, 409);
    });

    it('RFS86 - mostra as avaliações recebidas e a nota média do usuário', async () => {
      const r = await requestAs(USERS.vendedor, '/avaliacoes', { method: 'POST', body: { transacaoId: transacao.id, nota: 2, comentario: `${prefix} comentário impróprio` } });
      assert.equal(r.status, 201);
      const { data } = await requestAs(USERS.vendedor, '/avaliacoes');
      assert.ok(data.recebidas.some((a) => a.transacaoId === transacao.id && a.nota === 4));
      await as(driver, USERS.vendedor, '/dashboard/avaliacoes');
      const reputacao = await driver.wait(until.elementLocated(By.css('[data-testid="reputacao"]')), 10000);
      await driver.wait(async () => (await reputacao.getText()) === `${data.reputacao.media} de 5 · ${data.reputacao.total} avaliação(ões)`, 10000);
    });

    it('RFS87 - o autor altera o comentário em até 7 dias', async () => {
      await as(driver, USERS.comprador, '/dashboard/avaliacoes');
      const minha = (await requestAs(USERS.comprador, '/avaliacoes')).data.feitas.find((a) => a.transacaoId === transacao.id);
      assert.equal(minha.editavel, true);
      await clickLabeled(driver, `Alterar comentário ${minha.id}`);
      await fill(driver, `editar-comentario-${minha.id}`, 'Peça conforme o passaporte e entrega rápida');
      await clickButton(driver, 'Salvar comentário');
      await statusText(driver, 'Comentário alterado.');
      assert.match(await driver.findElement(By.css(`[data-testid="avaliacao-${minha.id}"]`)).getText(), /entrega rápida/);
    });

    it('RFS88 - o administrador remove a avaliação ofensiva com o motivo registrado', async () => {
      const ofensiva = (await requestAs(USERS.vendedor, '/avaliacoes')).data.feitas.find((a) => a.transacaoId === transacao.id);
      assert.equal((await requestAs(USERS.vendedor, `/avaliacoes/${ofensiva.id}`, { method: 'DELETE', body: { motivo: 'x' } })).status, 403);
      await as(driver, USERS.admin, '/dashboard/avaliacoes');
      await clickLabeled(driver, `Remover avaliação ${ofensiva.id}`);
      await accept(driver, 'Comentário ofensivo');
      await statusText(driver, 'Avaliação removida. O motivo ficou registrado.');
      assert.match(await driver.findElement(By.css(`[data-testid="avaliacao-${ofensiva.id}"]`)).getText(), /removida: Comentário ofensivo/);
      const comprador = (await requestAs(USERS.comprador, '/avaliacoes')).data;
      assert.ok(!comprador.recebidas.some((a) => a.id === ofensiva.id), 'a removida sai da reputação de quem foi avaliado');
    });
  });

  describe('RF05 - Relatório de indicadores do hábito', () => {
    it('mostra os indicadores do hábito por coorte, com filtros de período, perfil e coorte', async () => {
      const api = (await requestAs(USERS.admin, `/growth/habito?dataInicial=${hoje}&dataFinal=${hoje}&perfil=proprietário`)).data;
      assert.ok(api.coortes.length >= 1);
      const coorte = api.coortes.find((c) => c.atualizados90d >= 1);
      assert.ok(coorte, 'a atualização da coleção conta como passaporte atualizado');

      await as(driver, USERS.admin, '/dashboard/growth');
      await clickButton(driver, 'Indicadores do hábito');
      await fill(driver, 'h-inicio', hojeBR);
      await fill(driver, 'h-fim', hojeBR);
      await select(driver, 'h-perfil', 'proprietário');
      await fill(driver, 'h-coorte', coorte.coorte);
      await clickButton(driver, 'Gerar relatório');
      const linha = await driver.wait(until.elementLocated(By.css(`[data-testid="coorte-${coorte.coorte}"]`)), 10000);
      assert.equal(await linha.findElement(By.css('[data-col="usuarios"]')).getText(), String(coorte.usuarios));
      assert.equal(await linha.findElement(By.css('[data-col="atualizados90d"]')).getText(), String(coorte.atualizados90d));
      for (const col of ['habituais', 'diasPrimeiroInvestimento', 'sessoesSemGatilho', 'consultasLink', 'desativacaoAlertas']) {
        await linha.findElement(By.css(`[data-col="${col}"]`));
      }
      assert.equal((await requestAs(USERS.comprador, `/growth/habito?dataInicial=${hoje}&dataFinal=${hoje}&perfil=comprador`)).status, 403);
    });
  });
});

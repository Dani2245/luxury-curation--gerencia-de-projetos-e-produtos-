import assert from 'node:assert/strict';
import webdriver from 'selenium-webdriver';
import { USERS } from './helpers/config.js';
import { cleanupE2E, createPublishedPecaApi, requestAs } from './helpers/api.js';
import { createDriver, loginAndWaitDashboard, clearSession, open, fill, select, clickButton, clickLabeled, waitForText, waitForPath } from './helpers/browser.js';

const { By } = webdriver;
const prefix = `E2E Custodia ${Date.now()}`;
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const baseEntry = (id) => ({ pecaId: id, tipoLocal: 'cofre', local: 'Cofre inicial', entradaEm: today, responsavel: 'Responsável E2E' });

describe('RFC06 - Custódia física (RFS21 a RFS24)', function () {
  let driver, piece, custody;
  before(async () => {
    piece = await createPublishedPecaApi({ nome: `${prefix} Relógio` });
    driver = await createDriver();
  });
  after(async () => { if (driver) await driver.quit(); await cleanupE2E(prefix); });

  it('somente administrador acessa a tela, a consulta e o registro', async () => {
    await loginAndWaitDashboard(driver, USERS.comprador.email);
    await open(driver, '/dashboard/custodias');
    await waitForPath(driver, '/dashboard');
    for (const user of [USERS.comprador, USERS.vendedor, USERS.perito]) {
      assert.equal((await requestAs(user, '/custodias')).status, 403);
      assert.equal((await requestAs(user, '/custodias', { method: 'POST', body: baseEntry(piece.id) })).status, 403);
    }
    await clearSession(driver); await loginAndWaitDashboard(driver, USERS.admin.email);
    await open(driver, '/dashboard/custodias'); await waitForText(driver, 'Registrar entrada');
  });
  it('exige peça, local e responsável antes de registrar', async () => {
    await clickButton(driver, 'Registrar entrada');
    assert.equal(await driver.executeScript('return document.getElementById("c-peca").checkValidity()'), false);
    assert.equal((await requestAs(USERS.admin, '/custodias', { method: 'POST', body: { ...baseEntry(piece.id), local: ' ' } })).status, 400);
  });
  it('registra entrada com local, data e responsável pela interface', async () => {
    await select(driver, 'c-peca', String(piece.id));
    await fill(driver, 'c-local', 'Cofre inicial'); await fill(driver, 'c-responsavel', 'Responsável E2E');
    await clickButton(driver, 'Registrar entrada'); await waitForText(driver, 'Entrada registrada.');
    const result = await requestAs(USERS.admin, `/custodias?peca=${piece.id}`);
    assert.equal(result.status, 200); assert.equal(result.data.length, 1);
    custody = result.data[0];
    assert.equal(custody.responsavel, 'Responsável E2E'); assert.equal(custody.status, 'em custodia');
  });
  it('impede duas guardas ativas e a exclusão da peça com histórico', async () => {
    assert.equal((await requestAs(USERS.admin, '/custodias', { method: 'POST', body: baseEntry(piece.id) })).status, 409);
    assert.equal((await requestAs(USERS.vendedor, `/pecas/${piece.id}`, { method: 'DELETE' })).status, 409);
  });
  it('filtra por peça, local e situação na tela', async () => {
    await fill(driver, 'c-filtro-peca', prefix); await fill(driver, 'c-filtro-local', 'Cofre inicial');
    await select(driver, 'c-filtro-status', 'em custodia'); await clickButton(driver, 'Buscar');
    await waitForText(driver, `${prefix} Relógio`);
    await fill(driver, 'c-filtro-local', 'Local inexistente'); await clickButton(driver, 'Buscar');
    await waitForText(driver, 'Nenhuma custódia encontrada.');
    await fill(driver, 'c-filtro-local', ''); await clickButton(driver, 'Buscar'); await waitForText(driver, `${prefix} Relógio`);
  });
  it('move a peça e mantém o local anterior no histórico', async () => {
    await clickLabeled(driver, `Mover custódia ${custody.id}`);
    await select(driver, 'c-novo-tipo', 'sala de guarda'); await fill(driver, 'c-novo-local', 'Sala B');
    await fill(driver, 'c-observacao', 'Movimentação para inspeção'); await clickButton(driver, 'Salvar movimentação');
    await waitForText(driver, 'Localização atualizada.');
    await clickLabeled(driver, `Histórico da custódia ${custody.id}`); await waitForText(driver, 'Movimentação para inspeção');
    const history = await requestAs(USERS.admin, `/custodias/${custody.id}/historico`);
    assert.equal(history.data.length, 2); assert.match(history.data[1].local_anterior, /Cofre inicial/); assert.match(history.data[1].local_destino, /Sala B/);
  });
  it('rejeita saída anterior à entrada e datas inexistentes', async () => {
    assert.equal((await requestAs(USERS.admin, `/custodias/${custody.id}/saida`, { method: 'POST', body: { saidaEm: '2000-01-01', motivo: 'Teste' } })).status, 400);
    assert.equal((await requestAs(USERS.admin, '/custodias', { method: 'POST', body: { ...baseEntry(piece.id), entradaEm: '2026-02-31' } })).status, 400);
    assert.equal((await requestAs(USERS.admin, '/custodias', { method: 'POST', body: { ...baseEntry(piece.id), entradaEm: '2100-01-01' } })).status, 400);
  });
  it('registra saída sem apagar a entrada nem as movimentações', async () => {
    await clickLabeled(driver, `Saída da custódia ${custody.id}`); await fill(driver, 'c-motivo', 'Devolução ao proprietário');
    await clickButton(driver, 'Salvar movimentação'); await waitForText(driver, 'Saída registrada. O histórico foi preservado.');
    await select(driver, 'c-filtro-status', 'retirada'); await clickButton(driver, 'Buscar'); await waitForText(driver, 'Devolução ao proprietário');
    const history = await requestAs(USERS.admin, `/custodias/${custody.id}/historico`);
    assert.equal(history.data.length, 3); assert.equal(history.data[2].tipo, 'saida');
  });
  it('impede movimentação e segunda saída de uma guarda encerrada', async () => {
    assert.equal((await requestAs(USERS.admin, `/custodias/${custody.id}`, { method: 'PATCH', body: { tipoLocal: 'cofre', local: 'Cofre C' } })).status, 400);
    assert.equal((await requestAs(USERS.admin, `/custodias/${custody.id}/saida`, { method: 'POST', body: { saidaEm: today, motivo: 'Repetida' } })).status, 400);
    assert.equal((await driver.findElements(By.css(`[aria-label="Mover custódia ${custody.id}"]`))).length, 0);
  });
  it('permite nova entrada após retirada, preservando a guarda anterior', async () => {
    const result = await requestAs(USERS.admin, '/custodias', { method: 'POST', body: { ...baseEntry(piece.id), local: 'Cofre novo' } });
    assert.equal(result.status, 201); assert.notEqual(result.data.id, custody.id);
    const list = await requestAs(USERS.admin, `/custodias?peca=${piece.id}`);
    assert.equal(list.data.length, 2); assert.equal(list.data.filter((c) => c.status === 'em custodia').length, 1);
  });
});

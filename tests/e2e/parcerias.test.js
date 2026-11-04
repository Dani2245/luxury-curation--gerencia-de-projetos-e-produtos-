import assert from 'node:assert/strict';
import webdriver from 'selenium-webdriver';
import { USERS } from './helpers/config.js';
import { cleanupE2E, requestAs } from './helpers/api.js';
import { rpcAs } from './helpers/release3.js';
import {
  createDriver,
  loginAndWaitDashboard,
  clearSession,
  open,
  fill,
  select,
  clickButton,
  clickLabeled,
  waitForText,
  waitForPath,
} from './helpers/browser.js';
const { By } = webdriver;
const prefix = `E2E Parceria ${Date.now()}`;
const form = {
  nome: `${prefix} Galeria`,
  tipo: 'galeria',
  contato: 'e2e-parceiro@example.invalid',
  dados: 'Endereço de teste',
  condicoes: 'Comissão comercial de 5%',
};
describe('RFC09 - Parcerias (RFS29 a RFS32)', function () {
  let driver, id;
  before(async () => {
    driver = await createDriver();
  });
  after(async () => {
    if (driver) await driver.quit();
    await cleanupE2E(prefix);
  });
  it('restringe tela e operações ao administrador, inclusive chamada direta ao banco', async () => {
    await loginAndWaitDashboard(driver, USERS.vendedor.email);
    await open(driver, '/dashboard/parcerias');
    await waitForPath(driver, '/dashboard');
    for (const user of [USERS.vendedor, USERS.comprador, USERS.perito]) {
      assert.equal((await requestAs(user, '/parcerias')).status, 403);
      assert.equal((await requestAs(user, '/parcerias', { method: 'POST', body: form })).status, 403);
      const r = await rpcAs(user, 'salvar_parceria', {
        p_id: null,
        p_nome: form.nome,
        p_tipo: form.tipo,
        p_contato: form.contato,
        p_dados: '',
        p_condicoes: form.condicoes,
      });
      assert.equal(r.status, 403);
    }
    await clearSession(driver);
    await loginAndWaitDashboard(driver, USERS.admin.email);
    await open(driver, '/dashboard/parcerias');
  });
  it('exige nome, contato e condições; rejeita tipo desconhecido', async () => {
    await clickButton(driver, 'Salvar parceria');
    assert.equal(await driver.executeScript('return document.getElementById("pa-nome").checkValidity()'), false);
    for (const patch of [{ nome: ' ' }, { contato: '' }, { condicoes: '' }, { tipo: 'invalido' }])
      assert.equal(
        (await requestAs(USERS.admin, '/parcerias', { method: 'POST', body: { ...form, ...patch } })).status,
        400,
      );
  });
  it('cadastra parceiro com dados e acordo comercial pela interface', async () => {
    for (const [key, value] of Object.entries(form)) {
      if (key === 'tipo') await select(driver, 'pa-tipo', value);
      else await fill(driver, `pa-${key}`, value);
    }
    await clickButton(driver, 'Salvar parceria');
    await waitForText(driver, 'Parceria cadastrada.');
    const r = await requestAs(USERS.admin, `/parcerias?nome=${encodeURIComponent(prefix)}`);
    assert.equal(r.data.length, 1);
    id = r.data[0].id;
    assert.equal(r.data[0].condicoes, form.condicoes);
  });
  it('filtra por nome, tipo e situação', async () => {
    await fill(driver, 'pa-filtro-nome', prefix);
    await select(driver, 'pa-filtro-tipo', 'seguradora');
    await clickButton(driver, 'Buscar');
    await waitForText(driver, 'Nenhuma parceria encontrada.');
    await select(driver, 'pa-filtro-tipo', 'galeria');
    await select(driver, 'pa-status', 'ativa');
    await clickButton(driver, 'Buscar');
    await waitForText(driver, form.nome);
  });
  it('edita os dados e condições e registra versões no histórico', async () => {
    await clickLabeled(driver, `Editar parceria ${id}`);
    await fill(driver, 'pa-condicoes', 'Comissão revista para 4%');
    await fill(driver, 'pa-contato', 'e2e-novo@example.invalid');
    await clickButton(driver, 'Salvar parceria');
    await waitForText(driver, 'Parceria atualizada.');
    await clickLabeled(driver, `Histórico da parceria ${id}`);
    await waitForText(driver, 'Histórico da parceria');
    const r = await requestAs(USERS.admin, `/parcerias/${id}/historico`);
    assert.equal(r.data.length, 2);
    assert.equal(r.data[1].anterior.condicoes, form.condicoes);
    assert.equal(r.data[1].atual.condicoes, 'Comissão revista para 4%');
  });
  it('encerra a parceria com motivo preservando o histórico', async () => {
    await clickLabeled(driver, `Encerrar parceria ${id}`);
    await fill(driver, 'pa-motivo', 'Fim do acordo comercial');
    await clickButton(driver, 'Confirmar encerramento');
    await waitForText(driver, 'Parceria encerrada.');
    await select(driver, 'pa-status', 'encerrada');
    await clickButton(driver, 'Buscar');
    await waitForText(driver, 'Fim do acordo comercial');
    const r = await requestAs(USERS.admin, `/parcerias/${id}/historico`);
    assert.equal(r.data.length, 3);
    assert.equal(r.data[2].acao, 'encerramento');
    assert.ok(r.data[2].atual.encerrada_em);
  });
  it('impede alterações e encerramento repetido após o fim do acordo', async () => {
    assert.equal((await requestAs(USERS.admin, `/parcerias/${id}`, { method: 'PATCH', body: form })).status, 400);
    assert.equal(
      (await requestAs(USERS.admin, `/parcerias/${id}/encerrar`, { method: 'POST', body: { motivo: 'Repetido' } }))
        .status,
      400,
    );
    assert.equal((await driver.findElements(By.css(`[aria-label="Editar parceria ${id}"]`))).length, 0);
  });
});

import assert from 'node:assert/strict';
import webdriver from 'selenium-webdriver';
import { USERS } from './helpers/config.js';
import { cleanupE2E, requestAs, proposeApi } from './helpers/api.js';
import { multipartAs, rpcAs } from './helpers/release3.js';
import { createDriver, loginAndWaitDashboard, open, fill, clickButton, clickLabeled, select, clearSession, waitForText } from './helpers/browser.js';
const { By, until } = webdriver;
const prefix = `E2E R3 Categorias ${Date.now()}`;
const name = `${prefix} Bolsas`;
const renamed = `${prefix} Bolsas vintage`;
const now = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
describe('RFC10 - Categorias e classificação (RFS33–36)', function () {
  let driver, category, item, list;
  before(async () => { driver = await createDriver(); await loginAndWaitDashboard(driver, USERS.admin.email); });
  after(async () => {
    if (driver) await driver.quit();
    if (list) await requestAs(USERS.comprador, `/listas/${list.id}`, { method: 'DELETE' });
    await cleanupE2E(prefix);
    if (category) await requestAs(USERS.admin, `/categorias/${category.id}`, { method: 'DELETE' });
  });
  it('RFS33: administrador cadastra categoria com atributos no navegador', async () => {
    await open(driver, '/dashboard/categorias'); await fill(driver, 'categoria-nome', name); await fill(driver, 'categoria-atributos', 'Marca\nMaterial');
    await clickButton(driver, 'Salvar categoria'); await waitForText(driver, 'Categoria salva.');
    const result = await requestAs(USERS.admin, '/categorias'); category = result.data.find((c) => c.nome === name);
    assert.ok(category); assert.deepEqual(category.atributos, ['Marca','Material']);
    assert.match(await driver.findElement(By.css(`[data-testid="categoria-${category.id}"]`)).getText(), /Marca · Material/);
  });
  it('rejeita nomes duplicados sem diferenciar maiúsculas e atributos repetidos', async () => {
    assert.equal((await requestAs(USERS.admin, '/categorias', { method: 'POST', body: { nome: name.toUpperCase(), atributos: [] } })).status, 409);
    assert.equal((await requestAs(USERS.admin, '/categorias', { method: 'POST', body: { nome: `${name} outro`, atributos: ['Marca','marca'] } })).status, 400);
  });
  it('restringe escrita à administração, inclusive pela função do banco', async () => {
    for (const user of [USERS.vendedor, USERS.comprador, USERS.perito]) {
      assert.equal((await requestAs(user, '/categorias', { method:'POST', body:{nome:'Proibida',atributos:[]} })).status,403);
    }
    assert.equal((await rpcAs(USERS.vendedor, 'salvar_categoria', { p_id:null,p_nome:'Proibida',p_atributos:[] })).status,403);
  });
  it('RFS34: vendedor consulta atributos e não recebe controles de manutenção', async () => {
    await clearSession(driver); await loginAndWaitDashboard(driver, USERS.vendedor.email); await open(driver, '/dashboard/categorias');
    await fill(driver, 'categoria-busca', name); await waitForText(driver, name);
    assert.equal((await driver.findElements(By.id('categoria-nome'))).length,0);
    assert.equal((await driver.findElements(By.css(`[aria-label="Remover categoria ${name}"]`))).length,0);
  });
  it('usa a categoria e seus atributos no cadastro de uma peça', async () => {
    await open(driver, '/dashboard/nova-peca'); await fill(driver, 'nome', `${prefix} Peça`); await select(driver, 'categoria', name);
    await fill(driver, 'valor', '1234.50'); await fill(driver,'atributo-0','Marca de teste'); await fill(driver,'atributo-1','Couro');
    await driver.findElement(By.id('peca-privada')).click(); await clickButton(driver,'Cadastrar Peça');
    await waitForText(driver,'Peça Registrada');
    item = (await requestAs(USERS.vendedor,'/pecas/minhas')).data.find((p)=>p.nome === `${prefix} Peça`);
    assert.ok(item); assert.deepEqual(item.atributos, { Marca: 'Marca de teste', Material: 'Couro' });
    assert.equal((await requestAs(USERS.admin,`/pecas/${item.id}/publicacao`,{method:'PATCH',body:{publicacao:'publicada'}})).status,200);
  });
  it('valida classificação no servidor e rejeita categorias inexistentes', async () => {
    const common = { nome:`${prefix} inválida`, categoria:name, valorPretendido:10 };
    const bad = await multipartAs(USERS.vendedor,'/pecas',{...common, atributos:{NaoExiste:'valor'}});
    assert.equal(bad.status,400,bad.data?.message);
    assert.equal((await multipartAs(USERS.vendedor,'/pecas',{...common,categoria:'categoria-inexistente'})).status,400);
  });
  it('RFS35: renomear preserva vínculos, valores e critérios de listas', async () => {
    const created = await requestAs(USERS.comprador,'/listas',{method:'POST',body:{nome:prefix,categorias:[name],valorMin:null,valorMax:null}});
    assert.equal(created.status,201,created.data?.message); list=created.data;
    await clearSession(driver); await loginAndWaitDashboard(driver,USERS.admin.email); await open(driver,'/dashboard/categorias');
    await clickLabeled(driver,`Editar categoria ${name}`); await fill(driver,'categoria-nome',renamed); await fill(driver,'categoria-atributos','Marca\nMaterial\nAno'); await clickButton(driver,'Salvar categoria');
    await waitForText(driver,'Categoria salva.');
    const updated = await requestAs(USERS.admin,`/pecas/${item.id}`); assert.equal(updated.data.categoria,renamed); assert.equal(updated.data.atributos.Marca,'Marca de teste');
    assert.deepEqual((await requestAs(USERS.comprador,`/listas/${list.id}`)).data.categorias,[renamed]);
    assert.equal((await requestAs(USERS.admin,`/categorias/${category.id}`,{method:'PUT',body:{nome:renamed,atributos:[]}})).status,409);
  });
  it('remove atributo vazio sem deixar a peça bloqueada para futuras edições', async () => {
    const fields = { nome: item.nome, categoria: renamed, valorPretendido: item.valor, privada: false,
      atributos: { Marca: 'Marca de teste', Material: 'Couro', Ano: '' } };
    assert.equal((await multipartAs(USERS.vendedor, `/pecas/${item.id}`, fields, { method: 'PUT' })).status, 200);
    await open(driver, '/dashboard/categorias');
    await clickLabeled(driver, `Editar categoria ${renamed}`);
    await fill(driver, 'categoria-atributos', 'Marca\nMaterial');
    await clickButton(driver, 'Salvar categoria'); await waitForText(driver, 'Categoria salva.');
    const updated = (await requestAs(USERS.vendedor, `/pecas/${item.id}`)).data;
    assert.deepEqual(updated.atributos, { Marca: 'Marca de teste', Material: 'Couro' });
    const saved = await multipartAs(USERS.vendedor, `/pecas/${item.id}`, { ...fields, atributos: updated.atributos }, { method: 'PUT' });
    assert.equal(saved.status, 200, saved.data?.message);
    assert.equal((await requestAs(USERS.admin, `/pecas/${item.id}/publicacao`, { method: 'PATCH', body: { publicacao: 'publicada' } })).status, 200);
  });
  it('integra a nova categoria ao catálogo e ao relatório RF01', async () => {
    await proposeApi(item.id,1200);
    await open(driver,'/catalogo'); await select(driver,'f-categoria',renamed); await clickButton(driver,'Buscar'); await waitForText(driver,item.nome);
    await open(driver,'/dashboard/relatorios'); await select(driver,'r-categoria',renamed); await clickButton(driver,'Gerar relatório');
    await driver.wait(until.elementLocated(By.css(`[data-testid="subtotal-${renamed}"]`)),10000);
    const r=await requestAs(USERS.admin,`/relatorios/transacoes?dataInicial=${now}&dataFinal=${now}&categoria=${encodeURIComponent(renamed)}`);
    assert.equal(r.status,200,r.data?.message); assert.equal(r.data.total,1200); assert.equal(r.data.grupos.length,1);
  });
  it('RFS36: impede excluir categoria em uso e remove categoria sem vínculos', async () => {
    await open(driver,'/dashboard/categorias'); await clickLabeled(driver,`Remover categoria ${renamed}`); await driver.wait(until.alertIsPresent(),5000); await driver.switchTo().alert().accept();
    await waitForText(driver,'Categoria vinculada');
    const spare=await requestAs(USERS.admin,'/categorias',{method:'POST',body:{nome:`${prefix} livre`,atributos:[]}});
    assert.equal(spare.status,201); await open(driver,'/dashboard/categorias'); await clickLabeled(driver,`Remover categoria ${prefix} livre`); await driver.wait(until.alertIsPresent(),5000); await driver.switchTo().alert().accept();
    await driver.wait(async()=>!(await driver.findElements(By.css(`[data-testid="categoria-${spare.data.id}"]`))).length,20000,
      'A categoria removida deve desaparecer após a atualização da lista');
    const remaining = await requestAs(USERS.admin, '/categorias');
    assert.ok(!remaining.data.some((c) => c.id === spare.data.id), 'A categoria também deve ter sido removida do banco');
  });
});

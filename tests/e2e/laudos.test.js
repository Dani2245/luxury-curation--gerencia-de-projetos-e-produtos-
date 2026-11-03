import assert from 'node:assert/strict';
import webdriver from 'selenium-webdriver';
import { USERS } from './helpers/config.js';
import { cleanupE2E, createPublishedPecaApi, issuePassportApi, requestAs, createUserApi, deleteUsersByEmail, createLinkApi } from './helpers/api.js';
import { PHOTO, multipartAs, rpcAs, removeStorage } from './helpers/release3.js';
import { createDriver, loginAndWaitDashboard, clearSession, open, fill, select, clickButton, clickLabeled, waitForText } from './helpers/browser.js';
const { By, until } = webdriver;
const prefix=`E2E R3 Laudos ${Date.now()}`;
const second={email:`e2e-r3-perito-${Date.now()}@lastro.test`};
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date());
const body=(p)=>({pecaId:p.id,parecer:'Autenticidade confirmada pela análise técnica E2E.',valorAvaliacao:4500.50,emitidoEm:today});
const panel=async()=>{
 const r=await requestAs(USERS.admin,`/growth/painel?dataInicial=${today}&dataFinal=${today}`);
 assert.equal(r.status,200,r.data?.message);return r.data.indicadores.find((i)=>i.codigo==='A5').valor;
};
describe('RFC05 - Laudos periciais e A5 (RFS17–20)',function(){
 let driver,peca,laudo,passport,otherLaudo; const photos=[];
 before(async()=>{
  peca=await createPublishedPecaApi({nome:prefix});
  const u=await createUserApi({nome:`${prefix} outro perito`,email:second.email,senha:'Lastro@2026',perfil:'Perito'}); assert.equal(u.status,201,u.data?.message);
  driver=await createDriver();await loginAndWaitDashboard(driver,USERS.perito.email);
 });
 after(async()=>{
  if(driver)await driver.quit();
  const r=await requestAs(USERS.perito,`/laudos?pecaId=${peca.id}`);
  for(const l of r.data||[])photos.push(...l.fotografias.map((f)=>({user:l.perito_nome.includes('outro perito')?second:USERS.perito,path:f.path})));
  await cleanupE2E(prefix);
  for(const u of [USERS.perito,second])await removeStorage(u,'laudos',photos.filter((f)=>f.user===u).map((f)=>f.path));
  await deleteUsersByEmail(second.email);
 });
 it('RFS17: exige peça, parecer, valor, data e ao menos uma fotografia',async()=>{
  await open(driver,'/dashboard/laudos');await clickButton(driver,'Salvar e assinar laudo');
  assert.equal(await driver.findElement(By.id('laudo-peca')).getAttribute('required'),'true');
  assert.equal((await multipartAs(USERS.perito,'/laudos',body(peca))).status,400);
  assert.equal((await multipartAs(USERS.perito,'/laudos',{...body(peca),valorAvaliacao:0},{photos:true})).status,400);
 });
 it('perito emite laudo assinado com fotos pelo navegador',async()=>{
  await select(driver,'laudo-peca',String(peca.id));await fill(driver,'laudo-valor','4500.50');await fill(driver,'laudo-parecer',body(peca).parecer);
  await driver.findElement(By.id('laudo-fotos')).sendKeys(PHOTO);await clickButton(driver,'Salvar e assinar laudo');await waitForText(driver,'Laudo salvo e assinado');
  laudo=(await requestAs(USERS.perito,`/laudos?pecaId=${peca.id}`)).data[0];assert.ok(laudo.assinatura_valida);assert.equal(Number(laudo.valor_avaliacao),4500.50);assert.equal(laudo.fotografias.length,1);
  assert.equal((await fetch(laudo.fotografias[0].url)).status,200);
 });
 it('bloqueia emissão por outros perfis e data futura inclusive no banco',async()=>{
  for(const u of [USERS.admin,USERS.vendedor,USERS.comprador])assert.equal((await multipartAs(u,'/laudos',body(peca),{photos:true})).status,403);
  const invalid=await rpcAs(USERS.perito,'salvar_laudo',{p_id:laudo.id,p_peca:peca.id,p_parecer:'teste',p_valor:10,p_data:'2099-01-01',p_fotos:laudo.fotografias.map(({path,hash})=>({path,hash}))});
  assert.equal(invalid.status,400);assert.match(invalid.data.message,/futuro/);
 });
 it('RFS18: filtra por peça, perito e período de emissão',async()=>{
  await fill(driver,'laudo-f-peca',prefix);await fill(driver,'laudo-f-perito',USERS.perito.nome);await clickButton(driver,'Consultar laudos');
  await waitForText(driver,`Laudo ${laudo.id}`);
  assert.equal((await requestAs(USERS.admin,`/laudos?pecaId=${peca.id}&inicio=2000-01-01&fim=2000-12-31`)).data.length,0);
  assert.equal((await requestAs(USERS.admin,`/laudos?pecaId=${peca.id}&inicio=${today}&fim=${today}`)).data.length,1);
  assert.equal((await requestAs(USERS.comprador,`/laudos?pecaId=${peca.id}`)).data.length,0,'Laudo não vinculado não é exposto ao comprador');
 });
 it('RFS19: autor corrige laudo ainda não vinculado e renova assinatura',async()=>{
  const signature=laudo.assinatura;await clickLabeled(driver,`Corrigir laudo ${laudo.id}`);await fill(driver,'laudo-parecer','Parecer corrigido: peça autêntica, desgaste leve observado.');await fill(driver,'laudo-valor','4700');
  await clickButton(driver,'Salvar e assinar laudo');await waitForText(driver,'Laudo salvo e assinado');
  laudo=(await requestAs(USERS.perito,`/laudos?pecaId=${peca.id}`)).data[0];assert.notEqual(laudo.assinatura,signature);assert.equal(laudo.assinatura_valida,true);
  assert.equal((await multipartAs(second,`/laudos/${laudo.id}`,body(peca),{method:'PUT'})).status,403);
 });
 it('A5 conta peritos distintos com laudos assinados na janela de 60 dias',async()=>{
  const base=Number(await panel());
  const r=await multipartAs(second,'/laudos',body(peca),{photos:true});assert.equal(r.status,201,r.data?.message);otherLaudo=r.data.id;
  assert.equal(Number(await panel()),base+1);
  const recent=await rpcAs(USERS.admin,'e2e_datar_laudo',{p_id:otherLaudo,p_data:new Date(Date.now()-61*86400000).toISOString()});assert.equal(recent.status,204);
  assert.equal(Number(await panel()),base);
  await rpcAs(USERS.admin,'e2e_datar_laudo',{p_id:otherLaudo,p_data:new Date(Date.now()-59*86400000).toISOString()});assert.equal(Number(await panel()),base+1);
  await open(driver,'/dashboard/laudos');
 });
 it('vinculação exige passaporte da mesma peça e autorização do autor',async()=>{
  assert.equal((await requestAs(USERS.perito,`/laudos/${laudo.id}/vincular`,{method:'POST'})).status,400);
  passport=await issuePassportApi(peca.id);
  assert.equal((await requestAs(second,`/laudos/${laudo.id}/vincular`,{method:'POST'})).status,403);
  await clickLabeled(driver,`Vincular laudo ${laudo.id}`);await driver.wait(until.alertIsPresent(),5000);await driver.switchTo().alert().accept();await waitForText(driver,'Laudo vinculado.');
  const p=await requestAs(USERS.perito,`/passaportes/peca/${peca.id}`);assert.equal(p.data.assinatura.valida,true);assert.equal(p.data.versao,2);
 });
 it('RFS19/20: impede correção e remoção de laudo já vinculado, inclusive por RPC',async()=>{
  const correction=await multipartAs(USERS.perito,`/laudos/${laudo.id}`,body(peca),{method:'PUT'});assert.equal(correction.status,409);
  for(const u of [USERS.perito,USERS.admin])assert.equal((await requestAs(u,`/laudos/${laudo.id}`,{method:'DELETE'})).status,409);
  assert.equal((await rpcAs(USERS.perito,'remover_laudo',{p_id:laudo.id})).status,409);
  await open(driver,'/dashboard/laudos');await waitForText(driver,`Vinculado ao passaporte ${passport.id}`);
  assert.equal((await driver.findElements(By.css(`[aria-label="Corrigir laudo ${laudo.id}"]`))).length,0);
 });
 it('comprador abre o laudo no passaporte e a consulta alimenta B1',async()=>{
  await clearSession(driver);await loginAndWaitDashboard(driver,USERS.comprador.email);await open(driver,`/peca/${peca.id}/passaporte`);
  await clickButton(driver,`Abrir laudo ${laudo.id} · ${USERS.perito.nome}`);await waitForText(driver,'Parecer corrigido');
  const record=(await requestAs(USERS.comprador,`/laudos?pecaId=${peca.id}`)).data;assert.equal(record.length,1);assert.ok(record[0].assinatura_valida);
 });
 it('link público expõe apenas metadados do laudo, sem parecer, valor de avaliação ou fotos',async()=>{
  const link=await createLinkApi(passport.id);const data=(await requestAs(USERS.vendedor,`/publico/passaportes/${link.token}`)).data;
  assert.ok(data.documentos.some((d)=>d.tipo==='laudo'&&d.titulo.includes(String(laudo.id))));
  assert.ok(!JSON.stringify(data).includes('Parecer corrigido'));assert.ok(!JSON.stringify(data).includes('4700'));
  const exported=await rpcAs(USERS.vendedor,'exportar_dados_proprietario',{});assert.equal(exported.status,200);assert.equal(exported.data.passaportes.find((p)=>p.passaporte===passport.id).laudos.length,1);
 });
 it('RFS20: administrador remove laudo incorreto ainda não vinculado',async()=>{
  const other=(await requestAs(USERS.admin,`/laudos?pecaId=${peca.id}`)).data.find((l)=>l.id===otherLaudo);photos.push(...other.fotografias.map((f)=>({user:second,path:f.path})));
  await clearSession(driver);await loginAndWaitDashboard(driver,USERS.admin.email);await open(driver,'/dashboard/laudos');await clickLabeled(driver,`Remover laudo ${otherLaudo}`);await driver.wait(until.alertIsPresent(),5000);await driver.switchTo().alert().accept();
  await driver.wait(async()=>!(await driver.findElements(By.css(`[data-testid="laudo-${otherLaudo}"]`))).length,10000);
 });
});

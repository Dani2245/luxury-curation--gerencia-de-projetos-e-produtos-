import assert from 'node:assert/strict';
import webdriver from 'selenium-webdriver';
import { USERS, API_URL, SUPABASE_URL, SUPABASE_KEY } from './helpers/config.js';
import { cleanupE2E, requestAs, issuePassportApi, createLinkApi, joinWaitlistApi } from './helpers/api.js';
import { PHOTO, multipartAs, rpcAs, removeStorage } from './helpers/release3.js';
import { createDriver, loginAndWaitDashboard, clearSession, open, fill, select, clickButton, clickLabeled, waitForText } from './helpers/browser.js';
const { By, until } = webdriver;
const prefix=`E2E R3 Pilotos ${Date.now()}`;
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date());
const summary=async()=>{const r=await requestAs(USERS.admin,`/pilotos/resumo?inicio=${today}&fim=${today}`);assert.equal(r.status,200,r.data?.message);return r.data;};
describe('Release 3 - X1–X5, privacidade e evidências de growth',function(){
 let driver,item,passport,link,evidence,referral;const waitlist=[];
 before(async()=>{driver=await createDriver();await loginAndWaitDashboard(driver,USERS.vendedor.email);});
 after(async()=>{
  if(driver)await driver.quit();
  await cleanupE2E(prefix);
  if(item)await removeStorage(USERS.vendedor,'pecas-privadas',item.fotografiasRefs.filter((r)=>r.startsWith('privado:')).map((r)=>r.slice(8)));
  if(referral)await requestAs(USERS.perito,`/indicacoes/${referral.id}`,{method:'DELETE'});
  for(const id of waitlist)await requestAs(USERS.admin,`/lista-espera/${id}`,{method:'DELETE'});
 });
 it('X1: peça começa privada no formulário e não pode ser publicada pelo administrador',async()=>{
  await open(driver,'/dashboard/nova-peca');await fill(driver,'nome',prefix);await select(driver,'categoria','relógio');await fill(driver,'valor','2300');
  assert.equal(await driver.findElement(By.id('peca-privada')).isSelected(),true);
  await driver.findElement(By.id('fotografias')).sendKeys(PHOTO);await clickButton(driver,'Cadastrar Peça');await waitForText(driver,'Peça Registrada');
  item=(await requestAs(USERS.vendedor,'/pecas/minhas')).data.find((p)=>p.nome===prefix);assert.equal(item.privada,true);
  assert.equal((await requestAs(USERS.comprador,`/pecas/${item.id}`)).status,404);
  assert.equal((await requestAs(USERS.admin,`/pecas/${item.id}/publicacao`,{method:'PATCH',body:{publicacao:'publicada'}})).status,400);
  assert.ok(item.fotografiasRefs[0].startsWith('privado:'));
  const response=await fetch(`${SUPABASE_URL}/storage/v1/object/sign/pecas-privadas/${item.fotografiasRefs[0].slice(8)}`,{method:'POST',headers:{apikey:SUPABASE_KEY,'Content-Type':'application/json'},body:JSON.stringify({expiresIn:60})});
  assert.ok(!response.ok,'Visitante não deve receber fotografia privada sem compartilhamento');
 });
 it('X1: proprietário compartilha campos escolhidos e a revogação encerra o acesso',async()=>{
  passport=await issuePassportApi(item.id);
  link=await createLinkApi(passport.id,{camposPublicos:['documentos','historico_proprietarios','fotografias']});
  const response=await fetch(`${API_URL}/api/publico/passaportes/${link.token}`);const data=await response.json();assert.equal(response.status,200);
  assert.equal(data.peca.valor,undefined);assert.equal(data.peca.descricao,undefined);assert.equal(data.peca.fotografias.length,1);assert.equal((await fetch(data.peca.fotografias[0])).status,200);
  assert.ok(data.proprietarios.every((p)=>!p.nome.includes(USERS.vendedor.nome)));
  const revoke=await requestAs(USERS.vendedor,`/links/${link.id}`,{method:'DELETE'});assert.equal(revoke.status,200,revoke.data?.message);
  assert.equal((await fetch(`${API_URL}/api/publico/passaportes/${link.token}`)).status,410);
 });
 it('X1: autorizar publicação mantém a necessidade de curadoria',async()=>{
  const r=await multipartAs(USERS.vendedor,`/pecas/${item.id}`,{nome:prefix,categoria:'relógio',valorPretendido:2300,privada:false,fotografiasMantidas:item.fotografiasRefs},{method:'PUT'});
  assert.equal(r.status,200,r.data?.message);assert.equal(r.data.publicacao,'pendente');
  assert.equal((await requestAs(USERS.comprador,`/pecas/${item.id}`)).status,404);
  assert.equal((await requestAs(USERS.admin,`/pecas/${item.id}/publicacao`,{method:'PATCH',body:{publicacao:'publicada'}})).status,200);
  assert.equal((await requestAs(USERS.comprador,`/pecas/${item.id}`)).status,200);
 });
 it('registro de evidências fica restrito à administração, inclusive via RPC',async()=>{
  for(const u of [USERS.comprador,USERS.vendedor,USERS.perito])assert.equal((await requestAs(u,'/pilotos/evidencias')).status,403);
  assert.equal((await rpcAs(USERS.perito,'registrar_evidencia_growth',{p_dados:{experimento:'X1'}})).status,403);
 });
 it('X1: registra demonstração sem inflar o resultado real e permite anulação auditada',async()=>{
  const base=await summary();await clearSession(driver);await loginAndWaitDashboard(driver,USERS.admin.email);await open(driver,'/dashboard/growth');await clickButton(driver,'Pilotos X1–X5');
  await fill(driver,'piloto-participante',`${prefix} vendedor`);await select(driver,'piloto-resultado','aceitou');await fill(driver,'piloto-observacao','Simulação de aceite do diagnóstico com passaporte privado.');
  await clickButton(driver,'Registrar evidência');await waitForText(driver,'Evidência registrada.');
  evidence=(await requestAs(USERS.admin,'/pilotos/evidencias')).data.find((e)=>e.participante===`${prefix} vendedor`);assert.ok(evidence.demonstracao);assert.deepEqual((await summary()).evidencias,base.evidencias);
  await clickLabeled(driver,`Anular evidência ${evidence.id}`);await driver.wait(until.alertIsPresent(),5000);await driver.switchTo().alert().sendKeys('Registro de demonstração encerrado.');await driver.switchTo().alert().accept();await waitForText(driver,'Evidência anulada');
  const historic=(await requestAs(USERS.admin,'/pilotos/evidencias')).data.find((e)=>e.id===evidence.id);assert.ok(historic.anulada_em);assert.equal(historic.motivo_anulacao,'Registro de demonstração encerrado.');
 });
 it('X2: registra leitura com os quatro critérios e não inventa aprovação',async()=>{
  await select(driver,'piloto-x','X2');await fill(driver,'piloto-participante',`${prefix} leitor`);await fill(driver,'piloto-observacao','Simulação de leitura: explicou a procedência e o signatário, sem compreender conservação.');
  for(const id of ['procedencia','assinante','semAjuda'])await driver.findElement(By.id(`leitura-${id}`)).click();
  await clickButton(driver,'Registrar evidência');await waitForText(driver,'Evidência registrada.');
  const e=(await requestAs(USERS.admin,'/pilotos/evidencias')).data.find((e)=>e.participante===`${prefix} leitor`);assert.equal(e.leitura.conservacao,false);assert.equal(e.leitura.semAjuda,true);
 });
 it('X2: exemplo usa passaporte autorizado e deixa de existir se o link for revogado',async()=>{
  // Não substitui uma escolha real já feita pelo grupo.
  const current=await fetch(`${API_URL}/api/publico/exemplo`);
  if(current.status===200){assert.ok((await current.json()).token);return;}
  const l=await createLinkApi(passport.id,{camposPublicos:['documentos','historico_proprietarios']});
  const result=await requestAs(USERS.admin,'/pilotos/exemplo',{method:'PUT',body:{token:l.token,nivel:'Exemplo E2E: documentos de teste, sem perícia real.',estado:'Desgaste leve (cenário de teste).'}});assert.equal(result.status,204,result.data?.message);
  await open(driver,'/passaporte-exemplo');await waitForText(driver,'Exemplo E2E: documentos de teste');await waitForText(driver,prefix);
  await requestAs(USERS.vendedor,`/links/${l.id}`,{method:'DELETE'});assert.equal((await fetch(`${API_URL}/api/publico/exemplo`)).status,404);
 });
 it('X3: apresenta programa de perito fundador sem afirmar adesões reais',async()=>{
  await open(driver,'/peritos-fundadores');await waitForText(driver,'Perito fundador Lastro');await waitForText(driver,'sem custo de adesão');
  const body={experimento:'X3',participante:`${prefix} laboratório`,ocorridoEm:today,resultado:'aceitou',observacao:'Aceite simulado do piloto, sem convite real.',demonstracao:true};
  assert.equal((await requestAs(USERS.admin,'/pilotos/evidencias',{method:'POST',body})).status,201);
  assert.equal((await requestAs(USERS.admin,'/pilotos/evidencias',{method:'POST',body})).status,409);
 });
 it('X4: diagnóstico precisa de indicação de vendedor feita por perito',async()=>{
  const body={experimento:'X4',participante:`${prefix} indicado`,ocorridoEm:today,resultado:'diagnóstico realizado',observacao:'Simulação de diagnóstico decorrente de indicação.',demonstracao:true};
  assert.equal((await requestAs(USERS.admin,'/pilotos/evidencias',{method:'POST',body})).status,400);
  const created=await requestAs(USERS.perito,'/indicacoes',{method:'POST',body:{nome:`${prefix} indicado`,contato:`e2e-r3-${Date.now()}@lastro.test`,perfil:'vendedor'}});assert.equal(created.status,201,created.data?.message);referral=created.data;
  await open(driver,'/dashboard/growth');await clickButton(driver,'Pilotos X1–X5');await select(driver,'piloto-x','X4');await fill(driver,'piloto-participante',body.participante);await select(driver,'piloto-resultado','diagnóstico realizado');await select(driver,'piloto-indicacao',String(referral.id));await fill(driver,'piloto-observacao',body.observacao);await clickButton(driver,'Registrar evidência');await waitForText(driver,'Evidência registrada.');
 });
 it('X5: compara versões, exclui inscrições de teste e não divide por zero',async()=>{
  const base=await summary();
  for(const v of ['a','b']){const r=await joinWaitlistApi({nome:`${prefix} ${v}`,email:`e2e-r3-${v}-${Date.now()}@lastro.test`,perfil:'comprador',categorias:v==='b'?['bolsa']:['joia'],versao:v});assert.equal(r.status,201,r.data?.message);if(r.data.id)waitlist.push(r.data.id);}
  assert.deepEqual((await summary()).x5,base.x5);
  await open(driver,'/lista-de-espera?v=a');assert.equal((await driver.findElements(By.id('le-cat-bolsa'))).length,0);
  await open(driver,'/lista-de-espera?v=b');await driver.wait(until.elementLocated(By.id('le-cat-bolsa')),10000);
 });
 it('agrega evidências válidas por período e só aprova X2 com todos os critérios',async()=>{
  const base=(await summary()).evidencias.find((e)=>e.experimento==='X2')||{total:0,positivos:0};
  for(const [suffix,all] of [['completa',true],['incompleta',false]]){
   const r=await requestAs(USERS.admin,'/pilotos/evidencias',{method:'POST',body:{experimento:'X2',participante:`${prefix} cálculo ${suffix}`,ocorridoEm:today,resultado:'leitura realizada',observacao:'Dado sintético temporário para verificar o cálculo, removido ao fim do Selenium.',demonstracao:false,leitura:{procedencia:true,conservacao:all,assinante:true,semAjuda:true}}});assert.equal(r.status,201,r.data?.message);
  }
  const result=(await summary()).evidencias.find((e)=>e.experimento==='X2');assert.equal(Number(result.total)-Number(base.total),2);assert.equal(Number(result.positivos)-Number(base.positivos),1);
  const old=await requestAs(USERS.admin,'/pilotos/resumo?inicio=2000-01-01&fim=2000-01-02');assert.equal(old.status,200);assert.ok(old.data.evidencias.every((e)=>e.total===0));assert.equal(old.data.x5.variacaoPercentual,null);
 });
});

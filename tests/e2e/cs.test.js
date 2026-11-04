import assert from 'node:assert/strict';
import webdriver from 'selenium-webdriver';
import fs from 'node:fs/promises';
import path from 'node:path';
import { USERS, PASSWORD, SUPABASE_URL, SUPABASE_KEY } from './helpers/config.js';
import {
  requestAs,
  loginApi,
  createUserApi,
  deleteUsersByEmail,
  cleanupE2E,
  issuePassportApi,
  createPublishedPecaApi,
  proposeApi,
} from './helpers/api.js';
import { multipartAs, rpcAs, removeStorage } from './helpers/release3.js';
import {
  createDriver,
  clearSession,
  loginAndWaitDashboard,
  open,
  fill,
  select,
  clickButton,
  clickLabeled,
  waitForText,
} from './helpers/browser.js';

const { By, until } = webdriver;
const stamp = Date.now(),
  prefix = `E2E CS ${stamp}`;
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const later = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
const client = {
  email: `e2e-cs-${stamp}@example.invalid`,
  senha: PASSWORD,
  nome: `${prefix} Cliente`,
  perfil: 'Comprador',
};
const outsider = {
  email: `e2e-cs-vendor-${stamp}@example.invalid`,
  senha: PASSWORD,
  nome: `${prefix} Outro vendedor`,
  perfil: 'Vendedor',
};
const reportPath = `/clientes/saude?dataInicial=${today.slice(0, 8)}01&dataFinal=${today}`;
const report = async (filter = '') => {
  const r = await requestAs(USERS.admin, reportPath + filter);
  assert.equal(r.status, 200, r.data?.message);
  return r.data.operacao;
};
const expectStatus = (r, code) => {
  assert.equal(r.status, code, JSON.stringify(r.data));
  return r.data;
};
const as = async (driver, user, path) => {
  await clearSession(driver);
  await loginAndWaitDashboard(driver, user.email);
  await open(driver, path);
};
const cardText = async (driver, id) =>
  (await driver.wait(until.elementLocated(By.css(`[data-testid="${id}"]`)), 10000)).getText();
// Wait for the actual record, not a success message left over from the preceding action.
const cardHas = (driver, id, text) =>
  driver.wait(
    async () => {
      try {
        return (await cardText(driver, id)).includes(text);
      } catch {
        return false;
      }
    },
    12000,
    `${id} deve mostrar ${text}`,
  );
const move = (id, acao, user = USERS.admin, observacao = 'Etapa conferida no teste') =>
  requestAs(user, `/cs/dossies/${id}/movimentos`, { method: 'POST', body: { acao, observacao } });
const publish = (id, publicacao = 'publicada') =>
  requestAs(USERS.admin, `/pecas/${id}/publicacao`, { method: 'PATCH', body: { publicacao } });
const step = (t, user, path, body) => requestAs(user, `/transacoes/${t.id}/${path}`, { method: 'POST', body });
const screenshot = async (driver, name) => {
  if (!process.env.E2E_ARTIFACT_DIR) return;
  await fs.mkdir(process.env.E2E_ARTIFACT_DIR, { recursive: true });
  await fs.writeFile(path.join(process.env.E2E_ARTIFACT_DIR, `${name}.png`), await driver.takeScreenshot(), 'base64');
};

describe('Release 4 / Kanban - Dossiês, recuperação e indicadores operacionais de CS', function () {
  this.timeout(60000);
  let driver, piece, dossier, clientId, adminId, plan, action1, action2, base;
  const dossierNow = async () => (await requestAs(USERS.admin, '/cs/dossies')).data.find((d) => d.id === dossier);
  const planNow = async (id = plan) => (await requestAs(USERS.admin, '/cs/planos')).data.find((p) => p.id === id);
  const planBody = (objetivo = `${prefix} Retomar participação`) => ({
    clienteId: clientId,
    responsavelId: adminId,
    objetivo,
    prazo: later,
  });
  const statusAction = (id, status, user = USERS.admin, resultado = 'Acompanhamento registrado') =>
    requestAs(user, `/cs/acoes/${id}/status`, { method: 'POST', body: { status, resultado } });
  const closePlan = (id, status, user = USERS.admin, motivo = 'Acompanhamento encerrado') =>
    requestAs(user, `/cs/planos/${id}/encerramento`, { method: 'POST', body: { status, motivo } });
  const movementUi = async (label, note) => {
    await clickLabeled(driver, label);
    await fill(driver, 'do-observacao', note);
    await clickButton(driver, 'Confirmar movimentação');
    await driver.wait(async () => (await driver.findElements(By.id('do-observacao'))).length === 0, 12000);
  };
  const statusUi = async (label, note) => {
    await clickLabeled(driver, label);
    await fill(driver, 'pr-resultado', note);
    await clickButton(driver, 'Confirmar situação');
    await driver.wait(async () => (await driver.findElements(By.id('pr-resultado'))).length === 0, 12000);
  };
  before(async () => {
    expectStatus(await createUserApi(client), 201);
    expectStatus(await createUserApi(outsider), 201);
    const people = expectStatus(await requestAs(USERS.admin, '/cs/pessoas'), 200);
    clientId = people.find((p) => p.nome === client.nome).id;
    adminId = people.find((p) => p.nome === USERS.admin.nome).id;
    piece = expectStatus(
      await multipartAs(
        USERS.vendedor,
        '/pecas',
        {
          nome: `${prefix} Dossiê`,
          categoria: 'relógio',
          valorPretendido: 1000,
          descricao: 'Dossiê de teste',
          privada: false,
        },
        { photos: true },
      ),
      201,
    );
    base = await report();
    driver = await createDriver();
  });
  after(async () => {
    if (driver) await driver.quit();
    const photos = piece ? (await requestAs(USERS.perito, `/laudos?pecaId=${piece.id}`)).data || [] : [];
    await cleanupE2E(prefix);
    await removeStorage(
      USERS.perito,
      'laudos',
      photos.flatMap((l) => l.fotografias.map((f) => f.path)),
    );
    await deleteUsersByEmail(client.email);
    await deleteUsersByEmail(outsider.email);
  });

  it('RFC14: vendedor abre dossiê com diagnóstico e documentação pela interface', async () => {
    await as(driver, USERS.vendedor, '/dashboard/dossies');
    await select(driver, 'do-peca', String(piece.id));
    await clickButton(driver, 'Salvar dossiê');
    assert.equal(await driver.findElement(By.id('do-diagnostico')).getAttribute('required'), 'true');
    await fill(driver, 'do-diagnostico', 'Avaliar relógio e documentação de origem');
    await fill(driver, 'do-documentacao', 'Nota e procedência declaradas; fotografia anexada');
    await clickButton(driver, 'Salvar dossiê');
    await waitForText(driver, 'Dossiê salvo com histórico.');
    dossier = (await requestAs(USERS.vendedor, '/cs/dossies')).data.find((d) => d.peca_id === piece.id).id;
    await cardHas(driver, `dossie-${dossier}`, 'Diagnóstico');
    expectStatus(
      await requestAs(USERS.vendedor, '/cs/dossies', {
        method: 'POST',
        body: { pecaId: piece.id, diagnostico: 'Duplicado' },
      }),
      409,
    );
    assert.equal((await report()).dossies.total, base.dossies.total + 1);
  });
  it('isola dossiês por proprietário e impede escrita direta ou avanço pelo vendedor', async () => {
    for (const u of [USERS.comprador, USERS.perito]) expectStatus(await requestAs(u, '/cs/dossies'), 403);
    assert.equal(
      (await requestAs(outsider, '/cs/dossies')).data.some((d) => d.id === dossier),
      false,
    );
    assert.deepEqual((await requestAs(outsider, `/cs/dossies/${dossier}/historico`)).data, []);
    expectStatus(await move(dossier, 'avancar', USERS.vendedor), 403);
    expectStatus(
      await rpcAs(outsider, 'movimentar_dossie', { p_id: dossier, p_acao: 'desistir', p_observacao: 'Não autorizado' }),
      403,
    );
    const r = await fetch(`${SUPABASE_URL}/rest/v1/onboarding_dossies?id=eq.${dossier}`, {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${await loginApi(USERS.vendedor.email)}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ etapa: 'publicacao' }),
    });
    assert.equal(r.status, 403);
    expectStatus(await publish(piece.id), 400);
  });
  it('edita dados com histórico e identifica parada acima de 10 dias sem reiniciar prazo na edição', async () => {
    expectStatus(await rpcAs(USERS.admin, 'e2e_datar_cs', { p_peca: piece.id, p_dias: 9, p_alvo: 'etapa' }), 204);
    assert.equal((await dossierNow()).parado, false);
    expectStatus(await rpcAs(USERS.admin, 'e2e_datar_cs', { p_peca: piece.id, p_dias: 11, p_alvo: 'etapa' }), 204);
    const before = (await dossierNow()).etapa_em;
    await open(driver, '/dashboard/dossies');
    await cardHas(driver, `dossie-${dossier}`, 'Parado há mais de 10 dias');
    await clickLabeled(driver, `Editar dossiê ${dossier}`);
    await fill(driver, 'do-diagnostico', 'Diagnóstico revisado com o vendedor');
    await clickButton(driver, 'Salvar dossiê');
    await cardHas(driver, `dossie-${dossier}`, 'Diagnóstico revisado');
    assert.equal((await dossierNow()).etapa_em, before);
    await driver.findElement(By.id('do-parados')).click();
    await clickButton(driver, 'Consultar dossiês');
    await cardHas(driver, `dossie-${dossier}`, 'Parado há mais de 10 dias');
    await screenshot(driver, 'dossie-parado');
    await clickLabeled(driver, `Histórico do dossiê ${dossier}`);
    await waitForText(driver, 'Avaliar relógio e documentação de origem');
    assert.equal((await report()).dossies.parados, base.dossies.parados + 1);
  });
  it('registra desistência com motivo, bloqueia publicação e permite retomada auditada', async () => {
    expectStatus(await move(dossier, 'desistir', USERS.vendedor, ''), 400);
    await open(driver, '/dashboard/dossies');
    await movementUi(`Desistir do dossiê ${dossier}`, 'Vendedor pediu pausa para reunir documentos');
    await cardHas(driver, `dossie-${dossier}`, 'Desistência registrada');
    expectStatus(await publish(piece.id), 400);
    expectStatus(await move(dossier, 'avancar'), 400);
    assert.equal((await report()).dossies.desistidos, base.dossies.desistidos + 1);
    await movementUi(`Retomar dossiê ${dossier}`, 'Documentos reunidos; retomar acompanhamento');
    await cardHas(driver, `dossie-${dossier}`, 'Em acompanhamento');
    assert.equal((await dossierNow()).parado, false);
    const history = (await requestAs(USERS.vendedor, `/cs/dossies/${dossier}/historico`)).data;
    assert.deepEqual(
      history.slice(-2).map((h) => h.acao),
      ['desistir', 'retomar'],
    );
    assert.match(history.at(-1).anterior.motivo, /pediu pausa/);
  });
  it('administrador valida diagnóstico e verificação; perícia exige documentação e fotos', async () => {
    await as(driver, USERS.admin, '/dashboard/dossies');
    await movementUi(`Avançar dossiê ${dossier}`, 'Diagnóstico aceito');
    await cardHas(driver, `dossie-${dossier}`, 'Etapa: Verificação');
    await movementUi(`Avançar dossiê ${dossier}`, 'Cadastro e procedência verificados');
    await cardHas(driver, `dossie-${dossier}`, 'Etapa: Dossiê');
    expectStatus(
      await requestAs(USERS.vendedor, `/cs/dossies/${dossier}`, {
        method: 'PUT',
        body: { diagnostico: 'Diagnóstico revisado', documentacao: '' },
      }),
      204,
    );
    expectStatus(await move(dossier, 'avancar'), 400);
    await clickLabeled(driver, `Editar dossiê ${dossier}`);
    await fill(driver, 'do-documentacao', 'Documentação conferida para perícia');
    await clickButton(driver, 'Salvar dossiê');
    await cardHas(driver, `dossie-${dossier}`, 'Documentação conferida para perícia');
    await movementUi(`Avançar dossiê ${dossier}`, 'Dossiê completo e fotografias verificadas');
    await cardHas(driver, `dossie-${dossier}`, 'Etapa: Perícia');
    expectStatus(
      await requestAs(USERS.vendedor, `/cs/dossies/${dossier}`, {
        method: 'PUT',
        body: { diagnostico: 'Alteração tardia' },
      }),
      400,
    );
    expectStatus(await move(dossier, 'avancar'), 400);
  });
  it('laudo e passaporte reais habilitam curadoria; publicação conclui o dossiê atomicamente', async () => {
    expectStatus(
      await multipartAs(
        USERS.perito,
        '/laudos',
        { pecaId: piece.id, parecer: 'Peça autêntica após exame', valorAvaliacao: 1000, emitidoEm: today },
        { photos: true },
      ),
      201,
    );
    expectStatus(await move(dossier, 'avancar'), 400);
    await issuePassportApi(piece.id);
    await movementUi(`Avançar dossiê ${dossier}`, 'Laudo e passaporte conferidos');
    await cardHas(driver, `dossie-${dossier}`, 'Etapa: Curadoria');
    expectStatus(await move(dossier, 'avancar'), 400);
    expectStatus(await publish(piece.id), 200);
    await open(driver, '/dashboard/dossies');
    await cardHas(driver, `dossie-${dossier}`, 'Publicado · Etapa: Publicação');
    expectStatus(await move(dossier, 'desistir', USERS.vendedor), 400);
    const h = (await requestAs(USERS.admin, `/cs/dossies/${dossier}/historico`)).data;
    assert.equal(h.at(-1).acao, 'publicacao');
    assert.equal(h.at(-1).atual.status, 'concluido');
    assert.equal((await report()).dossies.publicados, base.dossies.publicados + 1);
  });
  it('RF03 calcula tempo até primeira publicação e republicação não duplica nem reinicia a medida', async () => {
    expectStatus(
      await rpcAs(USERS.admin, 'e2e_datar_cs', { p_peca: piece.id, p_dias: 3, p_alvo: 'duracao_publicacao' }),
      204,
    );
    const metric = (await report()).publicacao;
    assert.equal(metric.quantidade, base.publicacao.quantidade + 1);
    const expected = ((base.publicacao.mediaDias || 0) * base.publicacao.quantidade + 3) / metric.quantidade;
    assert.ok(Math.abs(metric.mediaDias - expected) <= 0.02);
    expectStatus(await publish(piece.id, 'rejeitada'), 200);
    expectStatus(await publish(piece.id), 200);
    assert.deepEqual((await report()).publicacao, metric);
  });
  it('RFC15: administrador cria plano com cliente, responsável e prazo; impede duplicidade ativa', async () => {
    await open(driver, '/dashboard/recuperacao');
    await select(driver, 'pr-cliente', clientId);
    await select(driver, 'pr-responsavel', adminId);
    await fill(driver, 'pr-objetivo', planBody().objetivo);
    // The initial date is today, valid for the first plan; subsequent edit expands the deadline.
    await clickButton(driver, 'Salvar plano');
    await waitForText(driver, 'Plano salvo com histórico.');
    plan = (await requestAs(USERS.admin, '/cs/planos')).data.find((p) => p.cliente_id === clientId).id;
    await cardHas(driver, `plano-${plan}`, planBody().objetivo);
    expectStatus(await requestAs(USERS.admin, '/cs/planos', { method: 'POST', body: planBody() }), 409);
    expectStatus(await closePlan(plan, 'concluido'), 400);
    expectStatus(await requestAs(client, '/cs/planos', { method: 'POST', body: planBody() }), 403);
  });
  it('revisa plano com histórico e preserva privacidade do cliente', async () => {
    await clickLabeled(driver, `Editar plano ${plan}`);
    await fill(driver, 'pr-objetivo', `${prefix} Objetivo revisado`);
    await clickButton(driver, 'Salvar plano');
    await cardHas(driver, `plano-${plan}`, 'Objetivo revisado');
    expectStatus(
      await requestAs(USERS.admin, `/cs/planos/${plan}`, {
        method: 'PUT',
        body: planBody(`${prefix} Objetivo revisado`),
      }),
      204,
    );
    assert.equal(
      (await requestAs(outsider, '/cs/planos')).data.some((p) => p.id === plan),
      false,
    );
    assert.deepEqual((await requestAs(outsider, `/cs/planos/${plan}/historico`)).data, []);
    const h = (await requestAs(client, `/cs/planos/${plan}/historico`)).data;
    assert.equal(h[1].anterior.objetivo, planBody().objetivo);
    assert.equal(h[1].atual.objetivo, `${prefix} Objetivo revisado`);
    expectStatus(await closePlan(plan, 'cancelado', client), 403);
  });
  it('cadastra e edita ações pela interface e valida prazos dentro do plano', async () => {
    await open(driver, '/dashboard/recuperacao');
    for (const text of ['Revisar lista de desejos', 'Conferir recomendações recebidas']) {
      await clickLabeled(driver, `Adicionar ação ao plano ${plan}`);
      await fill(driver, 'pr-acao', text);
      await clickButton(driver, 'Salvar ação');
      await cardHas(driver, `plano-${plan}`, text);
    }
    [action1, action2] = (await planNow()).acoes.map((a) => a.id);
    await clickLabeled(driver, `Editar ação ${action1}`);
    await fill(driver, 'pr-acao', 'Atualizar categorias e faixa de valor da lista');
    await clickButton(driver, 'Salvar ação');
    await cardHas(driver, `recuperacao-acao-${action1}`, 'Atualizar categorias');
    for (const prazo of ['2000-01-01', '2099-01-01'])
      expectStatus(
        await requestAs(USERS.admin, '/cs/acoes', {
          method: 'POST',
          body: { planoId: plan, descricao: 'Inválida', prazo },
        }),
        400,
      );
    expectStatus(
      await requestAs(USERS.admin, `/cs/planos/${plan}`, { method: 'PUT', body: { ...planBody(), prazo: today } }),
      400,
    );
    expectStatus(await closePlan(plan, 'concluido'), 400);
  });
  it('cliente acompanha seu plano e executa ações com resultado; terceiro não consegue alterar', async () => {
    expectStatus(await statusAction(action1, 'concluida', outsider), 403);
    expectStatus(await statusAction(action1, 'cancelada', client), 403);
    expectStatus(await statusAction(action1, 'concluida', client, ''), 400);
    await as(driver, client, '/dashboard/recuperacao');
    await cardHas(driver, `plano-${plan}`, 'Objetivo revisado');
    await cardHas(driver, `plano-${plan}`, USERS.admin.nome);
    await screenshot(driver, 'recuperacao-cliente');
    assert.equal((await driver.findElements(By.id('pr-cliente'))).length, 0);
    await statusUi(`Iniciar ação ${action1}`, 'Revendo preferências');
    await cardHas(driver, `recuperacao-acao-${action1}`, 'Em andamento');
    await statusUi(`Concluir ação ${action1}`, 'Preferências atualizadas e revisadas');
    await cardHas(driver, `recuperacao-acao-${action1}`, 'Concluída');
    expectStatus(await statusAction(action1, 'concluida', client), 400);
    expectStatus(
      await requestAs(USERS.admin, `/cs/acoes/${action1}`, {
        method: 'PUT',
        body: { planoId: plan, descricao: 'Alteração tardia', prazo: later },
      }),
      400,
    );
  });
  it('destaca ação atrasada no plano e no RF03, permitindo acompanhamento depois do vencimento', async () => {
    expectStatus(await rpcAs(client, 'e2e_vencer_acao_cs', { p_id: action2 }), 403);
    expectStatus(await rpcAs(USERS.admin, 'e2e_vencer_acao_cs', { p_id: action2 }), 204);
    await open(driver, '/dashboard/recuperacao');
    await cardHas(driver, `recuperacao-acao-${action2}`, 'Ação atrasada');
    assert.equal((await report()).acoes.atrasadas, base.acoes.atrasadas + 1);
    expectStatus(await statusAction(action2, 'em_andamento', client), 204);
    assert.equal((await planNow()).acoes.find((a) => a.id === action2).status, 'em_andamento');
  });
  it('administrador cancela ação restante com motivo e conclui plano preservando histórico', async () => {
    await as(driver, USERS.admin, '/dashboard/recuperacao');
    await statusUi(`Cancelar ação ${action2}`, 'Ação substituída pelo acompanhamento concluído');
    await statusUi(`Concluir plano ${plan}`, 'Participação retomada; acompanhamento concluído');
    await cardHas(driver, `plano-${plan}`, 'Concluído · Prazo');
    expectStatus(await requestAs(USERS.admin, `/cs/planos/${plan}`, { method: 'PUT', body: planBody() }), 400);
    expectStatus(
      await requestAs(USERS.admin, '/cs/acoes', {
        method: 'POST',
        body: { planoId: plan, descricao: 'Tardia', prazo: later },
      }),
      400,
    );
    await clickLabeled(driver, `Histórico do plano ${plan}`);
    await waitForText(driver, 'Preferências atualizadas e revisadas');
    const h = (await requestAs(client, `/cs/planos/${plan}/historico`)).data;
    assert.ok(h.some((i) => i.acao === 'editar_acao'));
    assert.ok(h.some((i) => i.atual.status === 'concluida'));
    assert.equal(h.at(-1).atual.status, 'concluido');
  });
  it('novo plano após encerramento é permitido; cancelamento encerra ações abertas sem apagar registros', async () => {
    const newPlan = expectStatus(
      await requestAs(USERS.admin, '/cs/planos', {
        method: 'POST',
        body: planBody(`${prefix} Segundo acompanhamento`),
      }),
      201,
    ).id;
    const a = expectStatus(
      await requestAs(USERS.admin, '/cs/acoes', {
        method: 'POST',
        body: { planoId: newPlan, descricao: 'Nova tentativa', prazo: later },
      }),
      201,
    ).id;
    expectStatus(await closePlan(newPlan, 'cancelado', USERS.admin, ''), 400);
    await open(driver, '/dashboard/recuperacao');
    await statusUi(`Cancelar plano ${newPlan}`, 'Cliente optou por adiar acompanhamento');
    await cardHas(driver, `plano-${newPlan}`, 'Cancelado · Prazo');
    assert.equal((await planNow(newPlan)).acoes[0].status, 'cancelada');
    expectStatus(await statusAction(a, 'concluida', client), 400);
    assert.equal(
      (await requestAs(client, `/cs/planos/${newPlan}/historico`)).data.filter((h) => h.atual.status === 'cancelada')
        .length,
      1,
    );
  });
  it('RF03 apresenta ações e planos por situação sem expor nomes, justificativas ou planos individuais', async () => {
    const data = await report();
    assert.equal(data.planos.total, base.planos.total + 2);
    assert.equal(data.planos.concluidos, base.planos.concluidos + 1);
    assert.equal(data.planos.cancelados, base.planos.cancelados + 1);
    assert.equal(data.acoes.total, base.acoes.total + 3);
    assert.equal(data.acoes.concluidas, base.acoes.concluidas + 1);
    assert.equal(data.acoes.canceladas, base.acoes.canceladas + 2);
    assert.equal(JSON.stringify(data).includes(prefix), false);
    await open(driver, '/dashboard/saude');
    await waitForText(driver, 'Acompanhamento e resultados');
    await driver.executeScript(
      'arguments[0].scrollIntoView({block: "start"})',
      await driver.findElement(By.css('[aria-label="Indicadores operacionais da saúde da base"]')),
    );
    await screenshot(driver, 'saude-operacional');
    const empty = await report('&coorte=1900-01');
    assert.equal(empty.planos.total, 0);
    assert.equal(empty.acoes.total, 0);
    assert.equal(empty.dossies.total, 0);
    assert.equal(empty.publicacao.mediaDias, null);
    assert.equal(empty.conferencias.taxaAprovacao, null);
    assert.deepEqual(empty.disputas, []);
    expectStatus(await rpcAs(USERS.comprador, 'relatorio_saude_base_core', { p_inicio: today, p_fim: today }), 403);
  });
  it('classifica contestação pela interface e RF03 conta conferências uma vez, agrupando motivos sem texto privado', async () => {
    const before = await report(),
      beforeBuyer = await report('&perfil=Comprador');
    const ready = async (suffix) => {
      const p = await createPublishedPecaApi({ nome: `${prefix} ${suffix}`, valor: 1000 });
      const t = await proposeApi(p.id, 1000);
      for (const [u, path, body] of [
        [USERS.vendedor, 'confirmar'],
        [USERS.comprador, 'pagamento'],
        [USERS.vendedor, 'envio', { rastreio: 'E2E CS envio' }],
        [USERS.comprador, 'recebimento'],
      ])
        expectStatus(await step(t, u, path, body), 200);
      return { p, t };
    };
    const approved = await ready('Aprovada');
    expectStatus(await step(approved.t, USERS.comprador, 'conferencia', { aprovada: true }), 200);
    const disputed = await ready('Contestada');
    expectStatus(
      await step(disputed.t, USERS.comprador, 'conferencia', {
        aprovada: false,
        motivo: 'Teste',
        categoriaMotivo: 'invalida',
      }),
      400,
    );
    expectStatus(await rpcAs(USERS.comprador, 'conferir_entrega_base', { p_id: disputed.t.id, p_aprovada: true }), 403);
    await as(driver, USERS.comprador, '/dashboard/transacoes');
    await waitForText(driver, disputed.p.nome);
    await clickLabeled(driver, `Contestar entrega de ${disputed.p.nome}`);
    await fill(driver, `entrega-${disputed.t.id}`, 'Texto privado sobre conservação da peça');
    await select(driver, `categoria-contestacao-${disputed.t.id}`, 'conservacao');
    await clickLabeled(driver, `Salvar contestar de ${disputed.p.nome}`);
    await waitForText(driver, 'Entrega contestada.');
    const after = await report(),
      buyer = await report('&perfil=Comprador');
    assert.equal(after.conferencias.total, before.conferencias.total + 2);
    assert.equal(buyer.conferencias.total, beforeBuyer.conferencias.total + 2);
    assert.equal(after.conferencias.aprovadas, before.conferencias.aprovadas + 1);
    assert.equal(after.conferencias.semDisputa, before.conferencias.semDisputa + 1);
    assert.equal(after.conferencias.contestadas, before.conferencias.contestadas + 1);
    assert.equal(
      after.disputas.find((d) => d.motivo === 'conservacao').quantidade,
      (before.disputas.find((d) => d.motivo === 'conservacao')?.quantidade || 0) + 1,
    );
    assert.equal(JSON.stringify(after).includes('Texto privado'), false);
    assert.equal((await report('&perfil=Perito')).conferencias.total, 0);
  });
});

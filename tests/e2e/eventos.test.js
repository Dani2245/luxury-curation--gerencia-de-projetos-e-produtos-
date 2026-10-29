import assert from 'node:assert/strict';
import webdriver from 'selenium-webdriver';
import { USERS } from './helpers/config.js';
import {
  cleanupE2E, createLinkApi, createPublishedPecaApi, issuePassportApi, proposeApi, requestAs
} from './helpers/api.js';
import {
  clearSession, clickButton, createDriver, fill, loginAndWaitDashboard, open, waitForPath, waitForText
} from './helpers/browser.js';

const { By } = webdriver;

const stamp = Date.now();
const prefix = `E2E Evento ${stamp}`;
const valor = 6000000 + (stamp % 100000);

const as = async (driver, user) => {
  await clearSession(driver);
  await loginAndWaitDashboard(driver, user.email);
};

// Lê o resumo agregado do painel do administrador: { evento: { total, gatilho } }
const readCounts = (driver) => driver.executeScript(`
  return Object.fromEntries([...document.querySelectorAll('[data-testid^="evento-"]')].map((row) => [
    row.dataset.testid.slice('evento-'.length),
    {
      total: Number(row.querySelector('[data-col="total"]').textContent),
      gatilho: Number(row.querySelector('[data-col="gatilho"]').textContent)
    }
  ]));
`);

const waitSummary = (driver) =>
  driver.wait(async () => driver.executeScript(`
    const text = document.body.innerText;
    return !text.includes('Carregando eventos...')
      && (document.querySelector('[data-testid^="evento-"]') !== null || text.includes('Nenhum evento registrado no período.'));
  `), 10000, 'Resumo de eventos não carregou');

const adminCounts = async (driver) => {
  await as(driver, USERS.admin);
  await waitForText(driver, 'Eventos de uso');
  await waitSummary(driver);
  return readCounts(driver);
};

const total = (counts, evento) => counts[evento]?.total ?? 0;
const gatilho = (counts, evento) => counts[evento]?.gatilho ?? 0;

// RNF06 - Registro de eventos de uso (data, origem e gatilho externo; relatórios só com dados agregados)
describe('RNF06 - Registro de eventos de uso', function () {
  let driver;

  before(async () => {
    driver = await createDriver();
  });

  after(async () => {
    await driver.quit();
    await cleanupE2E();
  });

  it('o administrador vê o resumo agregado dos eventos de uso no painel', async () => {
    const counts = await adminCounts(driver);
    assert.ok(total(counts, 'sessao_inicio') >= 1, 'o próprio login do administrador deve constar');
    const section = await driver.findElement(By.css('section[aria-labelledby="eventos-uso"]')).getText();
    assert.match(section, /Sessões iniciadas \(login\)/);
    for (const coluna of ['EVENTO', 'TOTAL', 'GATILHO EXTERNO', 'USUÁRIOS DISTINTOS']) {
      assert.ok(section.toUpperCase().includes(coluna), `coluna ${coluna}`);
    }
  });

  it('registra a sessão iniciada pelo login, com gatilho externo quando vem do link', async () => {
    const before = await adminCounts(driver);

    await clearSession(driver);
    await open(driver, '/login?origem=link');
    await fill(driver, 'email', USERS.comprador.email);
    await fill(driver, 'password', process.env.E2E_PASSWORD || 'Lastro@2026');
    await clickButton(driver, 'Entrar');
    await waitForPath(driver, '/dashboard');

    const after = await adminCounts(driver);
    // login do comprador pelo link e novo login do administrador
    assert.ok(total(after, 'sessao_inicio') >= total(before, 'sessao_inicio') + 2);
    assert.ok(gatilho(after, 'sessao_inicio') >= gatilho(before, 'sessao_inicio') + 1);
  });

  it('registra cada consulta ao passaporte por link e QR code como gatilho externo', async () => {
    const peca = await createPublishedPecaApi({ nome: `${prefix} A`, valor });
    const passaporte = await issuePassportApi(peca.id);
    const link = await createLinkApi(passaporte.id);
    const before = await adminCounts(driver);

    for (const path of [`/p/${link.token}`, `/p/${link.token}?origem=qr`]) {
      await clearSession(driver);
      await open(driver, path);
      await waitForText(driver, 'Assinatura válida');
    }

    const after = await adminCounts(driver);
    assert.equal(total(after, 'passaporte_consulta_link'), total(before, 'passaporte_consulta_link') + 2);
    assert.equal(gatilho(after, 'passaporte_consulta_link'), gatilho(before, 'passaporte_consulta_link') + 2);
  });

  it('conta uma consulta por usuário e passaporte a cada 30 minutos (recarregar não infla a North Star)', async () => {
    const peca = await createPublishedPecaApi({ nome: `${prefix} B`, valor: valor + 1 });
    await issuePassportApi(peca.id);
    const before = await adminCounts(driver);

    await as(driver, USERS.comprador);
    for (let i = 0; i < 2; i += 1) {
      await open(driver, `/peca/${peca.id}/passaporte`);
      await waitForText(driver, 'Assinatura válida');
    }
    await driver.navigate().refresh();
    await waitForText(driver, 'Assinatura válida');

    const after = await adminCounts(driver);
    assert.equal(total(after, 'passaporte_consulta'), total(before, 'passaporte_consulta') + 1);
  });

  it('registra automaticamente cadastro, publicação, emissão do passaporte e proposta', async () => {
    const before = await adminCounts(driver);
    const peca = await createPublishedPecaApi({ nome: `${prefix} C`, valor: valor + 2 });
    await issuePassportApi(peca.id);
    await proposeApi(peca.id, valor);

    const after = await adminCounts(driver);
    for (const evento of ['peca_cadastrada', 'anuncio_publicado', 'passaporte_emissao', 'transacao_proposta']) {
      assert.ok(total(after, evento) >= total(before, evento) + 1, `evento ${evento}`);
    }
  });

  it('registra a recusa de anúncios pela curadoria (métrica de proteção)', async () => {
    const before = await adminCounts(driver);
    const peca = await createPublishedPecaApi({ nome: `${prefix} D`, valor: valor + 3 });
    const { status } = await requestAs(USERS.admin, `/pecas/${peca.id}/publicacao`, { method: 'PATCH', body: { publicacao: 'rejeitada' } });
    assert.equal(status, 200);

    const after = await adminCounts(driver);
    assert.ok(total(after, 'anuncio_rejeitado') >= total(before, 'anuncio_rejeitado') + 1);
  });

  it('filtra o resumo por período', async () => {
    await adminCounts(driver);
    // campos de data no formato do navegador (dd/mm/aaaa)
    await fill(driver, 'ev-inicio', '01012100');
    await fill(driver, 'ev-fim', '31122100');
    await clickButton(driver, 'Atualizar');
    await waitForText(driver, 'Nenhum evento registrado no período.');
  });

  it('somente o administrador consulta o resumo, e apenas com dados agregados', async () => {
    await adminCounts(driver);
    const section = await driver.findElement(By.css('section[aria-labelledby="eventos-uso"]')).getText();
    for (const user of [USERS.comprador, USERS.vendedor, USERS.perito]) {
      assert.ok(!section.includes(user.nome) && !section.includes(user.email), `não deve identificar ${user.perfil}`);
    }

    for (const user of [USERS.comprador, USERS.vendedor, USERS.perito]) {
      const { status } = await requestAs(user, '/eventos/resumo');
      assert.equal(status, 403, `${user.perfil} não deve acessar o resumo`);
    }

    await as(driver, USERS.comprador);
    await waitForText(driver, 'Painel do Comprador');
    assert.equal((await driver.findElements(By.id('eventos-uso'))).length, 0);
  });
});

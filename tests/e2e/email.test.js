import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { SMTPServer } from 'smtp-server';
import { USERS, PASSWORD } from './helpers/config.js';
import { requestAs, loginApi, createUserApi, deleteUsersByEmail, cleanupE2E } from './helpers/api.js';
import { multipartAs, rpcAs } from './helpers/release3.js';
import { createDriver, fill, select, clickButton, clickLabeled, waitForPath, waitForText } from './helpers/browser.js';
const stamp = Date.now(),
  prefix = `E2E Email ${stamp}`;
const user = { nome: prefix, email: `e2e-email-${stamp}@example.invalid`, perfil: 'Vendedor', senha: PASSWORD };
const freePort = () =>
  new Promise((resolve, reject) => {
    const s = net.createServer();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const p = s.address().port;
      s.close(() => resolve(p));
    });
  });
const until = async (fn, ms = 15000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const r = await fn();
    if (r) return r;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('Condição não atingida no prazo');
};
describe('RFC21 - E-mail opcional com SMTP local (sem mensagens externas)', function () {
  this.timeout(60000);
  let driver, smtp, api, front, apiPort, frontPort, token, alertId;
  const messages = [];
  let rejectMail = false;
  const request = async (endpoint, { method = 'GET', body } = {}) => {
    const r = await fetch(`http://127.0.0.1:${apiPort}/api${endpoint}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, data: await r.json().catch(() => null) };
  };
  const history = async () => (await request(`/alertas/${alertId}/envios`)).data;
  const launch = (script, args, env, cwd) => {
    const p = spawn(process.execPath, [script, ...args], {
      cwd,
      env: { ...process.env, ...env },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    p.stdout.resume();
    p.stderr.resume();
    return p;
  };
  before(async () => {
    assert.equal((await createUserApi(user)).status, 201);
    token = await loginApi(user.email);
    assert.equal(
      (
        await multipartAs(user, '/pecas', {
          nome: `${prefix} Relógio`,
          categoria: 'relógio',
          descricao: 'Teste de alerta',
          valorPretendido: 1000,
          privada: true,
        })
      ).status,
      201,
    );
    smtp = new SMTPServer({
      disabledCommands: ['AUTH', 'STARTTLS'],
      authOptional: true,
      disableReverseLookup: true,
      logger: false,
      onData(stream, session, callback) {
        let content = '';
        stream.on('data', (chunk) => {
          content += chunk;
        });
        stream.on('end', () => {
          if (rejectMail) {
            const e = new Error('Falha SMTP de teste');
            e.responseCode = 451;
            callback(e);
          } else {
            messages.push({ content, to: session.envelope.rcptTo.map((r) => r.address) });
            callback();
          }
        });
      },
    });
    await new Promise((resolve, reject) => {
      smtp.on('error', reject);
      smtp.listen(0, '127.0.0.1', resolve);
    });
    apiPort = await freePort();
    frontPort = await freePort();
    api = launch(
      'server.js',
      [],
      {
        PORT: String(apiPort),
        FRONTEND_URL: `http://127.0.0.1:${frontPort}`,
        MAIL_ENABLED: 'true',
        SMTP_HOST: '127.0.0.1',
        SMTP_PORT: String(smtp.server.address().port),
        SMTP_ALLOW_LOCAL_PLAINTEXT: 'true',
        SMTP_SECURE: 'false',
        SMTP_USER: '',
        SMTP_PASSWORD: '',
        SMTP_FROM: 'Lastro Teste <teste@example.invalid>',
        PUBLIC_APP_URL: `http://127.0.0.1:${frontPort}`,
      },
      path.resolve('backend'),
    );
    front = launch(
      'node_modules/vite/bin/vite.js',
      ['--host', '127.0.0.1', '--port', String(frontPort), '--strictPort'],
      { VITE_API_URL: `http://127.0.0.1:${apiPort}` },
      process.cwd(),
    );
    await until(async () => {
      try {
        return (
          (await fetch(`http://127.0.0.1:${apiPort}/api/health`)).ok &&
          (await fetch(`http://127.0.0.1:${frontPort}`)).ok
        );
      } catch {
        return false;
      }
    }, 30000);
    driver = await createDriver();
    await driver.get(`http://127.0.0.1:${frontPort}/login`);
    await fill(driver, 'email', user.email);
    await fill(driver, 'password', PASSWORD);
    await clickButton(driver, 'Entrar');
    await waitForPath(driver, '/dashboard', 20000);
  });
  after(async () => {
    if (driver) await driver.quit();
    api?.kill();
    front?.kill();
    if (smtp) await new Promise((r) => smtp.close(r));
    await cleanupE2E(prefix);
    await deleteUsersByEmail(user.email);
  });
  it('oferece e-mail somente com transporte configurado e permite consentimento pelo canal', async () => {
    assert.equal((await request('/alertas/canais')).data.email, true);
    await driver.get(`http://127.0.0.1:${frontPort}/dashboard/alertas`);
    await select(driver, 'alerta-canal', 'email');
    await clickButton(driver, 'Criar alerta');
    await waitForText(driver, 'Alerta criado.');
    const list = (await request('/alertas')).data;
    assert.equal(list.length, 1);
    assert.equal(list[0].canal, 'email');
    alertId = list[0].id;
  });
  it('entrega no SMTP local, registra resultado e não duplica em acessos concorrentes', async () => {
    await Promise.all([request('/notificacoes'), request('/notificacoes')]);
    await until(async () => (await history()).some((h) => h.email?.status === 'enviado'));
    assert.equal(messages.length, 1);
    assert.deepEqual(messages[0].to, [user.email]);
    assert.match(messages[0].content, /dashboard\/alertas/);
    assert.match(messages[0].content, /origem=3Demail|origem=email/);
    await request('/notificacoes');
    assert.equal(messages.length, 1);
    await clickLabeled(driver, `Histórico do alerta ${alertId}`);
    await waitForText(driver, 'aceito pelo servidor de e-mail');
  });
  it('registra falha SMTP e permite tentar novamente sem duplicar a notificação', async () => {
    await request(`/alertas/${alertId}`, { method: 'DELETE' });
    const created = await request('/alertas', {
      method: 'POST',
      body: { tipo: 'passaporte incompleto', canal: 'email' },
    });
    assert.equal(created.status, 201);
    alertId = created.data.id;
    rejectMail = true;
    await request('/notificacoes');
    await until(async () => (await history()).some((h) => h.email?.status === 'falhou'));
    assert.equal(messages.length, 1);
    rejectMail = false;
    await driver.get(`http://127.0.0.1:${frontPort}/dashboard/alertas`);
    await clickLabeled(driver, `Histórico do alerta ${alertId}`);
    await waitForText(driver, 'E-mail: falhou');
    await clickButton(driver, 'Tentar e-mail novamente');
    await waitForText(driver, 'Nova tentativa de e-mail iniciada.');
    await until(async () => (await history()).some((h) => h.email?.status === 'enviado'));
    assert.equal(messages.length, 2);
    assert.equal((await history()).length, 1);
  });
  it('desligar cancela fila pendente; outra conta não consulta o histórico', async () => {
    await request(`/alertas/${alertId}`, { method: 'DELETE' });
    const created = await request('/alertas', {
      method: 'POST',
      body: { tipo: 'passaporte incompleto', canal: 'email' },
    });
    alertId = created.data.id;
    // Gera a fila no banco sem chamar o transportador, para verificar o opt-out antes do envio.
    assert.equal((await rpcAs(user, 'processar_alertas', {})).status, 200);
    assert.equal((await request(`/alertas/${alertId}/ativo`, { method: 'PATCH', body: { ativo: false } })).status, 200);
    await request('/notificacoes');
    const entries = await history();
    assert.equal(entries[0].email.status, 'cancelado');
    assert.equal(messages.length, 2);
    assert.equal((await requestAs(USERS.comprador, `/alertas/${alertId}/envios`)).status, 404);
  });

  for (const expired of [false, true]) {
    it(`preserva destino e origem do e-mail após login ${expired ? 'com sessão expirada' : 'sem sessão'}`, async () => {
      if (expired) {
        await driver.executeScript("localStorage.setItem('token', 'sessao-expirada')");
      } else {
        await driver.executeScript('localStorage.clear()');
      }
      await driver.get(`http://127.0.0.1:${frontPort}/dashboard/alertas?origem=email`);
      await waitForPath(driver, '/login');
      const login = new URL(await driver.getCurrentUrl());
      assert.equal(login.searchParams.get('retorno'), '/dashboard/alertas?origem=email');
      assert.equal(login.searchParams.get('origem'), 'email');
      // Confere a origem enviada ao registro de sessão, além do destino da navegação.
      await driver.executeScript(`
        const originalFetch = window.fetch;
        window.fetch = function(url, options) {
          if (String(url).endsWith('/api/login')) window.loginBody = JSON.parse(options.body);
          return originalFetch.apply(this, arguments);
        };
      `);
      await fill(driver, 'email', user.email);
      await fill(driver, 'password', PASSWORD);
      await clickButton(driver, 'Entrar');
      await waitForPath(driver, '/dashboard/alertas', 20000);
      await waitForText(driver, 'Meus alertas');
      assert.equal(new URL(await driver.getCurrentUrl()).searchParams.get('origem'), 'email');
      assert.equal(await driver.executeScript('return window.loginBody.origem'), 'email');
    });
  }

  it('ignora destino de retorno externo informado na URL de login', async () => {
    for (const destination of ['//example.invalid', '/\\example.invalid']) {
      await driver.executeScript('localStorage.clear()');
      await driver.get(`http://127.0.0.1:${frontPort}/login?retorno=${encodeURIComponent(destination)}`);
      await fill(driver, 'email', user.email);
      await fill(driver, 'password', PASSWORD);
      await clickButton(driver, 'Entrar');
      await waitForPath(driver, '/dashboard', 20000);
      assert.equal(new URL(await driver.getCurrentUrl()).origin, `http://127.0.0.1:${frontPort}`);
    }
  });
});

const nodemailer = require('nodemailer');
const emailEnabled = () =>
  process.env.MAIL_ENABLED === 'true' &&
  Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM && process.env.PUBLIC_APP_URL);
let transport;
const getTransport = () => {
  if (transport) return transport;
  const local =
    process.env.SMTP_ALLOW_LOCAL_PLAINTEXT === 'true' &&
    ['127.0.0.1', 'localhost', '::1'].includes(process.env.SMTP_HOST);
  transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    requireTLS: !local,
    ignoreTLS: local,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 10000,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  return transport;
};
// Só a própria sessão pode reservar sua fila. O endereço vem do perfil autenticado.
const deliverEmails = async (db, user) => {
  if (!emailEnabled()) return;
  const { data: jobs, error } = await db.rpc('reservar_emails_alertas');
  if (error) throw new Error('Falha ao reservar fila de email');
  for (const job of jobs || []) {
    const { data: current, error: readError } = await db
      .from('alerta_email_fila')
      .select('status,reserva')
      .eq('envio_id', job.id)
      .single();
    if (readError || current.status !== 'enviando' || current.reserva !== job.reserva) continue;
    let success = false;
    try {
      const base = new URL(process.env.PUBLIC_APP_URL);
      if (!['http:', 'https:'].includes(base.protocol)) throw new Error('URL invalida');
      const url = new URL(job.link, base);
      if (url.origin !== base.origin) throw new Error('Destino invalido');
      url.searchParams.set('origem', 'email');
      const settings = new URL('/dashboard/alertas', base);
      const info = await getTransport().sendMail({
        from: process.env.SMTP_FROM,
        to: user.email,
        subject: job.titulo,
        messageId: `<lastro-alerta-${job.id}@${base.hostname}>`,
        text: `${job.titulo}\n\n${job.mensagem}\n\nAbrir: ${url.href}\n\nEste alerta foi escolhido por você. Altere a frequência ou desligue em: ${settings.href}`,
      });
      success = info.accepted?.length > 0;
    } catch {
      /* Não exponha credenciais nem mensagens do provedor em logs ou na API. */
    }
    const { error: saveError } = await db.rpc('finalizar_email_alerta', {
      p_envio: job.id,
      p_reserva: job.reserva,
      p_sucesso: success,
    });
    if (saveError) throw new Error('Falha ao registrar resultado do email');
  }
};
module.exports = { emailEnabled, deliverEmails };

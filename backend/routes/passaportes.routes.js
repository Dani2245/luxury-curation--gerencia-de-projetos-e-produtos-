const crypto = require('crypto');
const path = require('path');
const express = require('express');
const router = express.Router();
const validate = require('../middlewares/validate');
const { authenticate, authorize } = require('../middlewares/auth');
const { uploadDocumentos, CAMPOS } = require('../middlewares/upload-documentos');
const { handleDbError } = require('../utils/db-error');
const {
  emitirPassaporteSchema,
  atualizarPassaporteSchema,
  privacidadeSchema,
  passaporteIdParamSchema,
  pecaIdParamSchema,
  transferenciaSchema
} = require('../schemas/passaporte.schema');

const BUCKET = 'passaportes';
const EXTENSOES = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const SIGNED_URL_SECONDS = 3600;

// O multer lê nomes de arquivo como latin1; converte para UTF-8
const fileTitle = (file) => path.parse(Buffer.from(file.originalname, 'latin1').toString('utf8')).name;

// Envia os arquivos recebidos ao storage e devolve os documentos no formato esperado pelas funções SQL
const uploadDocumentosPassaporte = async (req, pecaId, descricao) => {
  const documentos = [];
  const paths = [];

  try {
    for (const [campo, tipo] of Object.entries(CAMPOS)) {
      for (const file of req.files?.[campo] || []) {
        const arquivoPath = `peca-${pecaId}/${crypto.randomUUID()}.${EXTENSOES[file.mimetype]}`;
        const { error } = await req.db.storage.from(BUCKET).upload(arquivoPath, file.buffer, { contentType: file.mimetype });
        if (error) throw Object.assign(new Error('Erro ao enviar os documentos'), { cause: error });

        paths.push(arquivoPath);
        documentos.push({
          tipo,
          titulo: fileTitle(file),
          descricao: descricao || null,
          arquivo_path: arquivoPath,
          mime: file.mimetype,
          hash_sha256: crypto.createHash('sha256').update(file.buffer).digest('hex')
        });
      }
    }
  } catch (err) {
    await removeArquivos(req.db, paths);
    throw err;
  }

  return { documentos, paths };
};

const removeArquivos = async (db, paths) => {
  if (paths.length === 0) return;
  const { error } = await db.storage.from(BUCKET).remove(paths);
  if (error) console.warn('[Supabase Storage] Falha ao remover documentos:', error.message);
};

const uploadOrFail = async (req, res, pecaId, descricao) => {
  try {
    return await uploadDocumentosPassaporte(req, pecaId, descricao);
  } catch (err) {
    console.error('[Supabase Storage]', err.cause?.message || err.message);
    res.status(500).json({ message: 'Erro ao enviar os documentos' });
    return null;
  }
};

const formatPeca = (item) => ({
  id: item.id,
  nome: item.nome,
  categoria: item.categoria,
  fotografias: item.fotografias || [],
  vendedor: { id: item.vendedor_id, nome: item.vendedor_nome },
  publicacao: item.publicacao,
  statusPassaporte: item.status_passaporte,
  vendida: item.vendida
});

// GET /api/passaportes/pendentes - Peças aguardando a emissão do passaporte (Perito)
router.get('/pendentes', authenticate, authorize('Perito', 'Administrador'), async (req, res) => {
  const { data, error } = await req.db
    .from('vw_pecas')
    .select('*')
    .is('passaporte_id', null)
    .neq('publicacao', 'rejeitada')
    .order('nome', { ascending: true });
  if (error) return handleDbError(res, error, 'Erro ao consultar peças sem passaporte');

  res.json(data.map(formatPeca));
});

// GET /api/passaportes/peca/:pecaId - Consultar passaporte digital da peça (RFS06)
router.get(
  '/peca/:pecaId',
  authenticate,
  authorize('Comprador', 'Administrador', 'Perito', 'Vendedor'),
  validate(pecaIdParamSchema, 'params'),
  async (req, res) => {
    const db = req.db;

    const { data: peca, error: pecaError } = await db.from('vw_pecas').select('*').eq('id', req.params.pecaId).maybeSingle();
    if (pecaError) return handleDbError(res, pecaError, 'Erro ao buscar a peça');
    if (!peca) return res.status(404).json({ message: 'Peça não encontrada' });

    const { data: passaporte, error } = await db.from('passaportes').select('*').eq('peca_id', peca.id).maybeSingle();
    if (error) return handleDbError(res, error, 'Erro ao consultar o passaporte');
    if (!passaporte) return res.status(404).json({ message: 'A peça ainda não possui passaporte digital' });

    const [documentos, proprietarios, eventos, assinatura] = await Promise.all([
      db.from('passaporte_documentos').select('*').eq('passaporte_id', passaporte.id).order('id'),
      db.from('vw_passaporte_proprietarios').select('*').eq('passaporte_id', passaporte.id).order('ordem'),
      db.from('passaporte_eventos').select('*').eq('passaporte_id', passaporte.id).order('id'),
      db.rpc('passaporte_assinatura_valida', { p_id: passaporte.id })
    ]);
    const failed = [documentos, proprietarios, eventos, assinatura].find((r) => r.error);
    if (failed) return handleDbError(res, failed.error, 'Erro ao consultar o passaporte');

    // URLs assinadas e temporárias: o bucket é privado
    const urls = {};
    if (documentos.data.length > 0) {
      const { data: signed } = await db.storage
        .from(BUCKET)
        .createSignedUrls(documentos.data.map((d) => d.arquivo_path), SIGNED_URL_SECONDS);
      (signed || []).forEach((item) => {
        if (!item.error) urls[item.path] = item.signedUrl;
      });
    }

    const assinaturas = eventos.data.filter((e) => e.tipo === 'emissao' || e.tipo === 'atualizacao');
    const emissao = assinaturas[0];
    const ultima = assinaturas[assinaturas.length - 1];

    // RNF06: consulta ao passaporte (alimenta a North Star); falhar aqui não impede a consulta
    const origem = typeof req.query.origem === 'string' ? req.query.origem : null;
    const { error: eventoError } = await db.rpc('registrar_consulta_passaporte', { p_passaporte_id: passaporte.id, p_origem: origem });
    if (eventoError) console.warn('[Eventos de uso] Falha ao registrar a consulta:', eventoError.message);

    res.json({
      id: passaporte.id,
      peca: { id: peca.id, nome: peca.nome, categoria: peca.categoria, vendida: peca.vendida },
      status: passaporte.status,
      versao: passaporte.versao,
      perito: emissao?.autor_nome || null,
      assinatura: {
        valida: assinatura.data === true,
        assinadoPor: ultima?.autor_nome || null,
        assinadoEm: passaporte.assinado_em,
        codigo: passaporte.assinatura.slice(0, 24)
      },
      proprietariosPublicos: passaporte.proprietarios_publicos,
      ehProprietario: peca.proprietario_id === req.user.id,
      documentos: documentos.data.map((d) => ({
        id: d.id,
        tipo: d.tipo,
        titulo: d.titulo,
        descricao: d.descricao,
        hash: d.hash_sha256,
        url: urls[d.arquivo_path] || null,
        criadoEm: d.criado_em
      })),
      proprietarios: proprietarios.data.map((o) => ({
        ordem: o.ordem,
        nome: o.nome,
        desde: o.desde,
        ate: o.ate,
        atual: o.atual,
        origem: o.origem
      })),
      eventos: eventos.data.map((e) => ({
        id: e.id,
        tipo: e.tipo,
        descricao: e.descricao,
        autor: e.autor_nome,
        criadoEm: e.criado_em
      }))
    });
  }
);

// POST /api/passaportes - Emitir passaporte assinado digitalmente pelo perito (RFS05, RFC07)
router.post(
  '/',
  authenticate,
  authorize('Perito'),
  uploadDocumentos,
  validate(emitirPassaporteSchema),
  async (req, res) => {
    const { pecaId, status, proprietarios, descricao } = req.body;

    if (!(req.files?.certificados || []).length) {
      return res.status(400).json({ message: 'Anexe ao menos um certificado de autenticidade' });
    }

    const upload = await uploadOrFail(req, res, pecaId, descricao);
    if (!upload) return;

    const { data: id, error } = await req.db.rpc('emitir_passaporte', {
      p_peca_id: pecaId,
      p_status: status,
      p_documentos: upload.documentos,
      p_proprietarios: proprietarios
    });
    if (error) {
      await removeArquivos(req.db, upload.paths);
      return handleDbError(res, error, 'Erro ao emitir o passaporte');
    }

    res.status(201).json({ id, pecaId });
  }
);

// PUT /api/passaportes/:id - Atualizar com novos laudos, certificados ou restaurações (RFS07)
router.put(
  '/:id',
  authenticate,
  authorize('Perito', 'Administrador'),
  validate(passaporteIdParamSchema, 'params'),
  uploadDocumentos,
  validate(atualizarPassaporteSchema),
  async (req, res) => {
    const { data: atual, error: fetchError } = await req.db
      .from('passaportes')
      .select('id, peca_id')
      .eq('id', req.params.id)
      .maybeSingle();
    if (fetchError) return handleDbError(res, fetchError, 'Erro ao buscar o passaporte');
    if (!atual) return res.status(404).json({ message: 'Passaporte não encontrado' });

    const { status, descricao } = req.body;
    const upload = await uploadOrFail(req, res, atual.peca_id, descricao);
    if (!upload) return;

    const { error } = await req.db.rpc('atualizar_passaporte', {
      p_id: atual.id,
      p_status: status ?? null,
      p_documentos: upload.documentos,
      p_descricao: descricao ?? null
    });
    if (error) {
      await removeArquivos(req.db, upload.paths);
      return handleDbError(res, error, 'Erro ao atualizar o passaporte');
    }

    res.json({ id: atual.id, pecaId: atual.peca_id });
  }
);

// PATCH /api/passaportes/:id/privacidade - O proprietário decide se a identidade dos donos é pública (RNF04)
router.patch(
  '/:id/privacidade',
  authenticate,
  authorize('Vendedor', 'Comprador'),
  validate(passaporteIdParamSchema, 'params'),
  validate(privacidadeSchema),
  async (req, res) => {
    const { error } = await req.db.rpc('definir_exibicao_proprietarios', {
      p_id: req.params.id,
      p_publico: req.body.publico
    });
    if (error) return handleDbError(res, error, 'Erro ao atualizar a privacidade do passaporte');

    res.json({ id: Number(req.params.id), proprietariosPublicos: req.body.publico });
  }
);

// POST /api/passaportes/transferencias - Registrar transferência de propriedade após a venda (RFS08)
router.post(
  '/transferencias',
  authenticate,
  authorize('Administrador'),
  validate(transferenciaSchema),
  async (req, res) => {
    const { error } = await req.db.rpc('admin_registrar_transferencia', { p_transacao_id: req.body.transacaoId });
    if (error) return handleDbError(res, error, 'Erro ao registrar a transferência');

    res.status(201).json({ transacaoId: req.body.transacaoId });
  }
);

module.exports = router;

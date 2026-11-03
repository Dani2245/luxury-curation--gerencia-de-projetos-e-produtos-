const crypto = require('crypto');
const express = require('express');
const router = express.Router();
const validate = require('../middlewares/validate');
const { authenticate, authorize } = require('../middlewares/auth');
const { uploadFotografias } = require('../middlewares/upload');
const { handleDbError } = require('../utils/db-error');
const { resolveFotos, PREFIX: PRIVATE_PREFIX, BUCKET: PRIVATE_BUCKET } = require('../utils/peca-fotos');
const {
  pecaSchema,
  listPecasQuerySchema,
  pecaIdParamSchema,
  publicacaoSchema
} = require('../schemas/peca.schema');

const BUCKET = 'pecas';
const EXTENSOES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

// Normaliza colunas snake_case do Postgres para o camelCase esperado pelo React
const formatPeca = async (db, item) => ({
  id: item.id,
  nome: item.nome,
  categoria: item.categoria,
  atributos: item.atributos || {},
  privada: item.privada,
  descricao: item.descricao,
  valor: Number(item.valor_pretendido),
  fotografias: (await resolveFotos(db, item.fotografias || [])).filter(Boolean),
  fotografiasRefs: item.fotografias || [],
  vendedor: { id: item.vendedor_id, nome: item.vendedor_nome },
  proprietarioId: item.proprietario_id,
  publicacao: item.publicacao,
  statusPassaporte: item.status_passaporte,
  passaporteId: item.passaporte_id,
  emNegociacao: item.em_negociacao,
  vendida: item.vendida,
  criadoEm: item.criado_em,
  atualizadoEm: item.atualizado_em
});

const fetchPeca = (db, id) => db.from('vw_pecas').select('*').eq('id', id).maybeSingle();

// Caminho do arquivo no bucket a partir da URL pública (ignora URLs externas ou de seed)
const storagePathFromUrl = (url) => {
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const index = url.indexOf(marker);
  return index === -1 ? null : decodeURIComponent(url.slice(index + marker.length));
};

const removeFotografias = async (db, urls) => {
  const privatePaths = urls.filter((url) => url.startsWith(PRIVATE_PREFIX)).map((url) => url.slice(PRIVATE_PREFIX.length));
  if (privatePaths.length) await db.storage.from(PRIVATE_BUCKET).remove(privatePaths);
  const paths = urls.map(storagePathFromUrl).filter(Boolean);
  if (paths.length === 0) return;
  const { error } = await db.storage.from(BUCKET).remove(paths);
  if (error) console.warn('[Supabase Storage] Falha ao remover fotografias:', error.message);
};

const uploadArquivos = async (req) => {
  const urls = [];
  const paths = [];
  const bucket = req.body.privada ? PRIVATE_BUCKET : BUCKET;

  for (const file of req.files || []) {
    const path = `${req.user.id}/${crypto.randomUUID()}.${EXTENSOES[file.mimetype]}`;
    const { error } = await req.db.storage.from(bucket).upload(path, file.buffer, { contentType: file.mimetype });
    if (error) {
      await req.db.storage.from(bucket).remove(paths);
      throw Object.assign(new Error('Erro ao enviar as fotografias'), { cause: error });
    }
    paths.push(path);
    urls.push(bucket === PRIVATE_BUCKET ? `${PRIVATE_PREFIX}${path}` : req.db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl);
  }

  return urls;
};

const uploadOrFail = async (req, res) => {
  try {
    return await uploadArquivos(req);
  } catch (err) {
    console.error('[Supabase Storage]', err.cause?.message || err.message);
    res.status(500).json({ message: 'Erro ao enviar as fotografias' });
    return null;
  }
};

// GET /api/pecas/minhas - Peças do vendedor autenticado (gestão das próprias peças)
router.get('/minhas', authenticate, authorize('Vendedor'), async (req, res) => {
  const { data, error } = await req.db
    .from('vw_pecas')
    .select('*')
    .eq('vendedor_id', req.user.id)
    .order('nome', { ascending: true });
  if (error) return handleDbError(res, error, 'Erro ao consultar peças');

  res.json(await Promise.all(data.map((p) => formatPeca(req.db, p))));
});

// GET /api/pecas/pendentes - Fila de anúncios aguardando validação do administrador (RFC02)
router.get('/pendentes', authenticate, authorize('Administrador'), async (req, res) => {
  const { data, error } = await req.db
    .from('vw_pecas')
    .select('*')
    .eq('publicacao', 'pendente')
    .eq('privada', false)
    .order('nome', { ascending: true });
  if (error) return handleDbError(res, error, 'Erro ao consultar anúncios pendentes');

  res.json(await Promise.all(data.map((p) => formatPeca(req.db, p))));
});

// GET /api/pecas - Consultar peças por categoria, faixa de valor e vendedor (RFS02)
router.get(
  '/',
  authenticate,
  authorize('Comprador', 'Administrador'),
  validate(listPecasQuerySchema, 'query'),
  async (req, res) => {
    const { categoria, valorMin, valorMax, vendedor, publicacao } = req.query;

    let query = req.db.from('vw_pecas').select('*').order('nome', { ascending: true });
    if (categoria) query = query.eq('categoria', categoria);
    if (valorMin !== undefined) query = query.gte('valor_pretendido', valorMin);
    if (valorMax !== undefined) query = query.lte('valor_pretendido', valorMax);
    if (vendedor) query = query.ilike('vendedor_nome', `%${vendedor}%`);
    // Compradores só enxergam peças publicadas (garantido também pela view no banco)
    if (req.user.perfil === 'Comprador') query = query.eq('publicacao', 'publicada');
    else if (publicacao) query = query.eq('publicacao', publicacao);

    const { data, error } = await query;
    if (error) return handleDbError(res, error, 'Erro ao consultar peças');

    res.json(await Promise.all(data.map((p) => formatPeca(req.db, p))));
  }
);

// GET /api/pecas/:id - Buscar peça específica (Perito consulta as peças para emitir o passaporte)
router.get(
  '/:id',
  authenticate,
  authorize('Comprador', 'Administrador', 'Vendedor', 'Perito'),
  validate(pecaIdParamSchema, 'params'),
  async (req, res) => {
    const { data, error } = await fetchPeca(req.db, req.params.id);
    if (error) return handleDbError(res, error, 'Erro ao buscar peça');
    if (!data) return res.status(404).json({ message: 'Peça não encontrada' });

    res.json(await formatPeca(req.db, data));
  }
);

// POST /api/pecas - Inserir peça (RFS01). multipart/form-data com fotografias opcionais
router.post(
  '/',
  authenticate,
  authorize('Vendedor'),
  uploadFotografias,
  validate(pecaSchema),
  async (req, res) => {
    const { nome, categoria, descricao, valorPretendido, atributos, privada } = req.body;

    const fotografias = await uploadOrFail(req, res);
    if (!fotografias) return;

    const { data, error } = await req.db
      .from('pecas')
      .insert({
        nome,
        categoria,
        atributos,
        privada,
        descricao,
        valor_pretendido: valorPretendido,
        fotografias,
        vendedor_id: req.user.id
      })
      .select('id')
      .single();

    if (error) {
      await removeFotografias(req.db, fotografias);
      return handleDbError(res, error, 'Erro ao cadastrar peça');
    }

    const { data: peca } = await fetchPeca(req.db, data.id);
    res.status(201).json(await formatPeca(req.db, peca));
  }
);

// PUT /api/pecas/:id - Editar peça enquanto não estiver em negociação (RFS03)
router.put(
  '/:id',
  authenticate,
  authorize('Vendedor'),
  validate(pecaIdParamSchema, 'params'),
  uploadFotografias,
  validate(pecaSchema),
  async (req, res) => {
    const { data: atual, error: fetchError } = await fetchPeca(req.db, req.params.id);
    if (fetchError) return handleDbError(res, fetchError, 'Erro ao buscar peça');
    if (!atual || atual.vendedor_id !== req.user.id) {
      return res.status(404).json({ message: 'Peça não encontrada' });
    }
    if (atual.vendida) {
      return res.status(409).json({ message: 'A peça já foi vendida e não pode ser editada' });
    }
    if (atual.em_negociacao) {
      return res.status(409).json({ message: 'A peça está em negociação e não pode ser editada' });
    }

    const { nome, categoria, descricao, valorPretendido, fotografiasMantidas, atributos, privada } = req.body;

    const novas = await uploadOrFail(req, res);
    if (!novas) return;

    const atuais = atual.fotografias || [];
    const mantidas = fotografiasMantidas ? atuais.filter((url) => fotografiasMantidas.includes(url)) : atuais;
    const removidas = atuais.filter((url) => !mantidas.includes(url));
    const privateCopies = [];
    const finalKept = [];
    try {
      for (const ref of mantidas) {
        if (!privada || ref.startsWith(PRIVATE_PREFIX)) { finalKept.push(ref); continue; }
        const path = storagePathFromUrl(ref);
        if (!path) throw { code: 'P0001', message: 'Remova as fotografias de exemplo antes de tornar esta peça privada' };
        const original = await req.db.storage.from(BUCKET).download(path);
        if (original.error) throw original.error;
        const destination = `${req.user.id}/${crypto.randomUUID()}.${EXTENSOES[original.data.type] || 'jpg'}`;
        const copy = await req.db.storage.from(PRIVATE_BUCKET).upload(destination, original.data, { contentType: original.data.type });
        if (copy.error) throw copy.error;
        const privateRef = `${PRIVATE_PREFIX}${destination}`;
        finalKept.push(privateRef); privateCopies.push(privateRef); removidas.push(ref);
      }
    } catch (error) {
      await removeFotografias(req.db, [...novas, ...privateCopies]);
      return handleDbError(res, error, 'Erro ao proteger fotografias da peça');
    }

    const { error } = await req.db
      .from('pecas')
      .update({
        nome,
        categoria,
        atributos,
        privada,
        descricao,
        valor_pretendido: valorPretendido,
        fotografias: [...finalKept, ...novas]
      })
      .eq('id', req.params.id);

    if (error) {
      await removeFotografias(req.db, [...novas, ...privateCopies]);
      return handleDbError(res, error, 'Erro ao atualizar peça');
    }

    await removeFotografias(req.db, removidas);
    const { data: peca } = await fetchPeca(req.db, req.params.id);
    res.json(await formatPeca(req.db, peca));
  }
);

// PATCH /api/pecas/:id/publicacao - Administrador valida o anúncio antes da publicação (RFC02)
router.patch(
  '/:id/publicacao',
  authenticate,
  authorize('Administrador'),
  validate(pecaIdParamSchema, 'params'),
  validate(publicacaoSchema),
  async (req, res) => {
    const { data, error } = await req.db
      .from('pecas')
      .update({ publicacao: req.body.publicacao })
      .eq('id', req.params.id)
      .select('id');
    if (error) return handleDbError(res, error, 'Erro ao atualizar a situação do anúncio');
    if (!data || data.length === 0) return res.status(404).json({ message: 'Peça não encontrada' });

    const { data: peca } = await fetchPeca(req.db, req.params.id);
    res.json(await formatPeca(req.db, peca));
  }
);

// DELETE /api/pecas/:id - Remover peça sem transação em andamento (RFS04)
router.delete(
  '/:id',
  authenticate,
  authorize('Vendedor'),
  validate(pecaIdParamSchema, 'params'),
  async (req, res) => {
    const { data: atual, error: fetchError } = await fetchPeca(req.db, req.params.id);
    if (fetchError) return handleDbError(res, fetchError, 'Erro ao buscar peça');
    if (!atual || atual.vendedor_id !== req.user.id) {
      return res.status(404).json({ message: 'Peça não encontrada' });
    }
    if (atual.vendida) {
      return res.status(409).json({ message: 'A peça já foi vendida e não pode ser removida' });
    }
    if (atual.em_negociacao) {
      return res.status(409).json({ message: 'A peça possui transação em andamento e não pode ser removida' });
    }

    const { data, error } = await req.db.from('pecas').delete().eq('id', req.params.id).select('id');
    if (error) return handleDbError(res, error, 'Erro ao remover peça');
    if (!data || data.length === 0) {
      return res.status(409).json({ message: 'A peça não pôde ser removida' });
    }

    await removeFotografias(req.db, atual.fotografias || []);
    res.status(204).send();
  }
);

module.exports = router;

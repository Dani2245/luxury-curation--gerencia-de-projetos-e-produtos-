const crypto = require('node:crypto');
const router = require('express').Router();
const { authenticate, authorize } = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const { uploadFotografias } = require('../middlewares/upload');
const { idParams } = require('../schemas/operacao.schema');
const { laudoSchema, laudosQuery } = require('../schemas/release3.schema');
const { handleDbError } = require('../utils/db-error');
const extensions = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
router.use(authenticate);
const format = async (db, row) => {
  const { data, error } = await db.storage.from('laudos').createSignedUrls(row.fotografias.map((f) => f.path), 3600);
  if (error) throw error;
  return { ...row, fotografias: row.fotografias.map((f, i) => ({ ...f, url: data?.[i]?.signedUrl || null })) };
};
router.get('/', validate(laudosQuery, 'query'), async (req, res) => {
  const q = req.query;
  let query = req.db.from('vw_laudos').select('*').order('id', { ascending: false });
  if (q.peca) query = query.ilike('peca_nome', `%${q.peca}%`);
  if (q.perito) query = query.ilike('perito_nome', `%${q.perito}%`);
  if (q.pecaId) query = query.eq('peca_id', q.pecaId);
  if (q.inicio) query = query.gte('emitido_em', q.inicio);
  if (q.fim) query = query.lte('emitido_em', q.fim);
  if (q.vinculados === 'true') query = query.not('passaporte_id', 'is', null);
  if (q.vinculados === 'false') query = query.is('passaporte_id', null);
  const { data, error } = await query;
  if (error) return handleDbError(res, error, 'Erro ao consultar laudos');
  try { res.json(await Promise.all(data.map((row) => format(req.db, row)))); }
  catch (err) { handleDbError(res, err, 'Erro ao consultar fotografias'); }
});
router.get('/pecas', authorize('Perito'), async (req, res) => {
  const { data, error } = await req.db.from('vw_pecas').select('id,nome,passaporte_id').order('nome');
  if (error) return handleDbError(res, error, 'Erro ao consultar peças');
  res.json(data);
});
const save = async (req, res) => {
  const b = req.body;
  let previous = null;
  if (req.params.id) {
    const result = await req.db.from('vw_laudos').select('*').eq('id', req.params.id).maybeSingle();
    if (result.error) return handleDbError(res, result.error, 'Erro ao consultar laudo');
    previous = result.data;
    if (!previous) return res.status(404).json({ message: 'Laudo não encontrado' });
    if (previous.perito_id !== req.user.id) return res.status(403).json({ message: 'Somente o perito responsável pode corrigir o laudo' });
    if (previous.passaporte_id) return res.status(409).json({ message: 'Laudo vinculado ao passaporte não pode ser editado' });
  }
  const kept = (previous?.fotografias || []).filter((f) => !b.fotografiasMantidas || b.fotografiasMantidas.includes(f.path));
  if (kept.length + (req.files || []).length < 1 || kept.length + (req.files || []).length > 10) {
    return res.status(400).json({ message: 'Anexe de 1 a 10 fotografias da perícia' });
  }
  const added = [];
  try {
    for (const file of req.files || []) {
      const path = `${req.user.id}/${crypto.randomUUID()}.${extensions[file.mimetype]}`;
      const { error } = await req.db.storage.from('laudos').upload(path, file.buffer, { contentType: file.mimetype });
      if (error) throw error;
      added.push({ path, hash: crypto.createHash('sha256').update(file.buffer).digest('hex') });
    }
    const { data: id, error } = await req.db.rpc('salvar_laudo', {
      p_id: previous?.id || null, p_peca: b.pecaId, p_parecer: b.parecer,
      p_valor: b.valorAvaliacao, p_data: b.emitidoEm, p_fotos: [...kept, ...added]
    });
    if (error) throw error;
    const removed = (previous?.fotografias || []).filter((f) => !kept.includes(f));
    if (removed.length) await req.db.storage.from('laudos').remove(removed.map((f) => f.path));
    res.status(previous ? 200 : 201).json({ id });
  } catch (err) {
    if (added.length) await req.db.storage.from('laudos').remove(added.map((f) => f.path));
    handleDbError(res, err, 'Erro ao salvar laudo');
  }
};
router.post('/', authorize('Perito'), uploadFotografias, validate(laudoSchema), save);
router.put('/:id', authorize('Perito'), validate(idParams, 'params'), uploadFotografias, validate(laudoSchema), save);
router.post('/:id/vincular', authorize('Perito'), validate(idParams, 'params'), async (req, res) => {
  const { data, error } = await req.db.rpc('vincular_laudo', { p_id: Number(req.params.id) });
  if (error) return handleDbError(res, error, 'Erro ao vincular laudo');
  res.json({ passaporteId: data });
});
router.post('/:id/consulta', validate(idParams, 'params'), async (req, res) => {
  const { error } = await req.db.rpc('registrar_consulta_laudo', { p_id: Number(req.params.id) });
  if (error) return handleDbError(res, error, 'Erro ao registrar abertura do laudo');
  res.sendStatus(204);
});
router.delete('/:id', authorize('Perito', 'Administrador'), validate(idParams, 'params'), async (req, res) => {
  const previous = await req.db.from('vw_laudos').select('fotografias').eq('id', req.params.id).maybeSingle();
  const { error } = await req.db.rpc('remover_laudo', { p_id: Number(req.params.id) });
  if (error) return handleDbError(res, error, 'Erro ao remover laudo');
  if (previous.data?.fotografias.length) await req.db.storage.from('laudos').remove(previous.data.fotografias.map((f) => f.path));
  res.sendStatus(204);
});
module.exports = router;

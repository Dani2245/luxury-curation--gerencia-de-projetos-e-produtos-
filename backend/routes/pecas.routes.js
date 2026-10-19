const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const validate = require('../middlewares/validate');
const { createPecaSchema } = require('../schemas/peca.schema');

// Helper para normalizar colunas snake_case do Postgres para camelCase esperado pelo React
const formatPeca = (item) => ({
  ...item,
  passportId: item.passportId || item.passport_id || 'Pendente',
  expertName: item.expertName || item.expert_name || 'Pendente',
  expertDate: item.expertDate || item.expert_date || 'Pendente'
});

// GET /api/pecas - Listar todas as peças
router.get('/', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ message: 'Supabase não está configurado no .env' });
    }

    const { data, error } = await supabase
      .from('pecas')
      .select('*')
      .order('id', { ascending: false });

    if (error) {
      console.error('[Supabase GET /pecas Error]:', error.message);
      return res.status(500).json({ message: 'Erro ao consultar peças', error: error.message });
    }

    res.json(data.map(formatPeca));
  } catch (err) {
    console.error('Erro inesperado ao listar peças:', err);
    res.status(500).json({ message: 'Erro interno ao consultar peças' });
  }
});

// GET /api/pecas/:id - Buscar peça específica
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    if (!supabase) {
      return res.status(500).json({ message: 'Supabase não está configurado no .env' });
    }

    const { data, error } = await supabase
      .from('pecas')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('[Supabase GET /pecas/:id Error]:', error.message);
      return res.status(500).json({ message: 'Erro ao buscar peça', error: error.message });
    }

    if (!data) {
      return res.status(404).json({ message: 'Peça não encontrada' });
    }

    res.json(formatPeca(data));
  } catch (err) {
    console.error('Erro inesperado ao buscar peça:', err);
    res.status(500).json({ message: 'Erro interno ao buscar peça' });
  }
});

// POST /api/pecas - Cadastrar nova peça com validação Zod
router.post('/', validate(createPecaSchema), async (req, res) => {
  const { name, category, price, description, image } = req.body;

  if (!supabase) {
    return res.status(500).json({ message: 'Supabase não está configurado no .env' });
  }

  const generatedPassportId = `LST-2026-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

  const novaPecaPayload = {
    name,
    category,
    price,
    description: description || '',
    image: image || 'https://images.unsplash.com/photo-1541961017774-22349e4a1262?q=80&w=1000&auto=format&fit=crop',
    status: 'em revisão',
    passport_id: generatedPassportId,
    expert_name: 'Pendente',
    expert_date: 'Pendente'
  };

  try {
    const { data, error } = await supabase
      .from('pecas')
      .insert([novaPecaPayload])
      .select()
      .single();

    if (error) {
      console.error('[Supabase POST /pecas Error]:', error.message);
      return res.status(400).json({ message: 'Erro ao cadastrar peça no banco', error: error.message });
    }

    res.status(201).json(formatPeca(data));
  } catch (err) {
    console.error('Erro inesperado ao criar peça:', err);
    res.status(500).json({ message: 'Erro interno ao salvar peça' });
  }
});

module.exports = router;

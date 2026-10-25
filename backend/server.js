const express = require('express');
const cors = require('cors');
require('dotenv').config();

const pecasRoutes = require('./routes/pecas.routes');
const authRoutes = require('./routes/auth.routes');
const usuariosRoutes = require('./routes/usuarios.routes');

const app = express();

// Middlewares Globais
app.use(cors({ origin: (process.env.FRONTEND_URL || 'http://localhost:5173').split(',') }));
app.use(express.json({ limit: '1mb' }));

// Rota de Healthcheck / Status
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Rotas da Aplicação
app.use('/api/pecas', pecasRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api', authRoutes);

// Middleware para tratamento de 404
app.use((req, res) => {
  res.status(404).json({ message: `Rota ${req.method} ${req.url} não encontrada` });
});

// Middleware Global de Tratamento de Erros
app.use((err, req, res, next) => {
  if (err.name === 'MulterError') {
    const message = err.code === 'LIMIT_FILE_SIZE'
      ? 'Cada fotografia deve ter no máximo 5 MB'
      : err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE'
        ? 'Envie no máximo 10 fotografias'
        : 'Erro no envio das fotografias';
    return res.status(400).json({ message });
  }
  if (err.status === 400) {
    return res.status(400).json({ message: err.message });
  }
  console.error('Unhandled Server Error:', err);
  res.status(500).json({ message: 'Erro interno do servidor' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n========================================`);
  console.log(`Lastro Backend rodando na porta ${PORT}`);
  console.log(`URL Base: http://localhost:${PORT}/api`);
  console.log(`========================================\n`);
});

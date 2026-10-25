const multer = require('multer');

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

// Campo do formulário -> tipo do documento no passaporte (Tabela 2 e RFS07)
const CAMPOS = {
  certificados: 'certificado',
  laudos: 'laudo',
  notasFiscais: 'nota fiscal',
  fotografias: 'fotografia',
  restauracoes: 'restauracao'
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: 25 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_TYPES.includes(file.mimetype)) {
      const err = new Error('Os documentos devem estar em formato PDF, JPG, PNG ou WebP');
      err.status = 400;
      return cb(err);
    }
    cb(null, true);
  }
});

// Aceita até 5 arquivos por campo (10 fotografias), de no máximo 10 MB cada
const uploadDocumentos = upload.fields(
  Object.keys(CAMPOS).map((name) => ({ name, maxCount: name === 'fotografias' ? 10 : 5 }))
);

module.exports = { uploadDocumentos, CAMPOS, MAX_FILE_SIZE };

const multer = require('multer');

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_FILES = 10;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_TYPES.includes(file.mimetype)) {
      const err = new Error('As fotografias devem estar em formato JPG, PNG ou WebP');
      err.status = 400;
      return cb(err);
    }
    cb(null, true);
  }
});

// Aceita até 10 fotografias (campo "fotografias") de no máximo 5 MB cada
const uploadFotografias = upload.array('fotografias', MAX_FILES);

module.exports = { uploadFotografias, MAX_FILE_SIZE, MAX_FILES };

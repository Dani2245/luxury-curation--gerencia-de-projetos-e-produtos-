const { ZodError } = require('zod');

/**
 * Middleware para validação de dados de requisição usando esquemas Zod
 * @param {import('zod').ZodTypeAny} schema 
 * @param {'body' | 'query' | 'params'} source
 */
const validate = (schema, source = 'body') => {
  return async (req, res, next) => {
    try {
      const validatedData = await schema.parseAsync(req[source]);
      req[source] = validatedData;
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const issues = err.issues || err.errors || [];
        return res.status(400).json({
          message: 'Erro de validação',
          errors: issues.map((issue) => ({
            field: issue.path.join('.') || source,
            message: issue.message
          }))
        });
      }
      return res.status(500).json({ message: 'Erro interno durante a validação' });
    }
  };
};

module.exports = validate;

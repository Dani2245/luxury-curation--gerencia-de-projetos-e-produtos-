// O padrão de arquivos fica no script test:e2e, para que `npx mocha tests/e2e/<arquivo>.test.js`
// rode apenas a suíte informada (útil para demonstrar um requisito por vez)
module.exports = {
  timeout: 40000,
  slow: 8000
};

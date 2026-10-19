// Ponto de entrada: só inicia o servidor HTTP. A configuração fica em app.js.

const app = require('./app');
const env = require('./config/env');

app.listen(env.port, () => {
  console.log(`InventoryManager rodando em http://localhost:${env.port}`);
});

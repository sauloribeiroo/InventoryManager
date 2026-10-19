// Agrega todas as rotas da API. Cada recurso ganha seu próprio arquivo *Routes.js.

const { Router } = require('express');

const router = Router();

// Rota pública para checar se a API está no ar (usada também pelo Render)
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

module.exports = router;

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const RAIZ = path.join(__dirname, '..', '..');
const realFetch = globalThis.fetch;

const SENHAS = { admin: 'Admin#Teste1', tecnico: 'Tech#Teste1' };

function prepararAmbiente(extra = {}) {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'inventory-test-'));
  Object.assign(process.env, {
    NODE_ENV: 'production',
    SESSION_SECRET: crypto.randomBytes(32).toString('hex'),
    TOTP_ENCRYPTION_KEY: crypto.randomBytes(32).toString('hex'),
    DATABASE_PATH: path.join(pasta, 'teste.db'),
    SEED_ADMIN_PASSWORD: SENHAS.admin,
    SEED_TECH_PASSWORD: SENHAS.tecnico,
    TZ: 'America/Sao_Paulo',
    ...extra,
  });

  const seed = spawnSync(process.execPath, [path.join(RAIZ, 'src', 'seed.js')], {
    cwd: RAIZ,
    env: process.env,
    encoding: 'utf8',
  });
  if (seed.status !== 0) throw new Error(`Seed falhou: ${seed.stderr}`);
}

function json(corpo, status = 200) {
  return new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });
}

function proximoDiaUtil(data, quantos = 1) {
  const dia = new Date(data);
  let restantes = quantos;
  while (restantes > 0) {
    dia.setDate(dia.getDate() + 1);
    if (dia.getDay() !== 0 && dia.getDay() !== 6) restantes -= 1;
  }
  return dia;
}

function dataISO(data) {
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${data.getFullYear()}-${mes}-${dia}`;
}

function instalarApisFalsas({ cotacao = 5, feriados = () => [] } = {}) {
  const estado = { cotacaoFora: false, feriadosFora: false, chamadas: { cotacao: [], feriados: [] } };

  globalThis.fetch = async (url, opcoes) => {
    const endereco = String(url);

    if (endereco.includes('awesomeapi.com.br')) {
      estado.chamadas.cotacao.push(endereco);
      if (estado.cotacaoFora) throw new Error('AwesomeAPI fora do ar (simulado)');
      return json({ USDBRL: { bid: String(cotacao), create_date: '2026-10-27 10:00:00' } });
    }

    if (endereco.includes('brasilapi.com.br')) {
      estado.chamadas.feriados.push(endereco);
      if (estado.feriadosFora) return json({ message: 'erro' }, 503);
      const ano = Number(endereco.split('/').pop());
      return json(feriados(ano));
    }

    return realFetch(url, opcoes);
  };

  return estado;
}

function restaurarFetch() {
  globalThis.fetch = realFetch;
}

let proximoIp = 1;

function criarCliente(base) {
  const ip = `10.1.${Math.floor(proximoIp / 250)}.${(proximoIp % 250) + 1}`;
  proximoIp += 1;
  let cookie = '';

  async function chamar(metodo, caminho, corpo, cabecalhos = {}) {
    const resposta = await realFetch(base + caminho, {
      method: metodo,
      headers: {
        'X-Forwarded-For': ip,
        'X-Forwarded-Proto': 'https',
        ...(corpo !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(cookie ? { cookie } : {}),
        ...cabecalhos,
      },
      body: corpo === undefined ? undefined : typeof corpo === 'string' ? corpo : JSON.stringify(corpo),
    });

    const cookiesRecebidos = resposta.headers.getSetCookie();
    if (cookiesRecebidos.length) cookie = cookiesRecebidos[0].split(';')[0];

    const texto = await resposta.text();
    let corpoJson = null;
    try {
      corpoJson = JSON.parse(texto);
    } catch {
      corpoJson = null;
    }

    return { status: resposta.status, corpo: corpoJson, texto, cabecalhos: resposta.headers, cookiesRecebidos };
  }

  return {
    ip,
    chamar,
    get cookie() {
      return cookie;
    },
    limparCookie() {
      cookie = '';
    },
    usarCookie(valor) {
      cookie = valor;
    },
  };
}

async function iniciarServidor() {
  const app = require('../../src/app');
  const servidor = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const base = `http://127.0.0.1:${servidor.address().port}`;
  return {
    base,
    cliente: () => criarCliente(base),
    fechar: () => new Promise((resolve) => servidor.close(resolve)),
  };
}

async function codigoTotp(segredo, passos = 0) {
  const { generate } = require('otplib');
  return generate({ secret: segredo, epoch: Math.floor(Date.now() / 1000) + passos * 30 });
}

async function ativarDoisFatores(cliente, email, senha) {
  const login = await cliente.chamar('POST', '/auth/login', { email, password: senha });
  if (login.status !== 200) throw new Error(`login falhou: ${login.status} ${login.texto}`);
  const setup = await cliente.chamar('GET', '/auth/2fa/setup');
  const segredo = setup.corpo.manualKey;
  const enable = await cliente.chamar('POST', '/auth/2fa/enable', { code: await codigoTotp(segredo) });
  if (enable.status !== 200) throw new Error(`enable falhou: ${enable.status} ${enable.texto}`);
  return { segredo, usuario: enable.corpo.user };
}

module.exports = {
  RAIZ,
  SENHAS,
  prepararAmbiente,
  instalarApisFalsas,
  restaurarFetch,
  iniciarServidor,
  criarCliente,
  codigoTotp,
  ativarDoisFatores,
  proximoDiaUtil,
  dataISO,
};

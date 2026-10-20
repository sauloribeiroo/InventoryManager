// GET em APIs externas com timeout: se a API demorar, desistimos em vez de travar a nossa resposta.

const DEFAULT_TIMEOUT_MS = 5000;

async function fetchJson(url, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ao consultar ${url}`);
  }
  return response.json();
}

module.exports = { fetchJson };

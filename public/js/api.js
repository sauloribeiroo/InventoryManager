// Helpers compartilhados pelas páginas.
// O cookie de sessão (httpOnly) é enviado automaticamente pelo navegador em cada fetch:
// o JavaScript não lê nem guarda nenhum token.

const LOGIN_REASONS = {
  MFA_EXPIRED: 'Sua verificação em duas etapas expirou. Faça login novamente.',
  UNAUTHENTICATED: 'Faça login para continuar.',
  MFA_REQUIRED: 'Faça login e informe o código do autenticador.',
};

// Chama a API e lança um erro com status/code/message quando a resposta não é 2xx
async function api(method, path, body) {
  const response = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });

  if (response.status === 204) return null;
  const data = await response.json();

  if (!response.ok) {
    const error = new Error(data.error?.message || 'Erro inesperado.');
    error.status = response.status;
    error.code = data.error?.code;
    throw error;
  }
  return data;
}

// Para páginas logadas: 401 (sessão expirada, sem 2FA...) manda de volta para o login
async function protectedApi(method, path, body) {
  try {
    return await api(method, path, body);
  } catch (error) {
    if (error.status === 401) goToLogin(error.code);
    throw error;
  }
}

function goToLogin(reason) {
  window.location.href = reason ? `/?reason=${reason}` : '/';
}

function goToHome(role) {
  window.location.href = role === 'admin' ? '/admin.html' : '/inventory.html';
}

// Garante que há sessão autenticada com o papel esperado; senão redireciona
async function requireSession(expectedRole) {
  try {
    const session = await api('GET', '/auth/me');
    if (session.user.role !== expectedRole) {
      goToHome(session.user.role);
      return null;
    }
    return session;
  } catch (error) {
    goToLogin(error.code);
    return null;
  }
}

// Preenche o cabeçalho com o usuário, o horário de expiração do 2FA e o botão de sair
function setupHeader(session) {
  document.getElementById('user-name').textContent = session.user.name;
  const expiresAt = new Date(session.mfa_expires_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  document.getElementById('mfa-expires').textContent = `2FA válido até ${expiresAt}`;
  document.getElementById('logout').addEventListener('click', async () => {
    await api('POST', '/auth/logout');
    goToLogin();
  });
}

function showMessage(element, text, type = 'error') {
  element.className = `message ${type}`;
  element.textContent = text;
}

// Cria um elemento HTML. Usa textContent (nunca innerHTML) para não executar HTML vindo dos dados (XSS).
function el(tag, attributes = {}, ...children) {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) {
    if (key.startsWith('on')) element.addEventListener(key.slice(2), value);
    else element.setAttribute(key, value);
  }
  for (const child of children) {
    element.append(child instanceof Node ? child : document.createTextNode(child ?? ''));
  }
  return element;
}

function formatDate(isoDate) {
  if (!isoDate) return '-';
  const [year, month, day] = isoDate.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}

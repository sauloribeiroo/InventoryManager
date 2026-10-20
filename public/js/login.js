// Etapa 1: e-mail + senha. A API diz qual é o próximo passo (configurar ou verificar o 2FA).

const form = document.getElementById('login-form');
const message = document.getElementById('message');

// Motivo do redirecionamento (ex.: ?reason=MFA_EXPIRED)
const reason = new URLSearchParams(window.location.search).get('reason');
if (LOGIN_REASONS[reason]) showMessage(message, LOGIN_REASONS[reason], 'info');

// Já está logado? Vai direto para a tela do seu papel
api('GET', '/auth/me')
  .then((session) => goToHome(session.user.role))
  .catch(() => {});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const result = await api('POST', '/auth/login', {
      email: document.getElementById('email').value,
      password: document.getElementById('password').value,
    });
    window.location.href = result.next === 'SETUP_2FA' ? '/setup-2fa.html' : '/verify-2fa.html';
  } catch (error) {
    showMessage(message, error.message);
  }
});

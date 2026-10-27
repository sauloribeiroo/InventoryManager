const form = document.getElementById('login-form');
const message = document.getElementById('message');

const reason = new URLSearchParams(window.location.search).get('reason');
if (LOGIN_REASONS[reason]) showMessage(message, LOGIN_REASONS[reason], 'info');

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

// Etapa 2b (acessos seguintes): envia o código atual do app.

const message = document.getElementById('message');
const codeInput = document.getElementById('code');

document.getElementById('verify-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const result = await api('POST', '/auth/2fa/verify', { code: codeInput.value });
    goToHome(result.user.role);
  } catch (error) {
    codeInput.value = '';
    showMessage(message, error.message);

    if (error.code === 'UNAUTHENTICATED') goToLogin(error.code); // não passou pela senha
    if (error.code === 'TOTP_NOT_CONFIGURED') window.location.href = '/setup-2fa.html';
    if (error.code === 'ACCOUNT_LOCKED') setTimeout(() => goToLogin(), 3000);
  }
});

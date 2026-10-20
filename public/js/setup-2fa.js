// Etapa 2a (primeiro acesso): mostra o QR Code e confirma o primeiro código do app.

const message = document.getElementById('message');

async function loadQrCode() {
  try {
    const setup = await api('GET', '/auth/2fa/setup');
    document.getElementById('qr').src = setup.qrCode;
    document.getElementById('manual-key').textContent = setup.manualKey;
  } catch (error) {
    if (error.code === 'TOTP_ALREADY_ENABLED') window.location.href = '/verify-2fa.html';
    else goToLogin(error.code); // sessão sem senha validada → volta ao login
  }
}

document.getElementById('enable-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const result = await api('POST', '/auth/2fa/enable', { code: document.getElementById('code').value });
    goToHome(result.user.role);
  } catch (error) {
    showMessage(message, error.message);
    if (error.code === 'ACCOUNT_LOCKED') setTimeout(() => goToLogin(), 3000);
  }
});

loadQrCode();

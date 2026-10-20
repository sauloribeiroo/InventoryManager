// Tela do admin: gerencia as contas que têm acesso ao sistema.

const ROLE_LABELS = { admin: 'Administrador', technician: 'Técnico' };
const listMessage = document.getElementById('list-message');
const createMessage = document.getElementById('create-message');
let currentUserId = null;

async function loadUsers() {
  const users = await protectedApi('GET', '/api/users');
  const tbody = document.getElementById('users');
  tbody.replaceChildren(...users.map(renderRow));
}

function renderRow(user) {
  const isSelf = user.id === currentUserId;
  const actions = el('td');

  if (!isSelf) {
    actions.append(
      el('button', { class: 'small secondary', onclick: () => runAction(() => toggleActive(user)) }, user.active ? 'Desativar' : 'Ativar'),
      el('button', { class: 'small secondary', onclick: () => runAction(() => resetTotp(user)) }, 'Resetar 2FA'),
      el('button', { class: 'small danger', onclick: () => runAction(() => removeUser(user)) }, 'Excluir')
    );
  } else {
    actions.append(el('span', { class: 'muted' }, 'Você'));
  }

  return el(
    'tr',
    {},
    el('td', {}, user.name),
    el('td', {}, user.email),
    el('td', {}, ROLE_LABELS[user.role]),
    el('td', {}, el('span', { class: `badge ${user.active ? 'ok' : 'bad'}` }, user.active ? 'Ativa' : 'Desativada')),
    el('td', {}, el('span', { class: `badge ${user.totp_enabled ? 'ok' : 'warn'}` }, user.totp_enabled ? 'Configurado' : 'Pendente')),
    actions
  );
}

async function toggleActive(user) {
  await protectedApi('PUT', `/api/users/${user.id}`, { active: !user.active });
  return `Conta de ${user.name} ${user.active ? 'desativada' : 'ativada'}.`;
}

async function resetTotp(user) {
  if (!confirm(`Resetar o 2FA de ${user.name}? No próximo login será exigido um novo QR Code.`)) return null;
  const result = await protectedApi('POST', `/api/users/${user.id}/reset-2fa`);
  return result.message;
}

async function removeUser(user) {
  if (!confirm(`Excluir a conta de ${user.name}?`)) return null;
  await protectedApi('DELETE', `/api/users/${user.id}`);
  return `Conta de ${user.name} excluída.`;
}

// Executa uma ação da tabela, mostra o resultado e recarrega a lista
async function runAction(action) {
  try {
    const text = await action();
    if (text) showMessage(listMessage, text, 'success');
    await loadUsers();
  } catch (error) {
    showMessage(listMessage, error.message);
  }
}

document.getElementById('create-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const user = await protectedApi('POST', '/api/users', {
      name: document.getElementById('name').value,
      email: document.getElementById('email').value,
      password: document.getElementById('password').value,
      role: document.getElementById('role').value,
    });
    event.target.reset();
    showMessage(createMessage, `Usuário ${user.name} criado. O 2FA será configurado no primeiro login.`, 'success');
    await loadUsers();
  } catch (error) {
    showMessage(createMessage, error.message);
  }
});

(async () => {
  const session = await requireSession('admin');
  if (!session) return;
  currentUserId = session.user.id;
  setupHeader(session);
  await loadUsers();
})();

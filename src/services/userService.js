// Regras de negócio de usuários.

// Monta a versão "pública" do usuário: password_hash, segredo TOTP e controles internos
// NUNCA saem da API.
function toPublicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    totp_enabled: Boolean(user.totp_enabled),
    active: Boolean(user.active),
    created_at: user.created_at,
  };
}

module.exports = { toPublicUser };

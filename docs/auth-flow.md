# Fluxo de Autenticação — 2FA com TOTP

Diagramas do fluxo de autenticação do InventoryManager (renderizados pelo GitHub via Mermaid).

## 1. Estágios da sessão

A sessão fica no servidor; o navegador só guarda um cookie `httpOnly` com o ID dela.

```mermaid
stateDiagram-v2
    [*] --> SemSessao
    SemSessao --> PASSWORD_OK: POST /auth/login (senha correta)
    PASSWORD_OK --> AUTHENTICATED: POST /auth/2fa/enable (1º acesso)\nou POST /auth/2fa/verify
    PASSWORD_OK --> PASSWORD_OK: código errado (até 4x)
    PASSWORD_OK --> Bloqueada: 5º código errado (423)
    Bloqueada --> SemSessao: após 15 minutos
    AUTHENTICATED --> SemSessao: POST /auth/logout
    AUTHENTICATED --> SemSessao: MFA_TTL_MINUTES expirou (401 MFA_EXPIRED)
    AUTHENTICATED --> SemSessao: conta desativada pelo admin
```

| Estágio | O que o usuário pode acessar |
|---|---|
| sem sessão | `/auth/login`, `/health`, arquivos do front |
| `PASSWORD_OK` | só `/auth/2fa/setup`, `/auth/2fa/enable`, `/auth/2fa/verify` |
| `AUTHENTICATED` | `/auth/me` e as rotas `/api/*` do seu papel |

## 2. Sequência completa

```mermaid
sequenceDiagram
    autonumber
    actor U as Usuário
    participant App as App autenticador
    participant API as InventoryManager API
    participant DB as SQLite

    U->>API: POST /auth/login {email, password}
    API->>DB: findByEmail
    API->>API: bcrypt.compare + conta ativa? + não bloqueada?
    API->>API: session.regenerate() → stage = PASSWORD_OK
    API-->>U: 200 {next: SETUP_2FA | VERIFY_2FA} + Set-Cookie: sid

    alt Primeiro acesso
        U->>API: GET /auth/2fa/setup
        API->>API: gera segredo base32 → session.tempTotpSecret
        API-->>U: QR Code (otpauth://...) + chave manual
        U->>App: escaneia o QR
        App-->>U: código de 6 dígitos
        U->>API: POST /auth/2fa/enable {code}
        API->>API: valida o código com o segredo temporário
        API->>DB: salva encrypt(segredo) + last_totp_step, totp_enabled = 1
    else Acessos seguintes
        App-->>U: código de 6 dígitos
        U->>API: POST /auth/2fa/verify {code}
        API->>DB: lê totp_secret_enc
        API->>API: decrypt → valida (±30 s) → passo > last_totp_step?
        API->>DB: atualiza last_totp_step, zera failed_attempts
    end

    API->>API: session.regenerate() → stage = AUTHENTICATED, mfaVerifiedAt = agora
    API-->>U: 200 {user}

    U->>API: GET /api/equipment (cookie sid)
    API->>API: requireAuth → requireRole('technician')
    API-->>U: 200 dados
```

## 3. O que acontece em cada rota protegida

```mermaid
flowchart TD
    A[Requisição com cookie sid] --> B{stage = PASSWORD_OK?}
    B -- sim --> E1[401 MFA_REQUIRED]
    B -- não --> C{stage = AUTHENTICATED?}
    C -- não --> E2[401 UNAUTHENTICATED]
    C -- sim --> D{agora - mfaVerifiedAt > MFA_TTL?}
    D -- sim --> E3[destrói a sessão → 401 MFA_EXPIRED]
    D -- não --> F{usuário existe e está ativo?}
    F -- não --> E4[destrói a sessão → 401 UNAUTHENTICATED]
    F -- sim --> G{papel permitido na rota?}
    G -- não --> E5[403 FORBIDDEN]
    G -- sim --> H[controller → service → repository]
```

Código: [`requireAuth`](../src/middlewares/authMiddleware.js) e [`requireRole`](../src/middlewares/roleMiddleware.js).

## 4. Validação de um código TOTP

```mermaid
flowchart TD
    A[código de 6 dígitos] --> B{conta bloqueada?}
    B -- sim --> L1[423 ACCOUNT_LOCKED]
    B -- não --> C["decrypt(totp_secret_enc)"]
    C --> D["HMAC-SHA1(segredo, passo) para os passos atual, anterior e seguinte"]
    D --> E{algum bate e passo > last_totp_step?}
    E -- não --> F{5ª falha seguida?}
    F -- sim --> L2[bloqueia 15 min → 423]
    F -- não --> L3[failed_attempts + 1 → 401 INVALID_TOTP_CODE]
    E -- sim --> G[salva last_totp_step, zera failed_attempts]
    G --> H[sessão AUTHENTICATED]
```

Código: [`totpService.verifyCode`](../src/services/totpService.js) e [`authService.verifyTotpLogin`](../src/services/authService.js).

## 5. Camadas de proteção

| Camada | Onde | Contra o quê |
|---|---|---|
| Rate limit por IP (10 req / 15 min no login, 10 / 5 min no 2FA) | `rateLimitMiddleware.js` | força bruta a partir de um IP |
| Bloqueio da conta (5 códigos errados → 15 min) | `authService.registerInvalidCode` | força bruta distribuída em vários IPs |
| Anti-replay (`last_totp_step`) | `totpService.verifyCode` | reuso de um código visto/interceptado |
| Segredo cifrado (AES-256-GCM) | `utils/crypto.js` | vazamento do banco |
| Senha com bcrypt | `utils/password.js` | vazamento do banco |
| `session.regenerate()` no login e no 2FA | `authService` | session fixation |
| Expiração do 2FA (`MFA_TTL_MINUTES`) | `requireAuth` | sessão/cookie roubado usado por muito tempo |
| Cookie `httpOnly`, `sameSite=lax`, `secure` em produção | `config/session.js` | roubo do cookie via XSS, CSRF |
| CSP + `textContent` no front | `app.js` (helmet), `public/js/api.js` | XSS |

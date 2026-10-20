# Plano do Projeto — InventoryManager

> Documento de planejamento da equipe. Guarda as decisões tomadas antes da implementação para servir de referência durante o desenvolvimento e na preparação da apresentação.

## Contexto
Projeto AV2 de Técnicas de Integração: **API REST** com autenticação diferente de Basic/Bearer/OAuth2/API Key + integração com API externa + deploy + README completo.

A equipe escolheu **2FA TOTP via app autenticador** (Google Authenticator, Authy, Microsoft Authenticator). O sistema gerencia empréstimos de equipamentos caros de TI e só é acessado por técnicos e administradores. A prioridade é que a autenticação seja fácil de **ler, explicar e defender em perguntas**. Por isso a stack é mínima, a organização é **por camadas** e **todo o código fica em inglês** (pastas, arquivos, tabelas, campos, rotas). O README e as mensagens exibidas ao usuário ficam em português.

## Ordem de trabalho
1. Plano (este arquivo) + README completo.
2. Implementação em etapas: primeiro o **núcleo** funcionando (login → QR → código → rota protegida → expiração do MFA), depois cada **extra de segurança** isolado e comentado (criptografia AES do segredo, anti-replay, bloqueio + rate limit). O sistema funciona ao fim de qualquer etapa.
3. Recursos de negócio, integração externa, front, deploy.

## Stack
| Camada | Escolha | Por quê |
|---|---|---|
| Runtime/API | **Node.js + Express** (REST) | Pouco código, rotas fáceis de ler, middleware deixa a checagem de auth explícita |
| Banco | **SQLite** via `node:sqlite` (já vem no Node ≥22.13, sem dependência nativa) | Um arquivo só, sem servidor; o seed roda ao iniciar |
| Senhas | `bcryptjs` | Hash com salt, JS puro |
| TOTP | `otplib` | Gera o segredo e valida o código (RFC 6238, janela de 30s) |
| QR Code | `qrcode` | Gera o QR `otpauth://` que o app lê |
| Sessão | `express-session` (cookie httpOnly, sameSite) | Sessão no servidor com **estágios** (senha OK → 2FA OK). Não usa Bearer/JWT, para não misturar com técnicas proibidas |
| Proteção | `express-rate-limit`, `helmet` | Rate limiting no login/2FA, headers seguros |
| Front | HTML + CSS + JS puro em `public/` (fetch), mínimo e só funcional | O front não é o foco. O mesmo Express serve o front, então o cookie de sessão funciona sem CORS |
| Deploy | **Render** (web service gratuito) | Deploy a partir do GitHub, variáveis de ambiente pelo painel |

## Estrutura de pastas
Fluxo de uma requisição: **routes** → **middlewares** (auth, role, validação) → **controllers** → **services** → **repositories** → banco (tabelas definidas em **models**).

```
src/
├── config/                  # Variáveis de ambiente e configs (banco, sessão)
│   ├── env.js
│   ├── database.js          # conexão SQLite (node:sqlite) + criação das tabelas
│   └── session.js           # express-session (cookie httpOnly/secure/sameSite)
├── controllers/             # Recebem a requisição HTTP e enviam a resposta
│   ├── authController.js    # login, logout, me, 2fa setup/enable/verify
│   ├── userController.js
│   ├── equipmentController.js
│   └── loanController.js
├── middlewares/             # Interceptadores
│   ├── authMiddleware.js    # requireAuth (estágio + expiração do MFA), requirePendingMfa
│   ├── roleMiddleware.js    # requireRole('admin' | 'technician')
│   ├── rateLimitMiddleware.js
│   ├── validateMiddleware.js # valida req.body (ex.: email válido, código TOTP com 6 dígitos) → 400
│   └── errorMiddleware.js   # erro → JSON com status (400/401/403/404/423/429/500)
├── models/                  # Definição das tabelas
│   ├── User.js
│   ├── Equipment.js
│   └── Loan.js
├── repositories/            # Queries SQL
│   ├── userRepository.js
│   ├── equipmentRepository.js
│   └── loanRepository.js
├── routes/                  # Endpoints → controllers
│   ├── index.js             # agrega todas as rotas
│   ├── authRoutes.js
│   ├── userRoutes.js
│   ├── equipmentRoutes.js
│   └── loanRoutes.js
├── services/                # Regras de negócio
│   ├── authService.js       # senha (bcrypt), bloqueio por tentativas, estágios da sessão
│   ├── totpService.js       # núcleo: gera segredo, QR, valida código, anti-replay
│   ├── userService.js       # inclui toPublicUser(): remove password_hash e segredo TOTP das respostas
│   ├── equipmentService.js  # combina dados locais + cotação externa
│   ├── loanService.js       # calcula devolução usando feriados externos
│   ├── exchangeRateService.js  # API externa 1: AwesomeAPI (USD→BRL)
│   └── holidayService.js    # API externa 2: BrasilAPI (feriados nacionais)
├── utils/                   # Helpers reutilizáveis
│   ├── AppError.js          # erro com statusCode + code (ex.: MFA_EXPIRED)
│   ├── crypto.js            # AES-256-GCM para cifrar o segredo TOTP no banco
│   ├── password.js          # bcrypt hash/compare
│   └── formatDate.js
├── seed.js                  # dados iniciais
├── app.js                   # configuração central do Express
└── server.js                # inicialização do servidor HTTP
```
Fora de `src/`: `public/` (front simples), `docs/` (este plano, `auth-flow.md`, `requests.http`), `.env.example`, `package.json` e `README.md`.

## Fluxo de autenticação
```
[1] POST /auth/login {email, password}
     └─ bcrypt.compare OK? → session.pendingUserId = id ; session.stage = "PASSWORD_OK"
          ├─ usuário SEM 2FA ativo → { next: "SETUP_2FA" }
          └─ usuário COM 2FA ativo → { next: "VERIFY_2FA" }

[2a] Primeiro acesso (obrigatório)
     GET  /auth/2fa/setup          → gera segredo, guarda em session.tempTotpSecret,
                                     devolve QR Code (data URL) + chave manual
     POST /auth/2fa/enable {code}  → valida o código com tempTotpSecret
                                   → salva o segredo CIFRADO (AES-256-GCM), totp_enabled = 1
                                   → stage = "AUTHENTICATED", mfaVerifiedAt = agora

[2b] Acessos seguintes
     POST /auth/2fa/verify {code}  → valida com o segredo do usuário (janela ±1 passo)
                                   → rejeita reuso do mesmo código (last_totp_step)
                                   → stage = "AUTHENTICATED", mfaVerifiedAt = agora

[3] Rotas protegidas → authMiddleware.requireAuth:
     stage !== AUTHENTICATED          → 401
     agora - mfaVerifiedAt > MFA_TTL  → destrói a sessão → 401 { code: "MFA_EXPIRED" }
     roleMiddleware.requireRole(...)  → 403 se o papel não bate

[4] POST /auth/logout → session.destroy()
```
- **Reautenticação periódica**: `MFA_TTL_MINUTES` (padrão 30). Na demo, 1–2 min para mostrar a expiração ao vivo.
- **Bloqueio**: 5 códigos errados seguidos → conta bloqueada por 15 minutos (`failed_attempts`, `locked_until`) → 423.
- **Admin reseta o 2FA**: se o técnico perder o celular, o admin zera o segredo e no próximo login o técnico configura de novo.

## Papéis e permissões
- **admin**: só gerencia contas (criar, listar, editar, desativar/excluir, resetar 2FA). Não vê o estoque.
- **technician**: vê o estoque, registra empréstimo e devolução, vê o histórico.

## Recursos
- **users**: id, name, email, password_hash, role, totp_secret_enc, totp_enabled, last_totp_step, failed_attempts, locked_until, active, created_at
- **equipment**: id, asset_tag, type, brand, model, serial_number, value_usd, status (available/loaned/maintenance), location, created_at
- **loans**: id, equipment_id, technician_id, borrower_name, destination_department, checkout_date, expected_return_date, returned_at, notes, status

Seed: 1 admin + 3 technicians (todos sem 2FA, para forçar o setup no primeiro login), 5 equipamentos, 3 empréstimos.

## Endpoints
| Método | Rota | Acesso |
|---|---|---|
| POST | /auth/login | público (rate limit) |
| GET | /auth/2fa/setup | estágio PASSWORD_OK |
| POST | /auth/2fa/enable | estágio PASSWORD_OK |
| POST | /auth/2fa/verify | estágio PASSWORD_OK (rate limit) |
| POST | /auth/logout | autenticado |
| GET | /auth/me | autenticado |
| GET/POST/PUT/DELETE | /api/users[/:id] | admin |
| POST | /api/users/:id/reset-2fa | admin |
| GET | /api/equipment[/:id] | technician |
| GET/POST | /api/loans | technician |
| PATCH | /api/loans/:id/return | technician |

Erros padronizados `{ error: { code, message } }`: 400, 401, 403, 404, 409, 423, 429.

## Integração com API externa
1. **AwesomeAPI** `GET https://economia.awesomeapi.com.br/json/last/USD-BRL`: adiciona `value_brl` e `exchange_rate` em cada equipamento.
2. **BrasilAPI** `GET https://brasilapi.com.br/api/feriados/v1/{year}`: calcula `expected_return_date` pulando fins de semana e feriados nacionais e devolve `skipped_holidays`.
- `fetch` nativo com timeout + cache em memória como fallback, para a demo não quebrar se a API externa cair.

## Fluxo de Git
- **Uma branch por funcionalidade**, criada a partir da `main` atualizada.
- **Commits pequenos**: um por estrutura, função ou funcionalidade, com mensagem descritiva em português e prefixo do tipo (ex.: `feat: geração do segredo TOTP e QR Code no primeiro acesso`).
- Cada branch vira um **Pull Request**, que é revisado antes do merge.
- Todos os integrantes devem ter commits próprios, distribuídos ao longo do período.

Ordem prevista das branches:
`docs/plan-and-readme` → `feat/project-setup` → `feat/database` → `feat/password-login` → `feat/totp-setup` → `feat/totp-verify` → `feat/auth-middlewares` → `feat/totp-encryption` → `feat/anti-replay` → `feat/rate-limit-lockout` → `feat/users-crud` → `feat/equipment` → `feat/loans` → `feat/external-apis` → `feat/frontend` → `chore/deploy-render`

## Checklist de verificação
1. `npm install && npm run dev`, abrir `http://localhost:3000`.
2. Logar como technician do seed → obrigado a configurar o 2FA → escanear o QR → digitar o código → ver o estoque com `value_brl`.
3. Logout → login → só pede o código. Código errado 5x → 423. Reusar o mesmo código → rejeitado.
4. Com `MFA_TTL_MINUTES=1`: esperar → a próxima chamada dá 401 `MFA_EXPIRED`.
5. Technician chamando `/api/users` → 403; sem sessão → 401; admin chamando `/api/equipment` → 403.
6. Criar empréstimo → `expected_return_date` pula feriado.
7. Admin cria usuário, reseta o 2FA dele, exclui.
8. Repetir os passos 2–7 na URL do Render.

## Implementação futura: API de garantia (substituir a AwesomeAPI)

> Status: **planejado, ainda não iniciado.**

### Motivação
A AwesomeAPI (cotação USD→BRL) só **exibe** um valor a mais e não interfere em nenhuma regra do sistema. Uma API de **garantia do fornecedor** se encaixa melhor no domínio e **muda o resultado de uma operação**: equipamento com garantia vencida não pode ser emprestado.

APIs reais de garantia (Dell TechDirect, Lenovo, HP, Apple GSX) exigem cadastro e aprovação como parceiro e só funcionam com números de série reais. Por isso a equipe vai **criar a própria API**, simulando o sistema do fornecedor. O PDF permite isso: "integração com outra API externa (que vocês também podem criar)".

### A WarrantyAPI
Serviço Express mínimo, separado do InventoryManager, com os dados em um arquivo JSON e deploy próprio no Render.

| Rota | Retorna |
|---|---|
| `GET /warranties/:serialNumber` | a garantia de um equipamento (404 se não existir) |
| `GET /warranties?serials=A,B,C` | várias garantias de uma vez (para a listagem do estoque) |

```json
{
  "serial_number": "DL7440-8F2K1",
  "supplier": "Dell Brasil",
  "purchase_date": "2024-03-10",
  "warranty_end": "2027-03-10",
  "support_level": "ProSupport Next Business Day",
  "status": "active"
}
```

Dados: os 5 números de série do seed, com **pelo menos um com garantia vencida** para a demonstração.

### Integração no InventoryManager (2 requisições)
1. **`GET /api/equipment`**: consulta em lote e junta a garantia em cada equipamento (`warranty`).
2. **`POST /api/loans`**: consulta a garantia antes de emprestar. **Garantia vencida → `409 CONFLICT`** ("equipamento sem garantia não pode sair do setor").
- Se a WarrantyAPI estiver fora do ar: a listagem mostra a garantia como indisponível, e o empréstimo segue a mesma linha de resiliência das outras integrações (decidir: bloquear por segurança ou permitir com aviso).

### Mudanças previstas
- Novo `src/services/warrantyService.js` (no molde do `exchangeRateService.js`: `fetchJson` com timeout, cache e fallback).
- Nova variável `WARRANTY_API_URL` no `.env.example` e no README.
- Remover `exchangeRateService.js`. Trocar `value_usd` por `value_brl` guardado no banco (model, seed, front e README).
- Ajustar `equipmentService`, `loanService`, a tela `inventory.html` (coluna "Garantia") e os exemplos do README e do `docs/requests.http`.
- A BrasilAPI (feriados) continua.

### Decisões em aberto
- **Onde fica o código:** pasta `warranty-api/` neste repositório (recomendado: um só repositório para avaliar e um só histórico de commits; o Render aponta o segundo serviço para essa pasta) ou repositório separado.
- **Autenticação entre os serviços:** sem autenticação (mais simples de explicar) ou uma chave simples só entre os serviços, deixando claro que não é a técnica de autenticação do projeto.

### Branches sugeridas
`feat/warranty-api` (o serviço) → `feat/warranty-integration` (consumir no InventoryManager e remover a AwesomeAPI) → `docs/warranty-readme` (README e requests.http). Boa tarefa para outro integrante da equipe.

## Implementação futura: refatoração da autenticação para legibilidade

> Status: **planejado, ainda não iniciado.** Fazer depois da apresentação parcial: o código atual funciona e está testado.

Objetivo: deixar a parte da autenticação mais fácil de ler e de explicar, **sem mudar o comportamento** da API (mesmas rotas, respostas e códigos de erro).

1. **Dividir o `authService.js`** (hoje com ~165 linhas, misturando três assuntos):
   - `authService.js`: só o fluxo (senha → setup/verify → autenticado), lido de cima para baixo.
   - `sessionService.js`: `STAGES`, criar/regenerar/destruir a sessão e o cálculo da expiração do 2FA.
   - `lockoutService.js`: `assertNotLocked` e o registro de tentativas erradas (bloqueio após 5 erros).
2. **Remover a repetição entre `confirmTotpSetup` e `verifyTotpLogin`**: os dois fazem "checar bloqueio → validar código → registrar erro ou zerar contador → autenticar". Extrair uma função comum (ex.: `checkTotpCode`).
3. **Deixar o `throw` visível**: trocar `if (timeStep === null) registerInvalidCode(user);` (que lança o erro escondido dentro da função) por `if (timeStep === null) throw invalidCodeError(user);`.
4. **Calcular a expiração do 2FA em um lugar só**: a conta `mfaVerifiedAt + MFA_TTL` aparece hoje no `authMiddleware.js` e no `authController.js` (`/auth/me`). Centralizar no `sessionService`.
5. **Unificar o `session.regenerate()`**: o mesmo bloco aparece em `startPendingSession` e `completeAuthentication`. Virar uma função só no `sessionService`.

Como fazer: branch `refactor/auth-readability`, um commit `refactor:` por item. Antes do PR, repetir os testes de ponta a ponta (login, setup, verify, anti-replay, bloqueio 423, rate limit 429, expiração `MFA_EXPIRED`, 403 por papel). Depois, atualizar os nomes dos arquivos no README (seção "Implementação") e no `docs/auth-flow.md`.

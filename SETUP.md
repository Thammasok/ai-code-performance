# Setup Guide — AI Usage Telemetry

End-to-end setup for **local development** and **production**, covering all four
components:

| Component | Path | Stack | Role |
|---|---|---|---|
| `ai-usage-backend` | `backend/ai-usage-backend/` | Rust / Axum | Ingest, identity, governance, query API |
| `ai-usage-agent` | `agents/ai-usage-agent/` | Node/TS daemon | Signs + buffers + uploads events |
| `ai-usage-hook` | `packages/ai-usage-hook/` | Node/TS package | Thin hook invoked by AI CLIs |
| `ai-usage-dashboard` | `dashboard/` | React + Vite SPA | Web UI (summary, governance, audit) |

Data flow: **AI CLI → hook → (IPC) → agent → (HTTPS + signed JWT) → backend → Postgres**, and **dashboard → (HTTPS + JWT) → backend**.

> ⚠️ **Two different URL conventions — this trips people up:**
> - **Agent** `AI_USAGE_BACKEND_URL` = the **full events endpoint** → `http://localhost:8080/v1/events`
> - **Dashboard** `VITE_BACKEND_URL` = the **base URL only** (client appends `/v1/...`) → `http://localhost:8080`

---

## Prerequisites

| Tool | Version | Needed by |
|---|---|---|
| Docker + Docker Compose | recent | backend (Postgres + migrations) |
| Rust | 1.80+ | backend (local `cargo` runs) |
| Node.js | 18+ | agent, hook, dashboard |

---

# Part 1 — Local Development

## 1. Backend (start first — everything depends on it)

```bash
cd backend/ai-usage-backend

# a. Start PostgreSQL 16
docker compose up -d postgres

# b. Run Liquibase migrations (5 changesets: developers, governance_config,
#    usage_events, governance_audit_log, developer_role)
docker compose --profile migrate up liquibase

# c. Run the backend
cp .env.example .env          # DATABASE_URL=postgres://aiusage:aiusage_secret@localhost:5432/aiusage
cargo run                     # listens on 0.0.0.0:8080
#   — or run it in a container instead of cargo:
#   docker compose --profile app up -d backend
```

**Config (backend reads only these):**

| Env var | Required | Default / example |
|---|---|---|
| `DATABASE_URL` | Yes | `postgres://aiusage:aiusage_secret@localhost:5432/aiusage` |
| `RUST_LOG` | No | `info` |

> Port is currently hardcoded to **8080** (`src/main.rs`).

**Verify:**

```bash
curl http://localhost:8080/health      # → 200 OK
```

**Endpoints:**

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/health` | — | Health check |
| POST | `/v1/events` | JWT (ES256) | Agent submits signed events |
| GET | `/v1/usage/summary` | JWT | Scoped by DB role |
| PATCH | `/v1/governance/policy` | JWT + platform_admin | |
| GET | `/v1/governance/audit-log` | JWT + platform_admin/auditor | |

## 2. Register a developer (required before the agent can upload)

The backend verifies each event's ES256 signature against a **registered public key**
and derives `developer_id` from that signature — it never trusts a client-supplied id
(ADR-003).

```bash
# a. Start the agent once to auto-generate keys, then Ctrl+C
cd agents/ai-usage-agent
npm install && npm run build
AI_USAGE_BACKEND_URL=http://localhost:8080/v1/events node dist/index.js
#   → generates ~/.mycompany-ai-usage/keys/{signing.key, signing.pub, buffer.key}
#   Ctrl+C after "Generated new ES256 signing key pair"

# b. Register the public key with the backend (pick any UUID for dev)
cd ../../backend/ai-usage-backend
cargo run --bin register_developer -- 11111111-1111-1111-1111-111111111111 \
  ~/.mycompany-ai-usage/keys/signing.pub
```

> **Role gotcha:** `register_developer` only stores `developer_id` + `public_key`.
> The `developers.role` column **defaults to `developer`**. To exercise the admin/auditor
> views against real data, set the role directly:
>
> ```bash
> docker compose exec postgres psql -U aiusage -d aiusage \
>   -c "UPDATE developers SET role='platform_admin' WHERE developer_id='11111111-1111-1111-1111-111111111111';"
> ```
> Valid roles: `developer`, `manager`, `platform_admin`, `auditor`. For `manager`,
> also set `team_id` (and the reports' `team_id`) so team scoping resolves.

## 3. Agent (daemon)

```bash
cd agents/ai-usage-agent
export AI_USAGE_BACKEND_URL=http://localhost:8080/v1/events   # FULL endpoint
export AI_USAGE_DEV_DEVELOPER_ID=11111111-1111-1111-1111-111111111111
node dist/index.js
```

| Env var | Required | Description |
|---|---|---|
| `AI_USAGE_BACKEND_URL` | **Yes** | Full events endpoint. Missing → `AI_USAGE_BACKEND_URL is required`, exit 1 |
| `AI_USAGE_DEV_DEVELOPER_ID` | No (dev) | Bypasses SSO; use the UUID you registered above |

State lives in `~/.mycompany-ai-usage/` (keys, encrypted buffer, `daemon.sock`, `pending/`).
See `agents/ai-usage-agent/SETUP.md` for the full agent reference.

## 4. Hook (simulate a CLI event)

```bash
cd packages/ai-usage-hook
npm install && npm run build
node dist/cli.js claude_code user_prompt_submit '{"model":"claude-3","tokensInput":100}'
```

The hook sends to the agent over IPC (exit code 0 always). The agent enriches, signs,
buffers, and uploads to the backend. Confirm the row landed:

```bash
docker compose exec postgres psql -U aiusage -d aiusage -c "SELECT tool, model, tokens_input FROM usage_events ORDER BY timestamp DESC LIMIT 5;"
```

## 5. Dashboard

```bash
cd dashboard
cp .env.example .env           # VITE_BACKEND_URL=http://localhost:8080  (BASE url, no /v1)
npm install
npm run dev                    # → http://localhost:5173
```

You'll be redirected to `/sign-in`, which asks for a JWT. There are **two modes**:

### Mode A — UI only (no valid backend auth needed)

The SPA **decodes** the JWT's claims (`sub`, `email`, `role`, `exp`) for nav gating but
does **not** verify the signature (the backend does). So a hand-made token is enough to
explore routing, role-gating, theme, and all four role views. API calls will fail and
show the ErrorState — expected without valid backend auth. Mint a dev token:

```bash
node -e 'const b=o=>Buffer.from(JSON.stringify(o)).toString("base64url");
const h=b({alg:"ES256",typ:"JWT"}), exp=Math.floor(Date.now()/1000)+31536000;
const t=r=>h+"."+b({sub:"11111111-1111-1111-1111-111111111111",email:r+"@myorder.ai",role:r,exp})+".dev-not-verified";
["platform_admin","manager","developer","auditor"].forEach(r=>console.log(r+":\n"+t(r)+"\n"));'
```

Paste any of the printed tokens. `platform_admin` shows every screen; swap roles to verify
gating (e.g. `developer` visiting `/settings/governance` is redirected).

### Mode B — Real data from the backend

The backend verifies the Bearer JWT's ES256 signature against a registered public key, so
the fake tokens above return **401** on API calls. For real data the dashboard needs a JWT
**signed with a registered private key**.

> ⚠️ **Known gap:** there is no CLI today that mints a standalone signed JWT for the
> dashboard (the agent only signs event uploads internally). Until a `mint_jwt` helper is
> added, full real-data testing from the dashboard requires signing a token with the
> registered private key (`~/.mycompany-ai-usage/keys/signing.key`) carrying claims
> `sub=<registered uuid>`, `role`, `exp`. In production this is replaced by OIDC (see
> Part 2). Ask the orchestrator to add the `mint_jwt` helper if you need Mode B now.

---

# Part 2 — Production

Production hardens each component. The principles (from the ADRs) that must hold:
- Server derives `developer_id` from signature only — never trust client fields (ADR-003).
- Hook/package must never block the developer's CLI — always exit 0 (ADR-003).
- Redact-before-persist for personal accounts (ADR-004).
- Governance policy is editable at runtime via the admin panel, no redeploy (ADR-004).

## Backend

- **Deploy target:** k8s (per contract). Build the release image from
  `backend/ai-usage-backend/Dockerfile`.
- **Database:** managed Postgres 16. Set `DATABASE_URL` via a secret, not `.env`.
  Run Liquibase as an init/job step before rolling out the new backend version.
- **Migrations:** `liquibase ... update` against the production DB (the same
  `db.changelog-master.yaml`). Never let the app auto-migrate.
- **TLS + ingress:** terminate TLS at the ingress; expose `https://ai-usage.internal.<company>`.
- **Config still to wire for prod:** externalize the listen port (currently hardcoded 8080),
  connection-pool size, and add the **public-key registration endpoint** fed by SSO (today
  only the `register_developer` CLI exists — see ADR-003 / CLAUDE.md task 4).
- **Retention/partitioning:** governance-driven `raw_retention_days` + monthly partitions
  (ADR-002) — schedule the retention job.

## Agent

- Package `dist/` to `/opt/ai-usage-agent` and run as a service.

  **Linux (systemd user service)** — `~/.config/systemd/user/ai-usage-agent.service`:
  ```ini
  [Unit]
  Description=AI Usage Telemetry Agent
  After=network.target
  [Service]
  Type=simple
  Environment=AI_USAGE_BACKEND_URL=https://ai-usage.internal.mycompany.com/v1/events
  ExecStart=/usr/bin/node /opt/ai-usage-agent/dist/index.js
  Restart=always
  RestartSec=10
  [Install]
  WantedBy=default.target
  ```
  ```bash
  systemctl --user enable --now ai-usage-agent
  ```
  **Windows:** run via [node-windows](https://www.npmjs.com/package/node-windows) or a
  login scheduled task (IPC uses the named pipe `\\.\pipe\mycompany-ai-usage-daemon`).

- **Identity (replace dev stub):** implement `registerWithCompanyIdp()` in
  `src/identity/provisioning.ts` (SSO device-code flow, Okta/Azure AD/Google, ADR-003).
  Drop `AI_USAGE_DEV_DEVELOPER_ID` in production.
- **Key protection:** swap `FileKeyStore` for an OS-keychain-backed keystore
  (keytar / native binding) so the private key can't be trivially copied (ADR-003).

## Hook

- Distribute as the published `@mycompany/ai-usage-hook` package and wire it into each
  tool's hook config (Claude Code / Codex / OpenCode). It must remain thin and
  fail-open (exit 0) so it can never block a developer's CLI.

## Dashboard

- **Build:** `cd dashboard && npm run build` → static `dist/`. Deploy to a static/edge
  host (Vercel-style), not the backend cluster (per contract).
- **Config:** set `VITE_BACKEND_URL=https://ai-usage.internal.mycompany.com` at build time
  (base URL, no `/v1`).
- **Auth (replace dev sign-in):** the paste-a-JWT screen is a dev stub. Replace it with the
  company OIDC flow while keeping the same `useAuth().signIn` contract, so the backend can
  authenticate humans (today the backend only verifies agent self-signed JWTs — the human
  OIDC path is the ADR-005 production design).
- **Perf follow-up:** the bundle is ~731 kB (recharts). Code-split/lazy-load routes before
  first-load latency matters (tracked as a dashboard follow-up).

---

# Quick reference — env vars

| Component | Var | Local value |
|---|---|---|
| backend | `DATABASE_URL` | `postgres://aiusage:aiusage_secret@localhost:5432/aiusage` |
| backend | `RUST_LOG` | `info` |
| agent | `AI_USAGE_BACKEND_URL` | `http://localhost:8080/v1/events` (full endpoint) |
| agent | `AI_USAGE_DEV_DEVELOPER_ID` | your registered UUID (dev only) |
| dashboard | `VITE_BACKEND_URL` | `http://localhost:8080` (base, no `/v1`) |

# Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `AI_USAGE_BACKEND_URL is required` | Agent env var unset. `export AI_USAGE_BACKEND_URL=http://localhost:8080/v1/events` (full endpoint) |
| `DATABASE_URL must be set` | Backend env unset. `cp .env.example .env` then `cargo run` |
| Dashboard API calls 401 | JWT signature not verifiable — you used a fake token (Mode A). Real data needs a signed JWT (Mode B) |
| Dashboard shows no Governance/Audit nav | DB role is `developer`. `UPDATE developers SET role='platform_admin' ...` |
| Event never lands in `usage_events` | Public key not registered, or `developer_id` mismatch between agent and `register_developer` |
| Migrations not applied | Run `docker compose --profile migrate up liquibase` before starting the backend |

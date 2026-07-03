# Handoff: AI Usage Telemetry — เริ่มงานที่นี่

เอกสารนี้สรุปทุกอย่างที่ตัดสินใจและสร้างไว้แล้ว เพื่อให้ทำงานต่อได้โดยไม่ต้องถามบริบทซ้ำ

## เป้าหมายของระบบ

เก็บข้อมูลการใช้งาน AI CLI (Claude Code, Codex, OpenCode) แยกรายบุคคล — model, token, cost — สำหรับทีม dev 50+ คน ผ่าน hook ของแต่ละเครื่องมือ

## เอกสารสถาปัตยกรรมทั้งหมด (อ่านก่อนแก้โค้ดใดๆ)

อยู่ใน `docs/overview/`:
- `architecture.md` — ภาพรวมเต็ม, canonical event schema, data flow
- `adr/ADR-001-architecture-style.md` — modular monolith (ไม่ใช่ microservices)
- `adr/ADR-002-storage-choice.md` — **Postgres ตัวเดียว** (ไม่ใช่ ClickHouse+Postgres) พร้อม partition + retention ปรับได้
- `adr/ADR-003-identity-hook-antitamper.md` — local-agent key เป็นแหล่ง identity หลักเสมอ, hook governance ผ่าน package/daemon split, anti-tamper layers
- `adr/ADR-004-account-classification-policy.md` — company vs personal account classification + retention policy
- `adr/ADR-005-authentication-rbac.md` — OIDC สำหรับ human, RBAC 4 roles, Postgres RLS

`docs/contracts/` — domain contracts (stack-agnostic API spec):
- `domain-ai-usage-backend.yaml` — **อ่านไฟล์นี้ก่อนแก้ backend ใดๆ** มี `api_contracts`, `data_ownership`, `sla` ครบ
- `domain-local-agent.yaml`
- `domain-ai-usage-dashboard.yaml`

`docs/build/build-order.yaml` — ลำดับการ build: **Tier 1: ai-usage-backend** (ไม่มี dependency) → **Tier 2: local-agent, ai-usage-dashboard** (ขนานกันได้)

## สถานะปัจจุบันของแต่ละส่วน

| ส่วน | Path | สถานะ |
|---|---|---|
| `@mycompany/ai-usage-hook` (thin package) | `packages/ai-usage-hook/` | ✅ **Compile ผ่าน + ทดสอบ end-to-end แล้ว** (exit code 0 เสมอ, fallback file ทำงานถูกต้อง, adapter ทำงานถูกต้อง) |
| `@mycompany/ai-usage-agent` (daemon) | `agents/ai-usage-agent/` | ✅ **Compile ผ่าน + ทดสอบ end-to-end แล้ว** กับ mock backend (JWT signing/verify, hash-chain tamper detection, offline fallback sweep ทดสอบจริงหมดแล้ว) |
| `ai-usage-backend` (Rust/Axum) | `backend/ai-usage-backend/` | ✅ **โค้ดครบ + Docker Compose พร้อมใช้** — hexagonal architecture (`domain/`, `adapters/`, `infrastructure/`), integration tests ครบ, รอ build บนเครื่องที่มี Rust toolchain + Docker |
| Liquibase Migrations | `backend/ai-usage-backend/liquibase/` | ✅ **Changelog ครบ 4 changesets** — `developers`, `governance_config`, `usage_events`, `governance_audit_log` |
| Docker Compose | `backend/ai-usage-backend/docker-compose.yml` | ✅ **พร้อมใช้** — PostgreSQL 16 + Liquibase + Backend container |

## วิธีรัน Backend ด้วย Docker Compose

```bash
cd backend/ai-usage-backend

# 1. Start PostgreSQL
docker compose up -d postgres

# 2. Run Liquibase migrations
docker compose --profile migrate up liquibase

# 3a. Run backend locally (for development)
cp .env.example .env
cargo run

# 3b. Or run backend in container
docker compose --profile app up -d backend
```

**Endpoints:**
| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| POST | `/v1/events` | Submit usage event (requires JWT) |

## งานที่ต้องทำต่อ (ลำดับความสำคัญ)

### ✅ 1. ~~ทำให้ `ai-usage-backend` compile และรันได้จริง~~ (เสร็จแล้ว)

โค้ดครบแล้ว รอ build บนเครื่องที่มี Rust 1.80+ และ Docker:

```bash
cd backend/ai-usage-backend
cargo build
```

โครงสร้างเป็น hexagonal (`domain/`, `adapters/`, `infrastructure/`) — จุดสำคัญ:

- **`src/domain/auth.rs`** — verify self-signed JWT (ES256) จาก local-agent โดย decode payload แบบไม่ verify ก่อนเพื่อรู้ `developer_id` แล้วค่อยไป lookup public key จริงมา verify signature — **`developer_id` ต้องมาจากผลของ signature verification เท่านั้น ห้าม trust จาก field ใดๆ ที่ client ส่งมาโดยตรง** (ADR-003)
- **`src/domain/model.rs`** — `classify_account()` / `should_redact()` ใช้ทำ governance classification ตาม ADR-004 — `unknown` treat เป็น `personal` โดย fail-safe
- **`src/adapters/db/repository.rs`** — `insert_event()` รับ `redact: bool` แล้ว zero-out token/cost/project **ก่อน** เขียนลง DB ไม่ใช่ query แล้วค่อยกรอง (data minimization)

### ✅ 2. ~~เขียน integration test สำหรับ `POST /v1/events`~~ (เสร็จแล้ว)

Integration tests อยู่ใน `tests/integration_test.rs` ครอบคลุม:
- ✅ Signature ถูกต้อง + developer ที่ registered แล้ว → 200, บันทึกลง DB ครบ
- ✅ Signature ผิด/หมดอายุ → 401
- ✅ `developer_id` ที่พยายามใส่ในตัว body ถูกเพิกเฉย ใช้ค่าจาก JWT เท่านั้น
- ✅ `account_class = personal` + `personal_account_policy = flag_only` → token/cost/project เป็น 0/null ใน DB
- ✅ ใช้ `testcontainers` แทนการพึ่ง Postgres ที่ติดตั้งไว้ล่วงหน้า

รัน tests:
```bash
cargo test
```

### 3. ต่อ `ai-usage-agent` (daemon) เข้ากับ backend จริง

Daemon ทดสอบผ่านมาแล้วกับ mock backend (ดู `docs/packages/ai-usage-agent-design.md`) — พอ backend จริงรันได้ ให้:
```bash
export AI_USAGE_BACKEND_URL=http://localhost:8080/v1/events
export AI_USAGE_DEV_DEVELOPER_ID=<uuid>   # ใช้ได้ชั่วคราวจนกว่าจะมี SSO integration จริง — ดูข้อ 4
```
แล้วรัน `register_developer` binary เพื่อลงทะเบียน public key ของ daemon ก่อนยิง event จริง:
```bash
cargo run --bin register_developer -- <developer_uuid> <path_to_public_key.pem>
```

### 4. Implement ส่วนที่เป็น stub ไว้โดยตั้งใจ (org-specific)

- `agents/ai-usage-agent/src/identity/provisioning.ts` → ฟังก์ชัน `registerWithCompanyIdp()` — ต้องเขียน SSO device-code flow จริงกับ IdP ของบริษัท (Okta/Azure AD/Google) ตาม ADR-003
- Endpoint ฝั่ง backend สำหรับรับ public key registration จากผลของ SSO flow (ตอนนี้มีแค่ CLI helper สำหรับ dev/test)
- `agents/ai-usage-agent/src/identity/keystore.ts` → `FileKeyStore` เป็น reference implementation เท่านั้น **ต้องเปลี่ยนเป็น OS keychain จริง** (keytar หรือ native binding) ก่อน deploy จริงตาม ADR-003 — เหตุผลอยู่ในคอมเมนต์ของไฟล์

### 5. Tier 2 Endpoints (ยังไม่ implement)

Spec ครบใน `domain-ai-usage-backend.yaml` แล้ว:
- `GET /v1/usage/summary` — query aggregated usage
- `PATCH /v1/governance/policy` — update governance config (admin only)
- `GET /v1/governance/audit-log` — retrieve governance change history

แล้วค่อยเริ่ม `ai-usage-dashboard` (Next.js)

## หลักการที่ต้องยึดตลอด (สรุปจาก ADR ทั้งหมด)

1. **Server derive `developer_id` จาก signature เสมอ ไม่เชื่อ field ที่ client ส่งมา**
2. **Hook/package ห้าม block CLI ของ dev เด็ดขาด** — exit code 0 เสมอ
3. **ไม่มีทาง anti-tamper ได้ 100% จากฝั่ง client ล้วนๆ** — เป้าหมายคือเพิ่มความยาก + เพิ่มโอกาสตรวจจับ ไม่ใช่ปิดรูรั่วสมบูรณ์ (ยกเว้นจะเพิ่ม LLM gateway หรือ vendor usage API reconciliation ในอนาคต — นอก scope ปัจจุบัน)
4. **Governance policy เปลี่ยนได้ผ่าน admin panel โดยไม่ต้อง deploy ใหม่** (`raw_retention_days`, `personal_account_policy`, `company_domains`)
5. **Redact ก่อน persist เสมอ ไม่ใช่ query แล้วค่อยกรอง** (data minimization)

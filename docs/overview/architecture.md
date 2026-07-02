# สถาปัตยกรรม: ระบบเก็บข้อมูลการใช้งาน AI ต่อรายบุคคล (AI Usage Telemetry)

## 1. บริบทและเป้าหมาย

**โดเมน**: Internal developer platform tool — เก็บ log การใช้งาน AI coding assistant (Claude Code, Codex, OpenCode, และเครื่องมืออื่นที่จะเพิ่มในอนาคต) แยกตามรายบุคคล เพื่อดู model ที่ใช้, จำนวน token, และประเมินต้นทุน

**ขนาดทีม**: 50+ นักพัฒนา
**Infra ปัจจุบัน**: ยังไม่มี (greenfield)
**ความต้องการเอาต์พุต**: ทั้ง real-time dashboard และรายงานสรุปรายวัน/รายสัปดาห์

**Non-functional requirements ที่สำคัญ**:
- **Attribution ถูกต้อง** — ข้อมูลต้อง map กับ developer คนจริงได้ แม้ใช้เครื่องมือหลายตัว/หลายเครื่อง
- **Extensibility** — ต้องเพิ่มเครื่องมือ AI ใหม่ได้โดยไม่แก้ core pipeline (Cursor, Aider, Windsurf, internal tools ในอนาคต)
- **ความทนทานของการเก็บข้อมูล** — hook ต้องไม่ทำให้ CLI ของนักพัฒนาช้าลงหรือ block งาน แม้ backend ล่ม
- **Privacy** — เก็บเฉพาะ metadata การใช้งาน (token, model, เวลา, โปรเจกต์) **ไม่เก็บเนื้อหา prompt/response**
- **Volume ต่ำ-ปานกลาง** — ประมาณการ: 50 คน × ~150-300 call/คน/วัน ≈ 7,500-15,000 events/วัน ซึ่งเล็กมากในระดับ analytics แต่ควรออกแบบให้ scale ได้ 10 เท่าโดยไม่ต้อง redesign

---

## 2. Bounded Context

ระบบนี้เป็น **bounded context เดียว**: `AI Usage Telemetry` ไม่จำเป็นต้องแตกเป็น microservices เพราะ:
- ทีมดูแลระบบนี้น่าจะเป็นทีมเดียว (platform/DevEx team)
- โดเมนไม่ซับซ้อน ไม่มี business logic ที่ต้องแยก consistency boundary
- Volume ข้อมูลไม่ได้ใหญ่ระดับที่ต้องการ independent scaling ต่อ service

แบ่งเป็น **module ภายใน modular monolith** (ตาม DDD tactical pattern):

| Module | หน้าที่ |
|---|---|
| `Ingestion` | รับ event จาก hook adapter ต่างๆ, validate, normalize เป็น canonical schema |
| `Identity` | map ตัวตนนักพัฒนาจาก **local-agent key เสมอ** (ผูก company IdP โดยตรง) — server derive `developer_id` จาก signature เท่านั้น ไม่เชื่อ field ที่ client ส่งมา — ดูรายละเอียดใน ADR-003 |
| `Governance` | config `company_domains[]`, `personal_account_policy` (`flag_only`/`collect_full`) และ `raw_retention_days` (ปรับได้ผ่าน admin panel) — ดู ADR-004, ADR-002 |
| `Catalog` | ทะเบียน model + ราคาต่อ token (สำหรับคำนวณ cost) ต่อ provider |
| `Aggregation` | ประมวลผล event เป็น rollup รายชั่วโมง/วัน/สัปดาห์ ต่อคน/ทีม/tool/model |
| `Reporting` | สร้างรายงานตามรอบ, ส่ง Slack/email |
| `Query` | API สำหรับ dashboard ดึงข้อมูล real-time + historical, บังคับ RBAC ผ่าน role claim จาก IdP + Postgres RLS |
| `Access Control` | Authentication (OIDC ผ่าน company IdP) + RBAC (`developer`/`manager`/`platform_admin`/`auditor`) + `team_membership` sync จาก IdP/HRIS — ดู ADR-005 |

---

## 3. Architecture Style

**เลือก: Event-Driven Ingestion + Modular Monolith (ไม่ใช่ microservices)**

ดู ADR-001 สำหรับเหตุผลเต็ม สรุปสั้น: มี bounded context เดียว, ทีมเดียวดูแล, volume ไม่สูง → microservices จะเพิ่ม operational overhead โดยไม่ได้ประโยชน์ แต่การ**เก็บข้อมูลเป็น append-only events** (แนวคิดจาก Event Sourcing เบา ๆ) มีประโยชน์จริง เพราะ:
- Usage record เป็น "fact ที่เกิดขึ้นแล้ว" (past tense, immutable) ตรงกับธรรมชาติของ domain event
- อยาก replay/recompute rollup ย้อนหลังได้ถ้า pricing model เปลี่ยน หรือมี bug ใน aggregation logic
- Audit trail ตามธรรมชาติ

จึงใช้ **Hexagonal (ports & adapters)** สำหรับชั้น ingestion เพื่อรองรับเครื่องมือ AI ใหม่ๆ ได้ง่าย และ **CQRS แบบเบา** — แยก write path (ingest raw event) ออกจาก read path (query rollup ที่ pre-compute ไว้) เพราะ pattern การเขียนกับการอ่านต่างกันชัดเจน (เขียนทีละ event, อ่านแบบ aggregate จำนวนมาก)

---

## 4. Data Flow (ดู diagram ประกอบ)

1. **Hook ในแต่ละเครื่องมือ** (Claude Code, Codex, OpenCode, อื่นๆ) ยิง event ทุกครั้งที่มีการเรียก AI model เสร็จสิ้น
2. **Local usage agent** (เดมอน/CLI เล็กๆ รันบนเครื่อง dev) รับ event จาก hook ผ่าน local socket/webhook, เติม identity + machine metadata, buffer เป็น batch, ส่งต่อแบบ async — ถ้าออฟไลน์จะ queue ไว้ในเครื่องแล้วส่งภายหลัง (ป้องกัน hook block งานของ dev)
3. **Ingestion API** (stateless HTTP) ตรวจสอบ API key ต่อ developer, validate schema, push เข้า queue
4. **Message queue** (NATS JetStream หรือ Redis Streams) กันชนระหว่าง ingestion กับ processing, รองรับ retry/backpressure
5. **Stream processor** เขียน raw event ลง Postgres (partition ตามเดือน) และอัปเดต daily rollup สำหรับ dashboard
6. **Storage**: Postgres ตัวเดียว — raw events (partitioned, retention ปรับได้ผ่าน `raw_retention_days` ใน Governance config, default 90 วัน) + daily rollup (เก็บตลอดไป) + metadata (developer directory, model pricing catalog) ดูรายละเอียดเต็มใน ADR-002
7. **Query & reporting API** อ่านจาก Postgres ให้ dashboard (real-time จาก raw partition ล่าสุด) และ scheduled job (สรุปรายวัน/สัปดาห์/เดือน คำนวณจาก daily rollup → Slack/email)

---

## 5. Canonical Event Schema

```json
{
  "event_id": "uuid",
  "developer_id": "internal-id (จาก Identity module)",
  "tool": "claude_code | codex | opencode | cursor | other",
  "tool_version": "string",
  "model": "claude-sonnet-5 | gpt-5-codex | ...",
  "provider": "anthropic | openai | other",
  "tokens_input": 1234,
  "tokens_output": 567,
  "tokens_cached": 0,
  "cost_estimate_usd": 0.0123,
  "session_id": "uuid",
  "project": "repo name หรือ path hash (ไม่เก็บ path เต็มถ้ามีความ sensitive)",
  "machine_id": "hashed",
  "timestamp": "ISO8601",
  "latency_ms": 850,
  "status": "success | error | timeout",
  "account_email_domain": "string (จาก CLI-native account, signal เสริมสำหรับ classification)",
  "account_class": "company | personal | unknown (คำนวณตอน ingestion, ดู ADR-004)"
}
```

**หมายเหตุ**: ถ้า `personal_account_policy = flag_only` และ `account_class = personal` field `tokens_*`, `cost_estimate_usd`, `project` จะถูกตัดทิ้งก่อน persist — เหลือแค่ identity + timestamp + account_class (ดู ADR-004)

**สิ่งที่ห้ามเก็บ**: เนื้อหา prompt, response, code diff — เก็บเฉพาะ metadata เชิงปริมาณ เพื่อลดความเสี่ยงด้าน privacy/security และลด attack surface ถ้าข้อมูลรั่ว

---

## 6. Hook Integration Pattern (Hexagonal Adapter)

แต่ละเครื่องมือมี hook mechanism ต่างกัน แต่ทุกตัวแปลงเป็น **port เดียวกัน** ผ่านสถาปัตยกรรม 2 ชั้น:

1. **Hook entry ของแต่ละ tool** เรียก **npm package บางๆ** (`@mycompany/ai-usage-hook`) — ไม่ฝัง logic ไว้ตรงๆ ใน settings.json
2. Package forward event ผ่าน local socket ไปหา **local daemon ที่รันค้างอยู่แล้ว** ซึ่งเป็นที่ที่ identity resolution, signing, buffering, retry เกิดขึ้นจริง (แยกจาก process สั้นๆ ที่ hook spawn เพื่อไม่ให้ latency สูงตอน `UserPromptSubmit` ที่ยิงถี่)

| เครื่องมือ | Hook mechanism | Adapter ที่ต้องเขียน |
|---|---|---|
| Claude Code | hook script (`PostToolUse`/session-end hook) เรียก shell command | generate hook entry เรียก `npx @mycompany/ai-usage-hook` |
| Codex | CLI hook / config callback | เช่นเดียวกัน |
| OpenCode | plugin/event hook | เช่นเดียวกัน |
| เครื่องมืออื่นในอนาคต | ต่างกันไป | เขียน adapter ใหม่ 1 ตัว โดยไม่แตะ core pipeline หรือ daemon |

หลักการ: **core ingestion ไม่รู้จักเครื่องมือเฉพาะ** รู้จักแค่ canonical schema — เพิ่มเครื่องมือใหม่ = เขียน adapter บางๆ ที่แปลง tool-specific payload → canonical event เท่านั้น การอัปเดต logic การเก็บข้อมูลทำที่ package/daemon จุดเดียว ไม่ต้องกระจาย hook config ใหม่ทุกเครื่อง

**การป้องกันการแก้ไข/ลบ hook**: ดูรายละเอียดเต็มใน `adr/ADR-003-identity-hook-antitamper.md` — สรุปสั้นคือใช้ enterprise managed settings, commit config ลง repo + CI check, sign event ทันทีตอนสร้าง, และ layered detection (heartbeat, hash-chain, EDR) แทนการพยายาม block การแก้ไขแบบสมบูรณ์ซึ่งทำไม่ได้จริงถ้า dev มีสิทธิ์ admin เต็มเครื่อง

---

## 7. Trade-off Matrix

| ตัวเลือก | ข้อดี | ข้อเสีย | เหมาะกับ |
|---|---|---|---|
| Modular monolith + event pipeline (เลือก) | ง่ายต่อการ deploy/debug, พอสำหรับ volume ปัจจุบัน, ขยาย adapter ได้ง่าย | ต้อง refactor ถ้าโตเกิน 1 ทีมดูแล | ทีมเดียวดูแล, volume ต่ำ-กลาง |
| Full microservices ต่อ module | scale แยกอิสระ, เหมาะ multi-team | overhead สูงเกินความจำเป็นตอนนี้ | หลายทีม, volume สูงมาก |
| ส่ง event ตรงไป analytics DB โดยไม่มี queue | ง่ายสุด | ไม่มี buffer เวลา backend ล่ม, เสี่ยง data loss | prototype เร็วๆ เท่านั้น |
| Local agent เก็บ batch ก่อนส่ง (เลือก) | ทนทานต่อ network/offline, ลด load ที่ ingestion API | ต้อง maintain เดมอนบนเครื่อง dev แต่ละคน | ทีม dev ที่กระจาย, ต้องการ reliability |

---

## 8. Security & Privacy

- Identity: dual-source (CLI-native SSO-backed account เป็นหลัก, local-agent key เป็น fallback) — server derive `developer_id` จาก signature เสมอ ไม่เชื่อ field ที่ client ประกาศเอง (รายละเอียดใน ADR-003)
- ทุก event เซ็นด้วย private key ที่เก็บใน OS keychain **ทันทีตอนสร้าง event** ไม่ใช่ตอนจะส่ง — ป้องกันการแก้ไขเนื้อหาระหว่างที่ยังค้างอยู่ใน local buffer
- Local buffer ที่ queue ไว้ตอนออฟไลน์ **encrypt บนดิสก์** เพิ่มอีกชั้นเป็น friction (ไม่ใช่ตัวป้องกันหลัก)
- ไม่เก็บเนื้อหา prompt/response — เก็บเฉพาะตัวเลขและ metadata
- `project` field ควร hash หรือ allowlist เฉพาะชื่อ repo ที่รู้จัก ไม่ใช่ full path
- Transport เข้ารหัสด้วย TLS เสมอ (local agent → ingestion API)
- Access control: developer เห็นข้อมูลตัวเอง, manager/admin เห็นทีม, ผ่าน RBAC (OIDC role claim) + **Postgres Row-Level Security** เป็น defense-in-depth อีกชั้น — รายละเอียดเต็มใน ADR-005
- Governance API (แก้ retention/policy) มี audit log แยก เก็บนานกว่า usage data ปกติ เพราะเป็น compliance record
- **ข้อจำกัดที่ยอมรับ**: ไม่มีทางพิสูจน์ตัวเลข token แบบ cryptographic proof 100% จากฝั่ง client ล้วนๆ โดยไม่มี LLM gateway หรือ vendor usage API มาเป็นบุคคลที่สามยืนยัน — design นี้เน้นยกระดับความยากและเพิ่มโอกาสตรวจจับ (detection) ไม่ใช่ปิดรูรั่วสมบูรณ์

---

## 9. ขั้นตอนถัดไป (Roadmap)

1. Phase 1: กำหนด canonical event schema + สร้าง adapter สำหรับ Claude Code (เครื่องมือหลักที่ใช้เยอะสุด)
2. Phase 2: วาง ingestion API + queue + Postgres (partitioned + daily rollup), ต่อ adapter Codex, OpenCode
3. Phase 3: real-time dashboard (top-line metrics ต่อคน/ทีม)
4. Phase 4: scheduled report (weekly digest → Slack)
5. Phase 5: cost estimation ผูกกับ pricing catalog ต่อ model/provider

ดูรายละเอียดการตัดสินใจใน `adr/ADR-001-architecture-style.md`, `adr/ADR-002-storage-choice.md`, `adr/ADR-003-identity-hook-antitamper.md`, `adr/ADR-004-account-classification-policy.md` และ `adr/ADR-005-authentication-rbac.md`

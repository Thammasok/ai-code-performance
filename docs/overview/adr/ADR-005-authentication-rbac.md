## ADR-005: Authentication & RBAC

**Status**: Proposed

**Context**:
ระบบมี consumer สองกลุ่มที่ต้องการ auth คนละแบบ: (1) **machine** — local agent ที่ยิง event เข้า Ingestion API โดยไม่มีคนอยู่หน้าจอ (ออกแบบไว้แล้วใน ADR-003 ด้วย asymmetric key) และ (2) **human** — developer/manager/admin ที่เข้าดู dashboard, query API, และแก้ config ใน Governance module (ADR-004) ต้องออกแบบ authentication + authorization (RBAC) สำหรับกลุ่มที่สองให้ครบ

**Decision**:

### 1) Human authentication — OIDC ผ่าน company IdP เดียวกับ ADR-003

- ใช้ **Authorization Code flow + PKCE** ผ่าน IdP เดียวกับที่ local agent ใช้ (Okta/Azure AD/Google) — ไม่สร้างระบบ user/password แยก
- Session/access token อายุสั้น (~15 นาที) + refresh token ตามมาตรฐาน OIDC
- Role และ team membership มาจาก **IdP group claim** เป็นหลัก ไม่สร้างตาราง role ซ้ำในระบบเราเอง (ลด drift ระหว่างสอง source of truth)

### 2) RBAC — 4 roles

| Role | Scope การเห็นข้อมูล | แก้ Governance config ได้ไหม |
|---|---|---|
| `developer` (default) | เฉพาะข้อมูลตัวเอง | ไม่ได้ |
| `manager` / `team_lead` | ตัวเอง + ทีมที่ดูแล (ตาม `team_membership`) | ไม่ได้ |
| `platform_admin` | ทุกคนในองค์กร | ได้ |
| `auditor` (optional) | เห็นเฉพาะ audit/anomaly log (จาก anti-tamper detection ใน ADR-003) ไม่เห็น usage detail รายคน | ไม่ได้ |

- **`team_membership`**: sync จาก IdP groups หรือ HRIS เป็นระยะ (เช่น รายวัน) เก็บเป็นตาราง Postgres เบาๆ — ไม่ maintain hierarchy เองด้วยมือ เพื่อไม่ให้ "ใครดูแลใคร" กลายเป็น source of truth ที่สองที่ drift จาก HR system จริง

### 3) Enforcement — RBAC ที่ application layer + Postgres Row-Level Security (RLS) เป็น defense-in-depth

- Query/Governance API ตรวจ role จาก JWT claim ก่อนตอบทุก request (application-layer check)
- เพิ่ม **Postgres RLS policy** อีกชั้นบนตาราง `usage_events` และ `usage_daily_rollup` โดย set session variable (`app.current_developer_id`, `app.current_role`) ต่อ request แล้วให้ policy บังคับที่ database เอง — ถ้า application code มี bug ลืม filter, RLS จะยัง block การรั่วของข้อมูลข้ามคนไว้
- หลักการเดียวกับที่ยึดมาตลอด: **อย่าให้ layer เดียวเป็นจุดล้มเหลวจุดเดียว (single point of failure) สำหรับการป้องกันข้อมูลรั่ว**

### 4) Governance API ต้องเข้มกว่า Query API ปกติ

- Audit log แยกต่างหาก (ใคร เปลี่ยน config อะไร เมื่อไหร่) เก็บไว้ **นานกว่า `raw_retention_days`** เพราะเป็น compliance record ไม่ใช่ usage data ทั่วไป
- การเปลี่ยนแปลงที่กระทบ privacy โดยตรง (เช่น `flag_only` → `collect_full`) ควรพิจารณา step-up authentication หรือ two-person approval ก่อนมีผล

**Consequences**:
- ไม่ต้องดูแล credential store ของตัวเอง (ยืม IdP ที่มีอยู่แล้วทั้งฝั่ง machine และ human — สอดคล้องกับ ADR-003)
- RLS เพิ่ม safety net จริง แต่เพิ่ม complexity เล็กน้อยตอน implement (ต้อง set session variable ทุก request ให้ถูกต้อง มิเช่นนั้น RLS อาจ deny เกินจำเป็นหรือ error)
- Team hierarchy พึ่งความถูกต้องของ IdP/HRIS sync — ถ้า sync ล่าช้าหรือผิดพลาด manager อาจเห็นข้อมูลทีมไม่ครบ/เกิน ต้อง monitor sync job แยก
- Audit log ของ Governance API เพิ่มตารางใหม่ที่ retention policy ต่างจาก usage data — ต้องระบุแยกให้ชัดใน implementation ไม่ปนกับ `raw_retention_days`

**Alternatives Considered**:
- **สร้างระบบ user/password ของตัวเอง** — ปฏิเสธ เพราะเพิ่มภาระด้าน security (password storage, reset flow, MFA) ที่ IdP ทำได้ดีกว่าอยู่แล้ว
- **RBAC แค่ที่ application layer ไม่มี RLS** — ปฏิเสธเป็น sole mechanism เพราะไม่มี defense-in-depth ถ้า application มี bug ตัวเดียวก็รั่วข้อมูลข้ามคนได้ทันที แต่ RLS เพิ่มเป็นชั้นเสริม ไม่ใช่แทนที่ application-layer check
- **เก็บ role/team hierarchy เป็นตารางที่ admin กรอกเอง** — ปฏิเสธเป็น default เพราะสร้าง source of truth ที่สองที่ drift จาก HR system จริงได้ง่าย เลือก sync จาก IdP/HRIS แทน แต่เปิดเป็น manual override ได้ในกรณีที่ไม่มี IdP group ที่สะท้อน org chart จริง

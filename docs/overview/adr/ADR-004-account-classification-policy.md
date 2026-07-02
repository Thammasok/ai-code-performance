## ADR-004: Personal vs Company Account Classification & Retention Policy

**Status**: Proposed

**Context**:
Developer สามารถ login CLI ของ AI tool ด้วย personal account หรือ company account ก็ได้ (ตามที่สรุปใน ADR-003 ว่า local-agent identity เป็นแหล่งหลักเสมอ ไม่ขึ้นกับว่า login CLI ด้วย account ไหน) องค์กรต้องการรู้ว่ามีการใช้ personal account เกิดขึ้นหรือไม่ (shadow AI usage) แต่ก็ต้องการให้ทางเลือกได้ว่าจะเก็บรายละเอียดการใช้งาน personal account ระดับไหน เพราะอาจมีเนื้อหาที่ไม่เกี่ยวกับงานปนอยู่

**Decision**:

### Domain classification (server-side)

Ingestion pipeline เทียบ domain ของ CLI-native account email (signal เสริมจาก ADR-003) กับ **company domain allow-list** ที่ config ได้ ผลลัพธ์คือ `account_class: company | personal | unknown` แนบเข้ากับ event

### Configurable retention policy (module ใหม่: `Governance`)

Admin ตั้งค่าได้ 2 โหมดผ่าน policy `personal_account_policy`:

| Policy | พฤติกรรม | เหมาะกับ |
|---|---|---|
| `flag_only` (**default**) | สำหรับ event ที่ `account_class = personal`: ตัด field `tokens_*`, `cost_estimate_usd`, `project` ทิ้ง **ก่อน persist** เหลือแค่ developer_id, tool, timestamp, account_class | องค์กรที่เคารพความเป็นส่วนตัวของการใช้งาน personal account แต่ยังต้องการรู้ว่ามีการใช้งานเกิดขึ้น |
| `collect_full` | เก็บรายละเอียดเต็มเหมือน company account ทุกประการ ไม่สนใจ account_class | องค์กรที่มีเหตุผลด้าน security/compliance ต้องการ visibility เต็มรูปแบบไม่ว่า account ไหน |

**Redaction เกิดที่ ingestion pipeline ก่อน persist เสมอ** ไม่ใช่ query time — เพื่อลดความเสี่ยงด้าน data minimization (ถ้าไม่เก็บตั้งแต่แรก ไม่มีความเสี่ยงรั่วทีหลัง)

### Canonical event schema เพิ่ม field

```json
{
  "account_email_domain": "string (จาก CLI-native account)",
  "account_class": "company | personal | unknown"
}
```

**Consequences**:
- ตอบโจทย์ "รู้ว่ามีพนักงานใช้ personal account ไหม" ได้ครบ ไม่ว่าจะเลือก policy ไหน เพราะ `account_class` ถูกเก็บเสมอ สิ่งที่ policy ควบคุมคือ "ระดับรายละเอียด" ไม่ใช่ "การมองเห็น"
- Policy เปลี่ยนได้ตลอดเวลาโดยไม่ต้อง deploy code ใหม่ (config-driven ใน `Governance` module)
- `unknown` class (เช่น tool ที่ไม่ expose CLI account เลย) ควร treat เป็น personal โดย default (fail-safe เข้มงวดกว่า) เพื่อไม่ให้เผลอ over-collect ข้อมูลที่ไม่แน่ใจที่มา
- Dashboard/report ระดับ `flag_only` จะแสดงได้แค่ "ใครใช้ personal account กี่ครั้ง" ไม่สามารถ break down เป็น model/token ได้ — ทีมต้อง align กับ stakeholder ว่ายอมรับ trade-off นี้

**Alternatives Considered**:
- **เก็บทุกอย่างเต็มรูปแบบเสมอไม่ว่า account ไหน** — ปฏิเสธเป็น default เพราะขัดกับหลัก data minimization และอาจสร้างความกังวลเรื่อง privacy ในทีม แต่เปิดเป็นทางเลือก (`collect_full`) ให้องค์กรที่มีเหตุผลชัดเจนเลือกได้
- **ไม่เก็บอะไรเลยถ้าเป็น personal account (ไม่มีแม้แต่ flag)** — ปฏิเสธ เพราะเสียเป้าหมายหลักของ feature นี้ไปเลย (การรู้ว่ามี shadow usage คือคุณค่าที่ต้องการ)
- **ให้ local agent เป็นคน classify เอง (client-side)** — ปฏิเสธ เพราะแม้ incentive การโกงในเคสนี้จะกลับด้าน (dev อยากซ่อนว่าใช้ personal account มากกว่าอยากโกงตัวเลข) แต่หลักการ "client ไม่ควรตัดสินอะไรที่กระทบผลลัพธ์" ยังควรยึดไว้เพื่อความสม่ำเสมอของ design

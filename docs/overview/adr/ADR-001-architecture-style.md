## ADR-001: เลือก Event-Driven Modular Monolith แทน Microservices

**Status**: Proposed

**Context**:
ต้องออกแบบระบบเก็บ log การใช้งาน AI (model + token) ต่อรายบุคคล จากหลายเครื่องมือ (Claude Code, Codex, OpenCode, และเครื่องมือใหม่ในอนาคต) สำหรับทีม dev 50+ คน โดยยังไม่มี infra เดิม และต้องการทั้ง real-time dashboard และรายงานตามรอบ

**Decision**:
ใช้ **Modular Monolith** เป็นแกนกลาง (ingestion + aggregation + query อยู่ใน deployable unit เดียวหรือ 2-3 unit ที่แยกตามบทบาท ไม่ใช่แยกตาม business capability แบบ microservices) ร่วมกับ **event-driven pipeline แบบเบา** (queue คั่นระหว่าง ingestion กับ processing) และ **hexagonal adapter pattern** สำหรับรองรับเครื่องมือ AI หลายตัว

**Consequences**:
- ง่ายขึ้น: deploy หน่วยเดียว (หรือน้อยหน่วย), debug ง่าย, ทีมเล็กดูแลได้
- เพิ่มเครื่องมือ AI ใหม่ = เขียน adapter ใหม่ ไม่ต้องแตะ core
- ถ้าในอนาคตต้องการ scale การ query แยกจาก ingestion จริงจัง สามารถแยก query service ออกมาเป็นหน่วยเดียวได้ภายหลัง (evolutionary — โมดูลถูกออกแบบให้มี boundary ชัดอยู่แล้ว)
- ยังต้องมี queue คั่นกลาง เพื่อไม่ให้ ingestion ผูกกับ processing โดยตรง (ป้องกัน backpressure กระทบ hook ของ dev)

**Alternatives Considered**:
- **Full microservices ต่อ module** (Ingestion, Identity, Aggregation, Reporting, Query แยก service) — ปฏิเสธ เพราะทีมดูแลมีแนวโน้มเป็นทีมเดียว, volume ข้อมูล (~10k events/วัน) ไม่จำเป็นต้อง scale แยกส่วน, overhead ของ distributed system (service mesh, network failure modes) ไม่คุ้มกับประโยชน์ในตอนนี้
- **Serverless (Lambda/Cloud Run ต่อ event)** — พิจารณาไว้เป็นทางเลือกสำหรับ ingestion endpoint ในอนาคตถ้า traffic เป็น bursty มาก แต่ตอนเริ่มต้นยังไม่จำเป็น เพิ่ม cold-start latency ให้ hook โดยไม่ได้ประโยชน์คุ้มค่า
- **ส่ง event ตรงเข้า DB โดยไม่มี queue** — ปฏิเสธ เพราะเสี่ยง data loss เวลา backend ล่ม และ ingestion API จะบวมขึ้นถ้า traffic พุ่ง

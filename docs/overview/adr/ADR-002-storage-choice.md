## ADR-002: Storage choice — Postgres-only พร้อม configurable retention policy

**Status**: Accepted (revised — เดิมเลือก ClickHouse + Postgres, ดู "Revision history" ด้านล่าง)

**Context**:
ทีมยังไม่มี infra เดิม ต้องเลือก storage ที่รองรับทั้ง (1) query แบบ group-by/aggregate (per developer, per model, per tool, per time bucket) สำหรับ dashboard และรายงาน และ (2) ข้อมูล metadata เชิงสัมพันธ์ เช่น รายชื่อ developer, ทะเบียนราคา model

หลังประเมิน volume จริง (50 คน × 150-300 call/คน/วัน ≈ 7,500-15,000 events/วัน) และ requirement การเก็บ log ที่ชัดเจนขึ้น (raw log 90 วัน + summary รายเดือนย้อนหลัง) พบว่า raw data ที่ต้อง retain ตลอดเวลาอยู่ที่ประมาณ 675,000-1,350,000 rows เท่านั้น ซึ่งเป็น scale ที่ Postgres ธรรมดาจัดการได้สบายโดยไม่ต้องมี columnar engine แยกต่างหาก

**Decision**:

### Storage: Postgres ตัวเดียว

- **Raw events**: partition ตามเดือน (native declarative partitioning) เก็บย้อนหลังตาม `raw_retention_days` (ดูหัวข้อ retention ด้านล่าง) — partition ที่พ้นระยะเวลาถูก `DROP TABLE` ทิ้งทั้งก้อน แทนการ `DELETE` ทีละ row (เร็วกว่ามาก ไม่ต้องรอ vacuum)
- **Daily rollup**: ตาราง aggregate รายวัน (ต่อ developer/tool/model) เก็บไว้ **ตลอดไป** ขนาดเล็กมาก (<500,000 rows/ปี ที่ scale ปัจจุบัน) — มุมมองรายเดือน/รายไตรมาสคำนวณ on-the-fly จาก daily rollup ไม่ต้องมีตาราง monthly แยก
- **Metadata**: developer directory, model/pricing catalog, RBAC, Governance config — อยู่ใน Postgres schema เดียวกัน
- ใช้ **pg_partman** จัดการสร้าง/ลบ partition อัตโนมัติ และ **pg_cron** รัน daily aggregation job (หรือ TimescaleDB extension ถ้าต้องการ continuous aggregate + retention policy แบบ built-in แทนการประกอบเองด้วย pg_partman/pg_cron)

### Retention ปรับได้ผ่าน platform (ต่อยอด Governance module จาก ADR-004)

เพิ่ม config ใน `Governance` module:

| Config | Default | ปรับได้ผ่าน |
|---|---|---|
| `raw_retention_days` | 90 | Admin panel / Governance API |
| `daily_rollup_retention` | ไม่จำกัด (เก็บตลอดไป) | ไม่ควรให้ปรับ เพราะขนาดเล็กมากอยู่แล้ว ไม่มีเหตุผลต้องลบ |

**กลไก**: partition-pruning job **อ่านค่า `raw_retention_days` จาก Governance config ทุกครั้งที่รัน** แทนการ hardcode ค่าคงที่ในโค้ด — เปลี่ยนนโยบายได้ทันทีผ่าน admin panel โดยไม่ต้อง deploy ใหม่

**ข้อควรรู้เรื่อง retroactivity**: การปรับ `raw_retention_days` มีผลแค่ **ไปข้างหน้าเท่านั้น** — เพิ่มค่าจาก 90 เป็น 180 วัน ไม่ได้ทำให้ partition ที่ถูก drop ไปแล้วก่อนหน้ากลับมา (ข้อมูลหายไปจริงตอนที่ partition ถูก drop) มีผลแค่ "จากนี้ไปจะเก็บนานขึ้น" เท่านั้น ถ้าต้องการ safety margin ควรตั้งค่า default ให้มากกว่าที่คิดว่าต้องการเล็กน้อย เพราะเพิ่มทีหลังทำได้ แต่ "กู้คืนของเก่าที่ถูกลบไปแล้ว" ทำไม่ได้

**Consequences**:
- ลด operational overhead จากการดูแล 2 ฐานข้อมูล (polyglot persistence) เหลือ Postgres ตัวเดียว — ง่ายต่อการ backup, monitor, scale ในช่วงแรก
- Performance เพียงพอแน่นอนที่ scale ปัจจุบัน (sub-second query บน raw ≤1.35M rows ที่มี index/partition เหมาะสม, daily rollup แทบไม่มีต้นทุน query เลยเพราะเล็กมาก)
- **เสีย** ความสามารถ replay/recompute จาก raw event ที่เก่ากว่า `raw_retention_days` — ถ้าพบ bug ใน aggregation logic หรือ pricing model เปลี่ยนย้อนหลัง จะแก้ไขได้แค่ในช่วง retention window เท่านั้น ข้อมูลเก่ากว่านั้นต้องพึ่ง daily rollup ที่ granularity หยาบกว่า (ไม่มี session_id, latency, status รายละเอียด) — ยอมรับ trade-off นี้เพื่อแลกกับความเรียบง่ายของ infra
- ต้อง revisit decision นี้ถ้า (1) ทีมโตขึ้น 10-50 เท่า (500+ คน) หรือ (2) ต้องการ query ad-hoc ซับซ้อนข้ามปีบน raw data จำนวนมาก — ตอนนั้น ClickHouse จะเริ่มได้เปรียบชัดเจนกว่า Postgres

**Revision history**:
- เดิม (ตัดสินใจตอนยังไม่มีตัวเลข retention ที่ชัดเจน) เลือก ClickHouse (raw+rollup) + Postgres (metadata) เพื่อไม่ต้อง migrate ทีหลังถ้า volume โต
- แก้ไขหลังจากคำนวณ scale จริงจาก retention requirement ที่ชัดเจน (90 วัน raw + summary รายเดือน) พบว่า volume เล็กพอที่ Postgres อย่างเดียวรองรับได้สบาย — ลด infra ที่ไม่จำเป็นออกจาก design

**Alternatives Considered**:
- **ClickHouse (raw+rollup) + Postgres (metadata)** — ทางเลือกเดิม ยัง valid ถ้าต้องการ headroom สำหรับอนาคตตั้งแต่ต้น หรือถ้าทีมมั่นใจว่าจะโตเร็วมาก แต่ปฏิเสธเป็น default เพราะเพิ่ม operational overhead โดยไม่จำเป็นที่ scale ปัจจุบัน — เก็บไว้เป็นทางเลือกสำหรับ migrate ในอนาคตถ้าจำเป็นจริง
- **Cloud-managed analytics (BigQuery/Snowflake)** — ปฏิเสธในตอนนี้เพราะทีมต้องการคำแนะนำแบบ self-host/open-source ก่อน แต่เป็นตัวเลือกที่ดีถ้าทีมเลือกใช้ cloud-managed stack ในอนาคต
- **Elasticsearch** — เหมาะกับ log search แบบ full-text มากกว่า aggregate query เชิงตัวเลข ไม่ใช่จุดแข็งสำหรับ use case นี้
- **เก็บ raw ไม่มี retention เลย (เก็บตลอดไป)** — ปฏิเสธ เพราะไม่มีเหตุผลทางธุรกิจต้องเก็บ raw event ระดับ session/latency ไว้นานกว่า 90 วัน และเพิ่ม storage cost โดยไม่จำเป็น — daily rollup ตอบโจทย์การดูข้อมูลระยะยาวได้เพียงพอแล้ว

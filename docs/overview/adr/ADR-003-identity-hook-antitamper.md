## ADR-003: Identity Resolution, Hook Governance & Local Anti-Tamper Strategy

**Status**: Proposed

**Context**:
เครื่องมือ AI แต่ละตัว (Claude Code, Codex, OpenCode) ใช้ hook mechanism ที่ dev ต้อง setup เอง และสามารถแก้ไข/ลบออกได้ในเครื่องตัวเอง ทำให้เกิด 3 คำถามที่ต้องตัดสินใจร่วมกัน: (1) จะรู้ได้อย่างไรว่า event เป็นของใครจริงๆ (2) จะรองรับหลาย tool ที่มี config schema ต่างกันได้อย่างไรโดยไม่ต้องดูแลโค้ดซ้ำซ้อน (3) จะทำอย่างไรให้มั่นใจได้ในระดับหนึ่งว่า hook ไม่ถูกปิด/แก้ไข **โดยไม่พึ่งพา LLM gateway หรือ vendor usage API** (ซึ่งเป็น layer เสริมที่อาจเพิ่มทีหลัง แต่ไม่ใช่ scope ของ ADR นี้)

**Decision**:

### 1) Identity — local-agent key เป็นแหล่งหลักเสมอ, CLI-native account เป็น signal เสริม

- **แหล่งหลัก (ทุก tier, ทุก tool)**: local agent ทำ SSO device-code login ผูกกับ **company IdP โดยตรง** (Okta/Azure AD/Google) ตั้งแต่ติดตั้งครั้งแรก แล้ว generate **asymmetric key pair** เก็บ private key ใน OS keychain (non-exportable ถ้าเครื่องรองรับ Secure Enclave/TPM) — ทุก event เซ็นด้วย key นี้เสมอไม่ว่า dev จะ login CLI ของ vendor ด้วย account ไหนก็ตาม
- **เหตุผลที่ไม่ใช้ CLI-native account เป็นแหล่งหลัก**: ไม่ว่าจะเป็น tier ไหน (Individual, Team, หรือ Enterprise+SSO) **การ login CLI เป็นการกระทำที่ dev ควบคุมเองได้เสมอ** — dev สามารถ logout แล้ว login ด้วย personal account แทนได้ตลอดเวลา แม้ใน Enterprise tier ก็ตาม เพราะ CLI ส่วนใหญ่รองรับหลายวิธี login คู่ขนานกัน SSO จึงลดความเสี่ยง "สวมรอยเป็นคนอื่น" แต่ไม่ได้ป้องกัน "สลับไปใช้ account อื่นของตัวเอง"
- **บทบาทใหม่ของ CLI-native account**: ใช้เป็น **signal เสริมสำหรับ cross-check เท่านั้น** — เทียบ domain ของ account email กับ company directory เพื่อ detect ว่า dev กำลังใช้ personal account หรือ company account ในการเรียก AI (ดู ADR-004 สำหรับ policy การเก็บข้อมูลตามผลการ classify นี้)
- ทั้ง local-agent identity (หลัก) และ CLI-native account (เสริม) ไหลเข้า **Identity normalization layer** เดียวกัน แต่ **เฉพาะ local-agent signature เท่านั้นที่ใช้ derive `developer_id`**
- **หลักการที่ยึดตลอด**: server **ไม่เชื่อ `developer_id` ที่ client แนบมาในตัว event** เด็ดขาด — server คำนวณ identity เองจาก signature ของ local-agent key ที่ verify ผ่านเท่านั้น ไม่ใช่จาก CLI account ที่ dev เลือก login เอง

### 2) Hook governance — canonical manifest + thin package + long-running daemon

- เขียน hook definition ครั้งเดียวในรูปแบบกลาง (canonical manifest) แล้ว **generate เป็น native config ของแต่ละ tool** ผ่าน adapter ต่อ tool (hexagonal pattern เดิม)
- Hook config ของทุก tool เรียกผ่าน **npm package บางๆ** (`@mycompany/ai-usage-hook`) แทนการฝัง logic ไว้ตรงๆ — package ทำหน้าที่แค่ forward event ผ่าน local socket ไปหา **local daemon ที่รันค้างอยู่แล้ว** ซึ่งเป็นที่ที่ logic หนัก (identity resolution, signing, buffering, retry) อยู่จริง
- Package ต้อง publish บน **private registry เท่านั้น** (scope ผูกใน `.npmrc`) พร้อม pin version + lockfile integrity เพื่อกัน dependency confusion
- การ update logic ทำที่ package/daemon เพียงจุดเดียว ไม่ต้องกระจาย hook config ใหม่ไปทุกเครื่อง

### 3) Anti-tamper — layered, local-only (ไม่มี gateway/vendor API)

ยอมรับข้อจำกัดตั้งแต่แรก: **ไม่มีทางพิสูจน์ตัวเลข token แบบ cryptographic proof ได้ 100% จากฝั่ง client ล้วนๆ** — เป้าหมายคือยกระดับความยากและเพิ่มโอกาสตรวจจับ ไม่ใช่ปิดรูรั่วสมบูรณ์ ใช้ 3 layer ร่วมกัน:

| Layer | มาตรการ |
|---|---|
| **Prevention** | Enterprise managed settings (MDM) เป็นชั้นแรกถ้าทำได้, commit hook config ระดับ project ลง repo + บังคับด้วย CI check, ไฟล์/binary เป็น root-owned + immutable flag, code-sign daemon binary และ verify ตอน start |
| **Identity integrity** | Sign **ทุก event ทันทีตอนสร้าง** (ไม่ใช่ตอนจะส่ง) ด้วย private key ใน keychain — ถ้ามีคนแก้เนื้อหา event ในภายหลัง signature จะไม่ตรงทันที |
| **Detection** | Heartbeat/silence detection (คาดหวัง event ต่อเนื่องตาม pattern ปกติ), hash-chain บน local buffer (event อ้างอิง hash ของ event ก่อนหน้า ตรวจจับการลบ/แก้ log ที่ค้างส่งได้), self-attestation (daemon รายงาน version/checksum ของตัวเองไปด้วยทุกครั้ง), ใช้ EDR/FIM ที่ organization มีอยู่แล้วช่วย watch ไฟล์สำคัญถ้ามี |
| **Local buffer protection** | Buffer ที่ queue ไว้ตอนออฟไลน์ **encrypt บนดิสก์** ด้วย key ที่ผูกกับ OS keychain (คนละ key จาก signing key) — เป็น friction เพิ่มเติม ไม่ใช่ตัวป้องกันหลัก |
| **Organizational** | ประกาศ policy ชัดเจนว่าการปิด/แก้ hook ผิดกติกา และแจ้ง transparency ว่ามีการ track metadata (ไม่ใช่เนื้อหา) — ช่วยกันกรณีส่วนใหญ่ที่ไม่ใช่เจตนาโกงระบบ |

**Design principle สำคัญ**: alerting layer ทั้งหมด **flag ความผิดปกติ ไม่ block งานของ dev** เพราะเป้าหมายระบบนี้คือ observability ไม่ใช่ access control — false positive ที่ไป block งานจริงจะทำลายความน่าเชื่อถือของระบบมากกว่าประโยชน์ที่ได้

**Consequences**:
- Identity แข็งแรงตั้งแต่ต้นเพราะไม่ขึ้นกับว่า dev เลือก login CLI ของ vendor ด้วย account ไหน — company IdP เป็นเจ้าของ ground truth เพียงแหล่งเดียว
- ได้ signal เสริมฟรีสำหรับตรวจจับ "shadow usage" ผ่าน personal account โดยไม่ต้องสร้างกลไกแยก (ดู ADR-004)
- Logic การเก็บข้อมูลรวมศูนย์อยู่ที่ package/daemon จุดเดียว อัปเดตง่าย ลด maintenance burden ระยะยาว
- ยังมี residual risk ที่ dev ซึ่งมี root/admin เต็มเครื่องและตั้งใจ reverse-engineer จริงจังสามารถ bypass ได้ในที่สุด — เป็นข้อจำกัดที่ยอมรับใน scope ของ ADR นี้ ถ้าต้องการปิดช่องว่างสุดท้ายต้องพิจารณา LLM gateway หรือ vendor usage API reconciliation เป็น layer เสริม (นอก scope)

**Alternatives Considered**:
- **Encoding (base64/hex) เป็นกลไก anti-tamper** — ปฏิเสธ เพราะ encoding ไม่ใช่ security control เป็นแค่ transformation ของ format decode กลับได้ทันที ไม่ได้ป้องกันการอ่านหรือแก้ไขเลย
- **Obfuscation ของโค้ด hook/daemon** — พิจารณาแล้วปฏิเสธเป็น primary control เพราะกันได้แค่คนที่ไม่ตั้งใจ และเสี่ยงเสียความไว้ใจของ dev ถ้าพบว่าโค้ดถูกจงใจซ่อนไว้ในเครื่องตัวเอง — ใช้ signing และ managed settings แทนซึ่งแก้ปัญหาตรงจุดกว่า
- **Block การทำงานทันทีเมื่อ detect anomaly** — ปฏิเสธ เลือก flag แทน เพราะความเสี่ยง false positive กระทบการทำงานจริงของ dev สูงกว่าประโยชน์ที่ได้จากการ block
- **ใช้ CLI-native account เป็นแหล่งหลักเฉพาะ Enterprise+SSO tier** — ปฏิเสธ เพราะ dev ยังสลับไป login ด้วย personal account ได้เสมอไม่ว่า tier ไหน (login เป็นการกระทำที่ client ควบคุมเอง) ทำให้ยังมีช่องโหว่เดิมอยู่ แค่ทำให้ดูเหมือนปลอดภัยกว่าความเป็นจริง

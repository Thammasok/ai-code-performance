# Daemon design: @mycompany/ai-usage-agent

รับช่วงต่อจาก `@mycompany/ai-usage-hook` (package) ตาม ADR-003 — นี่คือ **long-running process** ที่ทำงานหนักทั้งหมดที่ package ตั้งใจไม่ทำ

## หน้าที่

1. รับ event จาก package ผ่าน IPC socket, **ack เร็วที่สุด** (แค่ enqueue ในหน่วยความจำ + เขียนลง buffer ทันที ไม่รอ sign/upload เสร็จ)
2. **Sign event ทันทีตอนรับเข้า buffer** (ไม่ใช่ตอนจะ upload) — ตาม ADR-003 "Identity integrity" เพื่อให้ตรวจจับได้ถ้ามีคนแก้ไฟล์ buffer ทีหลัง
3. Encrypt buffer ที่เก็บบนดิสก์ (ADR-003 "Local buffer protection")
4. Hash-chain ทุก entry ใน buffer (ADR-003 "Detection" — ตรวจจับการลบ/แก้ entry เก่า)
5. Upload ไป `ai-usage-backend` (`submit-event`) เป็น batch พร้อม retry/backoff เมื่อ network มีปัญหา
6. กวาดไฟล์ fallback ที่ package เขียนไว้ตอน daemon ไม่ทำงาน (self-healing)

## Identity: ทำไม implementation จริงต้องใช้ OS keychain ไม่ใช่ไฟล์ธรรมดา

โค้ดใน `src/identity/keystore.ts` มี `FileKeyStore` เป็น **reference implementation ที่ใช้งานได้จริงสำหรับ dev/test** แต่ **ไม่ใช่สิ่งที่ควร deploy จริงตาม ADR-003** — production ต้องเปลี่ยนไปใช้:
- macOS: Keychain Services (ผ่าน `keytar` หรือ native binding)
- Windows: Credential Manager (ผ่าน `keytar`)
- Linux: Secret Service API / libsecret (ผ่าน `keytar`)

เหตุผลที่ยังใส่ `FileKeyStore` ไว้: (1) ทดสอบ logic ที่เหลือทั้งหมดได้จริงโดยไม่ต้องพึ่ง native binding ที่ compile ยากในบาง environment (2) ใช้เป็น fallback สำหรับเครื่อง Linux headless ที่ไม่มี Secret Service — แต่ต้องแลกกับ private key ที่ **export ได้** (ผิดคุณสมบัติ non-exportable ที่ต้องการ) โค้ดจึงมี interface `KeyStore` แยกไว้ชัดเจนเพื่อสลับ implementation ได้โดยไม่แตะ logic อื่น

## SSO device-flow provisioning — ทำไมเป็นแค่ stub

การ login ผ่าน company IdP จริง (Okta/Azure AD/Google) ต้องผูกกับ OIDC app ที่ตั้งค่าเฉพาะขององค์กร (client_id, tenant, endpoint) ซึ่งเป็นรายละเอียดที่ generic ไม่ได้และต้องตั้งค่าจริงตอน deploy — `src/identity/provisioning.ts` จึงเป็น **interface + stub ที่ทำงานได้ (generate key pair จริง)** แต่ส่วน "ยืนยันตัวตนกับ IdP แล้วได้ developer_id กลับมา" ถูก mock ไว้ให้ทีมเติม endpoint จริงตอน integrate

## Buffer format

Append-only file, encrypt ทั้ง record ด้วย AES-256-GCM (key จาก KeyStore, คนละ key กับ signing key ตามที่ตกลงไว้) แต่ละ record มี `prevHash` อ้างอิง hash ของ record ก่อนหน้า — daemon ตรวจ chain ตอน sweep ทุกครั้ง ถ้าขาดช่วง (record ถูกลบ/แทรก) จะ log เป็น anomaly (ตาม ADR-003 "Detection", ไม่ block การทำงาน)

## Upload protocol

`POST /v1/events` (ตาม `domain-ai-usage-backend.yaml`) พร้อม `Authorization: Bearer <self-signed-jwt>` — JWT header/payload/signature สร้างเองด้วย Node `crypto` (ES256) ไม่พึ่ง library ภายนอกเพื่อลด dependency surface ของ daemon ที่ต้องรันตลอดเวลาบนเครื่อง dev ทุกคน

## Retry/backoff

Exponential backoff เริ่ม 1s สูงสุด 5 นาที ระหว่างรอ event ยังอยู่ใน encrypted buffer (ไม่หาย) — เมื่อ upload สำเร็จค่อยลบ record ออกจาก buffer

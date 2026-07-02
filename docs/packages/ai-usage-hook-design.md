# Package design: @mycompany/ai-usage-hook

ต่อยอดจาก ADR-003 (Hook governance) และ `domain-local-agent.yaml` — นี่คือรายละเอียด implementation-level ของ **thin package** ที่ hook ของแต่ละ tool เรียก

## หลักการออกแบบ (ยึดจาก ADR-003)

1. **บางที่สุดเท่าที่จะทำได้** — package ไม่ resolve identity, ไม่ sign, ไม่ persist อะไรถาวร งานหนักทั้งหมดอยู่ที่ **daemon** ที่รันค้างอยู่แล้ว
2. **ห้าม block CLI ของ dev เด็ดขาด** — exit code ต้องเป็น `0` เสมอไม่ว่าข้างในจะเกิดอะไรขึ้น (ดูเหตุผลด้านล่าง)
3. **เร็วที่สุดเท่าที่จะทำได้** — spawn เป็น process ใหม่ทุกครั้งที่ hook ยิง (โดยเฉพาะ `UserPromptSubmit` ที่ถี่มาก) ต้องมี overhead ต่ำสุด: ไม่ import dependency หนัก, ไม่ทำ network call เอง (แค่ local IPC)
4. **Fail-open เสมอ**: daemon ไม่ทำงาน → เขียนไฟล์ fallback ไว้ ไม่ throw, ไม่ retry แบบ blocking

## ทำไม exit code ต้องเป็น 0 เสมอ

Hook mechanism ของบาง tool ใช้ exit code เพื่อตัดสินใจว่าจะ **block การทำงานของ tool ต่อหรือไม่** (เช่น pre-action hook ที่ non-zero exit อาจทำให้ tool หยุด) เนื่องจาก package นี้เป็นแค่ **telemetry** ไม่ใช่ policy gate จึงต้อง**ไม่มีทางทำให้ CLI ของ dev ทำงานไม่ได้** แม้ daemon จะล่ม, network มีปัญหา, หรือ parse payload ไม่ได้ — ทุก error ถูก catch แล้ว exit 0 เงียบๆ (มี debug log แยกถ้าต้องการ troubleshoot)

> **หมายเหตุ**: รายละเอียดที่แน่นอนว่า hook ของ Claude Code/Codex/OpenCode ตัวไหนใช้ exit code แบบ blocking จริงๆ ควรเช็คกับ docs ของแต่ละ tool ก่อน implement เพราะเป็นรายละเอียดที่เปลี่ยนได้เร็ว — แต่หลักการ "exit 0 เสมอ" ปลอดภัยไว้ก่อนไม่ว่า mechanism จริงจะเป็นแบบไหน

## Protocol: package ↔ daemon

**Transport**: Unix domain socket (macOS/Linux) ที่ `~/.mycompany-ai-usage/daemon.sock`, หรือ named pipe บน Windows (`\\.\pipe\mycompany-ai-usage-daemon`)

**Message format**: newline-delimited JSON บรรทัดเดียวต่อ event — package เขียนแล้วรอ ack สั้นๆ (timeout รวม ~200ms) แล้วปิด connection ทันที ไม่ค้างรอ

```
→ package writes:  {"tool":"claude_code","hookEvent":"session_stop","fields":{...},"receivedAt":"..."}
← daemon acks:     {"ok":true}
```

**ถ้า daemon ไม่ตอบภายใน timeout หรือ socket ไม่มีอยู่**: package เขียน event ลงไฟล์ fallback ที่ `~/.mycompany-ai-usage/pending/<uuid>.json` แทน — daemon จะกวาดไฟล์เหล่านี้ตอน start ครั้งถัดไป (self-healing ตามที่ออกแบบไว้)

## Division of labor: package vs daemon

| งาน | ทำที่ package | ทำที่ daemon |
|---|---|---|
| Parse tool-specific hook payload → canonical field names | ✅ (ผ่าน adapter) | |
| Identity resolution (local-agent key) | | ✅ |
| Signing event | | ✅ |
| Buffering ระยะยาว + retry ตอน backend ล่ม | | ✅ |
| ส่งจริงไปหา `ai-usage-backend` (submit-event) | | ✅ |
| Fallback file ตอน daemon ไม่ตอบ | ✅ (ชั่วคราวเท่านั้น) | ✅ (กวาดไฟล์ตอน start) |

## โครงสร้าง package

```
@mycompany/ai-usage-hook/
├── package.json
├── tsconfig.json
├── README.md
└── src/
    ├── types.ts              # shape ของ NormalizedUsageFields (ก่อนเข้า daemon)
    ├── ipc-client.ts         # เชื่อมต่อ daemon ผ่าน socket, timeout, fallback
    ├── fallback-store.ts     # เขียน/อ่านไฟล์ fallback ในเครื่อง
    ├── adapters/
    │   ├── index.ts          # registry: ชื่อ tool → adapter function
    │   ├── claude-code.ts
    │   ├── codex.ts
    │   └── opencode.ts
    └── cli.ts                # entrypoint จริงที่ hook เรียก (bin)
```

เพิ่ม adapter ใหม่ = เพิ่มไฟล์ใน `adapters/` แล้ว register ใน `index.ts` — ไม่ต้องแตะ `cli.ts`, `ipc-client.ts`, หรือ daemon เลย (ตรงกับ hexagonal pattern ที่ตกลงกันไว้)

## การเรียกจาก hook config

```jsonc
// ตัวอย่าง hook entry ที่ adapter generator (จาก hook provisioning pipeline) สร้างให้
{
  "command": "npx --package=@mycompany/ai-usage-hook@1.2.0 ai-usage-hook claude-code session_stop"
}
```

**Pin version เสมอ** (`@1.2.0` ไม่ใช่ `@latest`) — การอัปเดต logic ทำโดยเปลี่ยนเลข version ใน canonical manifest แล้ว regenerate hook config ผ่าน adapter generator ไม่ใช่ปล่อยให้ทุกเครื่อง auto-update พร้อมกัน (ลดความเสี่ยง supply-chain และทำให้ rollout ควบคุมได้เป็นขั้นตอน)

## package.json ที่เกี่ยวข้อง

```json
{
  "name": "@mycompany/ai-usage-hook",
  "version": "1.0.0",
  "publishConfig": { "registry": "https://npm.internal.mycompany.com" },
  "bin": { "ai-usage-hook": "./dist/cli.js" },
  "engines": { "node": ">=18" },
  "files": ["dist"]
}
```

และทุกเครื่อง dev ต้องมี `.npmrc` ที่ผูก scope `@mycompany` กับ private registry เท่านั้น (กัน dependency confusion ตามที่คุยไว้ใน ADR-003):
```
@mycompany:registry=https://npm.internal.mycompany.com
```

## Debug mode

ไม่พิมพ์อะไรลง stdout/stderr ตามปกติ (อาจไปปนกับ output ของ tool) — เปิด debug ได้ผ่าน env var:
```
AI_USAGE_DEBUG=1
```
เขียน log ลงไฟล์ `~/.mycompany-ai-usage/debug.log` แทนการพิมพ์ออกจอ

## Self-test mode

```
npx @mycompany/ai-usage-hook --self-test
```
เช็คว่า daemon ตอบสนองไหม โดยไม่ส่ง event จริง — ใช้ตอน onboarding หรือ troubleshoot ว่าทำไม event ไม่ขึ้น dashboard

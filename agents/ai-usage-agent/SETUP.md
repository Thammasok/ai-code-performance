# ai-usage-agent Setup Guide

This guide covers installation, configuration, and usage of the ai-usage-agent daemon.

## Overview

The ai-usage-agent is a local daemon that:
- Receives usage events from `@mycompany/ai-usage-hook` via IPC
- Signs events with ES256 for authenticity
- Buffers events locally with encryption and tamper detection
- Uploads events to the backend with JWT authentication

## Prerequisites

- Node.js 18+
- Backend server running (see `backend/ai-usage-backend/`)
- `@mycompany/ai-usage-hook` installed in your AI CLI tools

## Installation

```bash
cd agents/ai-usage-agent
npm install
npm run build
```

## Directory Structure

The agent stores data in `~/.mycompany-ai-usage/`:

```
~/.mycompany-ai-usage/
├── keys/
│   ├── signing.key    # ES256 private key (auto-generated)
│   ├── signing.pub    # ES256 public key (auto-generated)
│   └── buffer.key     # AES-256 encryption key (auto-generated)
├── identity.json      # Developer identity (after provisioning)
├── buffer.enc         # Encrypted event buffer
├── daemon.sock        # Unix socket (Linux/macOS)
└── pending/           # Fallback files from hook (when daemon unreachable)
```

On Windows, the IPC socket is a named pipe: `\\.\pipe\mycompany-ai-usage-daemon`

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `AI_USAGE_BACKEND_URL` | Yes | Backend endpoint (e.g., `http://localhost:8080/v1/events`) |
| `AI_USAGE_DEV_DEVELOPER_ID` | No | Override developer ID for dev/test (bypasses SSO) |

### Developer Registration

Before the agent can upload events, the developer's public key must be registered with the backend.

#### Option 1: Dev/Test Mode (Manual Registration)

```bash
# 1. Start the agent once to generate keys
AI_USAGE_BACKEND_URL=http://localhost:8080/v1/events node dist/index.js
# Press Ctrl+C after "Generated new ES256 signing key pair"

# 2. Register the public key with backend
cd backend/ai-usage-backend
cargo run --bin register_developer -- <developer-uuid> ~/.mycompany-ai-usage/keys/signing.pub

# 3. Start agent with the registered ID
export AI_USAGE_BACKEND_URL=http://localhost:8080/v1/events
export AI_USAGE_DEV_DEVELOPER_ID=<developer-uuid>
node dist/index.js
```

#### Option 2: Production (SSO Flow)

Production deployment requires implementing `registerWithCompanyIdp()` in `src/identity/provisioning.ts` to integrate with your company's IdP (Okta/Azure AD/Google). See ADR-003 for requirements.

## Running the Agent

### Development

```bash
export AI_USAGE_BACKEND_URL=http://localhost:8080/v1/events
export AI_USAGE_DEV_DEVELOPER_ID=<your-uuid>
node dist/index.js
```

### Production (systemd)

Create `/etc/systemd/user/ai-usage-agent.service`:

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
systemctl --user enable ai-usage-agent
systemctl --user start ai-usage-agent
```

### Production (Windows Service)

Use [node-windows](https://www.npmjs.com/package/node-windows) or run as a scheduled task at login.

## Testing

### 1. Verify Agent is Running

Check the socket exists:

```bash
# Linux/macOS
ls -la ~/.mycompany-ai-usage/daemon.sock

# Windows (PowerShell)
Get-ChildItem \\.\pipe\ | Where-Object { $_.Name -like "*mycompany*" }
```

### 2. Send Test Event via Hook

```bash
cd packages/ai-usage-hook
node dist/cli.js claude_code user_prompt_submit '{"model":"claude-3-opus","tokensInput":100,"tokensOutput":50}'
```

### 3. Verify Upload

Check agent logs for:
```
Uploaded event <event-id>
```

Or query the database directly:
```sql
SELECT * FROM usage_events ORDER BY created_at DESC LIMIT 5;
```

### 4. Test Offline Resilience

1. Stop the backend
2. Send events via hook (they'll buffer locally)
3. Start the backend
4. Watch agent logs for batch upload

## Troubleshooting

### Agent won't start

**Error:** `AI_USAGE_BACKEND_URL is required`
- Set the environment variable before starting

**Error:** `EADDRINUSE` on socket
- Another agent instance is running
- Kill it: `pkill -f ai-usage-agent` or delete stale socket

### Events not uploading

**Error:** `Auth failed (401)`
- Developer's public key not registered with backend
- JWT expired (check system clock sync)
- Wrong `AI_USAGE_DEV_DEVELOPER_ID`

**Error:** `Network error`
- Backend unreachable (events will buffer and retry)
- Check `AI_USAGE_BACKEND_URL` is correct

### Hash chain broken warning

```
WARNING: buffer hash chain broken at record X — possible tampering
```

This indicates the buffer file was modified outside the agent. The agent continues but logs this warning. Investigate if unexpected.

### Hook not connecting

**Error in hook:** `ECONNREFUSED` or `ENOENT`
- Agent not running
- Socket path mismatch (check platform-specific path)

**Hook falls back to file:**
- Normal behavior when daemon unreachable
- Files in `~/.mycompany-ai-usage/pending/` are swept on agent start

## Security Notes

1. **Private keys**: `signing.key` and `buffer.key` have mode 0600 (owner-only)
2. **FileKeyStore limitation**: Keys stored as files on disk. For production, implement OS keychain backend (see `keystore.ts` comments)
3. **Buffer encryption**: AES-256-GCM protects event data at rest
4. **JWT expiry**: 5-minute validity window; requires synchronized clocks

## Architecture Reference

```
┌─────────────────┐     IPC      ┌─────────────────┐     HTTPS    ┌─────────────────┐
│ ai-usage-hook   │─────────────▶│ ai-usage-agent  │─────────────▶│ ai-usage-backend│
│ (in CLI tool)   │              │ (local daemon)  │   + JWT      │ (Rust/Axum)     │
└─────────────────┘              └─────────────────┘              └─────────────────┘
                                        │
                                        ▼
                                 ~/.mycompany-ai-usage/
                                 ├── keys/
                                 ├── buffer.enc
                                 └── identity.json
```

See `DESIGN.md` for detailed architecture and `docs/overview/adr/` for design decisions.

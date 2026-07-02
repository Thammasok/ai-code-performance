# @mycompany/ai-usage-hook

Thin hook client that AI CLI tools call to report usage to the internal
telemetry system. See [`DESIGN.md`](./DESIGN.md) for the full design
rationale (this is a companion to ADR-003 and
`docs/contracts/domain-local-agent.yaml`).

## What this package does — and does not — do

- Parses each tool's hook payload into a normalized shape (`src/adapters/`)
- Forwards it to the local daemon over a local socket, with a strict
  timeout
- Falls back to a local file if the daemon is unreachable
- **Always exits 0** — this is telemetry, never a gate on the developer's
  actual tool use

It does **not** resolve developer identity, sign events, retry against the
backend, or hold any long-lived credential. That's the daemon's job.

## Install

Not published to public npm — configure your `.npmrc` first:

```
@mycompany:registry=https://npm.internal.mycompany.com
```

## Usage (called by hook config, not run manually)

```
ai-usage-hook <tool> <hookEvent>   # payload piped in on stdin
```

```
echo "$HOOK_PAYLOAD" | npx --package=@mycompany/ai-usage-hook@1.0.0 ai-usage-hook claude_code session_stop
```

## Self-test

```
npx @mycompany/ai-usage-hook --self-test
AI_USAGE_DEBUG=1 npx @mycompany/ai-usage-hook --self-test   # to see the result
```

## Adding support for a new tool

1. Add `src/adapters/<tool>.ts` exporting an `Adapter` function
2. Register it in `src/adapters/index.ts`
3. Add the tool name to `SupportedTool` in `src/types.ts`

Nothing else changes.

## Build

```
npm run build
```

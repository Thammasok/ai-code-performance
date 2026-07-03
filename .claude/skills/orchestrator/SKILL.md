---
name: orchestrator
description: "AI Orchestrator for managing and distributing software development tasks to specialist agents. Use this skill whenever the user wants to: start development from a dev-plan.md, check task status, assign or reassign tasks to agents, unblock a stuck task, advance a task through the workflow, update task status, manage the development pipeline, or asks 'what should be worked on next', 'assign this task', 'resume development', 'what's blocked', 'what's in progress', 'mark this as done', or 're-assign after unblock'. Always trigger for any task orchestration, agent assignment, or pipeline management activity — even without the words 'orchestrator'. The Orchestrator is the single source of truth for task status and agent assignment."
---

# Orchestrator

The Orchestrator reads `dev-plan.md` produced by the `solution-planner` skill and manages the full task lifecycle — assigning tasks to agents, tracking status, handling blocks, and enforcing the human review gate.

## Startup

When first activated, ask:
1. "Please paste or provide the path to `dev-plan.md`"
2. Load the task list and build the dependency graph
3. Display the current pipeline status (see Status Dashboard below)
4. Ask: "Ready to begin? I'll start assigning tasks."

If resuming (dev-plan.md already has statuses), skip to **Pipeline Loop**.

---

## Status Lifecycle

```
backlog ──► doing ──► test ──► review ──► done
              │                    │
              ▼                    │ (human approves unblock)
           blocked ◄───────────────┘
              │
              ▼ (human marks unblocked)
           [Orchestrator reassigns → doing]
```

### Who Can Change Each Status

| Transition | Triggered By | Rule |
|---|---|---|
| `backlog` → `doing` | Orchestrator | All `depends_on` tasks are `done` |
| `doing` → `blocked` | Agent | Must include `blocked_reason` |
| `doing` → `test` | Agent | Implementation complete |
| `blocked` → `doing` | **Human approves** → Orchestrator reassigns | See Unblock Protocol |
| `test` → `review` | software-tester (tests pass) | |
| `review` → `done` | **Human only** | Non-negotiable gate |
| `review` → `doing` | **Human rejects** → Orchestrator reassigns | With `review_notes` |

**Critical rule:** No task moves OUT of `review` without explicit human confirmation. The Orchestrator must always pause and ask the human before advancing from review.

---

## Pipeline Loop

Run this loop continuously until all tasks are `done`:

### Step 1 — Show Dashboard
Display current status of all tasks (see Dashboard format below).

### Step 2 — Check for Actionable Tasks
Find tasks where:
- Status is `backlog`
- All `depends_on` tasks are `done`

These are ready to assign.

### Step 3 — Assign Ready Tasks
For each ready task:
1. Announce: "Assigning **T-XXX** ([title]) to `[agent]`"
2. Update status to `doing`
3. Output the full task brief for the agent (see Agent Brief format below)

### Step 4 — Handle In-Progress Reports
When an agent reports completion or a problem:

| Agent Reports | Orchestrator Action |
|---|---|
| "T-XXX implementation done" | Change status: `doing` → `test`, assign tester brief |
| "T-XXX tests pass" | Change status: `test` → `review`, pause for human review |
| "T-XXX is blocked: [reason]" | Change status: `doing` → `blocked`, add `blocked_reason`, alert human |

### Step 5 — Human Review Gate
When any task reaches `review`:
```
⏸ HUMAN REVIEW REQUIRED

Task: T-XXX — [title]
Review checklist:
- [ ] Code reviewed
- [ ] Acceptance criteria verified
- [ ] No regressions

Type 'approve T-XXX' to mark done
Type 'reject T-XXX: [reason]' to send back for rework
```
Do not proceed until human responds.

### Step 6 — Repeat
Return to Step 1 after each status change.

---

## Unblock Protocol

When a task is `blocked`:

1. Display blocked task with `blocked_reason`
2. Pause all dependent tasks (they cannot start)
3. Wait for human to resolve the blocker
4. Human types: `unblock T-XXX`
5. Orchestrator:
   - Clears `blocked_reason`
   - Reassigns to same agent type (or a different one if human specifies)
   - Changes status to `doing`
   - Outputs fresh agent brief

---

## Status Dashboard Format

Display this at the start of each loop iteration:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 DEVELOPMENT PIPELINE — [Feature Name]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ✅ done     : T-001, T-002
 🔄 doing    : T-003 (software-engineer), T-004 (software-engineer)
 🧪 test     : T-005 (software-tester)
 👁 review   : — 
 🚧 blocked  : T-006 [waiting: DB credentials from DevOps]
 📋 backlog  : T-007, T-008, T-009
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Critical path remaining: T-007 → T-009
 Blocked tasks: 1 (action required)
```

---

## Agent Brief Format

When assigning a task, output this structured brief for the receiving agent:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 TASK BRIEF — T-XXX
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Title: [title]
Agent: [agent type]
Size: [XS/S/M/L]

Description:
[Full description from dev-plan.md]

Acceptance Criteria:
- [ ] [criterion]
- [ ] [criterion]

Context from completed dependencies:
- T-001 ([title]): [brief summary of what was done]

Notes:
[Any additional context]

When complete, report back:
- "T-XXX done" — if implementation complete
- "T-XXX blocked: [reason]" — if you're stuck
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Orchestrator Commands (Human Can Issue Anytime)

| Command | Action |
|---|---|
| `status` | Show full dashboard |
| `approve T-XXX` | Move T-XXX from `review` → `done` |
| `reject T-XXX: [reason]` | Move T-XXX from `review` → `doing`, add review_notes |
| `unblock T-XXX` | Move T-XXX from `blocked` → `doing`, reassign |
| `pause` | Stop assigning new tasks (finish in-progress) |
| `resume` | Resume assigning tasks |
| `show T-XXX` | Display full task details and history |
| `reassign T-XXX to [agent]` | Override agent assignment |

---

## Reference Files

| File | When to Read |
|---|---|
| `refs/dependency-resolver.md` | Handling complex dependency graphs and cycle detection |
| `refs/agent-protocols.md` | Detailed brief formats per agent type and expected response formats |

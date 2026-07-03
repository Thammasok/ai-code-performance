---
name: solution-planner
description: "Expert Solution Planner for software projects — runs a structured 3-phase pipeline (Requirements Gathering → System Design → Development Plan) and produces machine-readable artifacts for downstream AI agents to consume. Use this skill whenever the user mentions: requirements, user stories, functional spec, system design, architecture, ERD, API design, task breakdown, development plan, sprint plan, WBS, or asks to 'plan a feature', 'design a system', 'break down this project', 'create a dev plan', 'gather requirements', 'define scope', 'plan a sprint', or 'prepare tasks for development'. Always trigger for any project planning, scoping, or architecture task — even without the words 'solution planner'. Each phase produces a standalone artifact (requirements.md, design.md, dev-plan.md) so work can be paused and resumed at any phase boundary. For test case design, use software-tester-design after this skill."
---

# Solution Planner

A 3-phase pipeline that takes a feature or project idea from raw input to a machine-readable development plan ready for an AI Orchestrator to distribute to developer agents.

## How to Use This Skill

Work through phases **sequentially**. Each phase ends with a saved artifact. You can stop after any phase and resume later by loading the artifact.

```
Phase 1: Requirements Gathering       →  artifact: requirements.md
Phase 2: System Design                →  artifact: design.md
Phase 3: Development Plan + Tests     →  artifact: dev-plan.md  ← Orchestrator reads this
         (test cases embedded per task — TDD ready)
```

Before starting, ask the user:
1. Are we starting fresh (Greenfield) or adding to an existing system?
2. Which phase do we start from? (if resuming, ask them to paste the last artifact)
3. What is the feature/project in one sentence?

---

## Phase 1 — Requirements Gathering

**Goal:** Produce a complete, unambiguous requirements artifact.

**Steps:**
1. Run a structured elicitation session (see `refs/requirements-guide.md` for techniques)
2. Identify: actors, use cases, functional requirements, non-functional requirements, constraints, out-of-scope
3. Surface and resolve ambiguities before moving on
4. Write `requirements.md`

**Output contract** → `requirements.md`:
```markdown
# Requirements: [Feature/Project Name]
version: 1.0 | status: draft | date: YYYY-MM-DD

## Actors
- [Actor]: [role description]

## Use Cases
- UC-001: [title] — [description]

## Functional Requirements
- FR-001: [requirement]

## Non-Functional Requirements
- NFR-001: [type]: [requirement]

## Constraints
- [constraint]

## Out of Scope
- [item]
```

✅ **Phase gate:** Confirm with user before proceeding. Save artifact.

---

## Phase 2 — System Design

**Goal:** Translate requirements into a concrete technical design.

**Steps:**
1. Read `requirements.md` (or ask user to paste it)
2. Select appropriate design patterns and architectural decisions (see `refs/design-patterns.md`)
3. Produce: component diagram, data model, API contracts, key decisions with rationale
4. Write `design.md`

**Output contract** → `design.md`:
```markdown
# System Design: [Feature/Project Name]
version: 1.0 | status: draft | date: YYYY-MM-DD
requires: requirements.md v1.0

## Architecture Overview
[diagram in mermaid or ASCII]

## Components
- [Component]: [responsibility]

## Data Model
[ERD or table definitions]

## API Contracts
### [Endpoint]
- Method: 
- Path: 
- Request: 
- Response: 
- Errors: 

## Key Decisions
| Decision | Options Considered | Chosen | Rationale |
|---|---|---|---|

## Dependencies
- [external service/library]: [why needed]
```

✅ **Phase gate:** Confirm with user before proceeding. Save artifact.

---

## Phase 3 — Development Plan + Test Design

**Goal:** Break design into concrete, assignable tasks — each bundled with pre-designed test cases so the software-engineer agent can practice TDD from the first line of code.

**Steps:**
1. Read `requirements.md` + `design.md` (or ask user to paste them)
2. Decompose into tasks using WBS (see `refs/task-breakdown.md`)
3. For every `software-engineer` task, design test cases covering Unit, Integration, and API layers (see `refs/test-design-guide.md`)
4. Embed test cases directly inside each task — engineer sees tests before writing code
5. Assign agent types, set dependencies, initialize all statuses to `backlog`
6. Write `dev-plan.md`

**TDD principle:** Test cases define the contract. The engineer's job is to write code that makes them pass — not to interpret acceptance criteria subjectively.

**Output contract** → `dev-plan.md`:
```markdown
# Development Plan: [Feature/Project Name]
version: 1.0 | status: active | date: YYYY-MM-DD
requires: design.md v1.0

## Summary
- Total tasks: N
- Estimated effort: X days
- Critical path: T-001 → T-003 → T-007

## Tasks

### T-001
- title: [short title]
- description: [what needs to be done and why]
- agent: software-engineer
- depends_on: []
- status: backlog
- size: S | M | L
- acceptance_criteria:
  - [ ] [binary, testable criterion]
- test_cases:
    unit:
      - id: TC-U-001
        scenario: [what behaviour is being tested]
        given: [precondition / input state]
        when: [action or function call]
        then: [expected output or side effect]
        test_data:
          input: [concrete value or object]
          expected: [concrete expected result]
      - id: TC-U-002
        scenario: [edge case or error path]
        given: [precondition]
        when: [action]
        then: [expected error or boundary behaviour]
        test_data:
          input: [value]
          expected: [error type or message]
    integration:
      - id: TC-I-001
        scenario: [cross-component interaction being tested]
        given: [system state, mocked dependencies if any]
        when: [trigger / call sequence]
        then: [expected system-level outcome]
        test_data:
          input: [object or payload]
          expected: [db state, event emitted, or response]
    api:
      - id: TC-A-001
        scenario: [happy path description]
        method: GET | POST | PUT | DELETE | PATCH
        path: /api/v1/[resource]
        headers:
          Authorization: Bearer [test-token]
        request_body: [JSON or null]
        expected_status: 200
        expected_response: [JSON structure or key fields]
      - id: TC-A-002
        scenario: [error path — e.g. unauthenticated]
        method: POST
        path: /api/v1/[resource]
        headers: {}
        request_body: [JSON]
        expected_status: 401
        expected_response:
          error: "Unauthorized"
- notes: [optional context, gotchas, known edge cases]

### T-002
- title: [short title]
- description: [what needs to be done]
- agent: software-tester
- depends_on: [T-001]
- status: backlog
- size: S | M | L
- acceptance_criteria:
  - [ ] [all TC-* from T-001 pass]
  - [ ] coverage >= [threshold]%
- notes: Run all test cases defined in T-001. Report pass/fail per TC-id.

## Status Legend
| Status   | Changed By         | Meaning                              |
|----------|--------------------|--------------------------------------|
| backlog  | Orchestrator       | Ready, waiting to be picked up       |
| doing    | Orchestrator/Agent | Agent actively working               |
| blocked  | Agent              | Stuck, needs human intervention      |
| test     | Agent              | Dev done, needs testing              |
| review   | Agent/Tester       | Human must review before advancing   |
| done     | Human              | Approved and complete                |
```

✅ **Phase gate:** Confirm with user. This artifact is the Orchestrator's entry point.

---

## General Guidelines

- Always validate that acceptance criteria are testable before finalizing tasks
- Flag any task with no clear acceptance criteria — don't proceed until resolved
- `blocked` tasks must include a `blocked_reason` field explaining what's needed
- For Greenfield projects: create tasks for project setup, CI/CD, and environments first
- For existing systems: include a discovery/audit task as T-001 before any implementation tasks

## Reference Files

| File | When to Read |
|---|---|
| `refs/requirements-guide.md` | Phase 1 — elicitation techniques and templates |
| `refs/design-patterns.md` | Phase 2 — architecture and design decision frameworks |
| `refs/task-breakdown.md` | Phase 3 — WBS, sizing, and task writing guide |
| `refs/test-design-guide.md` | Phase 3 — test scenario design, TC format, test data strategy per layer |

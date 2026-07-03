# Task Breakdown Guide

## WBS (Work Breakdown Structure) Approach

Break work top-down:
```
Feature
├── Setup & Infrastructure (if Greenfield)
├── Data Layer (migrations, models, repositories)
├── Business Logic (services, domain logic)
├── API Layer (endpoints, validation, serialization)
├── Frontend / UI (if applicable)
├── Integration (connect to external services)
└── Testing (unit, integration, E2E — as separate tasks)
```

---

## Task Sizing Guide

| Size | Effort | Rule of Thumb |
|---|---|---|
| XS | < 1 hour | Config change, env var, trivial fix |
| S | 1–3 hours | Single endpoint, single model, simple component |
| M | 3–8 hours | Feature slice (model + service + API) |
| L | 1–2 days | Complex feature, multiple integrations |
| XL | > 2 days | Must be broken down further — don't ship as one task |

**Rule:** If a task is XL, split it. No task assigned to an agent should exceed L.

---

## Task Writing Rules

### Good Task Checklist
- [ ] Title is a verb phrase: "Create user authentication endpoint" not "Auth"
- [ ] Description explains WHAT and WHY, not HOW (agent decides how)
- [ ] Acceptance criteria are binary (pass/fail, not subjective)
- [ ] Dependencies are explicit task IDs
- [ ] Agent type is correct (software-engineer, software-tester, or reviewer)
- [ ] No task blocks itself (circular dependencies checked)

### Acceptance Criteria Writing
Each criterion should be independently verifiable:

✅ Good:
- "Returns 401 when no Bearer token is provided"
- "Response time < 200ms for GET /users under 50 concurrent requests"
- "All unit tests pass with >80% coverage on the service layer"

❌ Bad:
- "Works correctly"
- "Looks good"
- "Performance is acceptable"

---

## Agent Assignment Guide

| Agent | Assign When |
|---|---|
| `software-engineer` | Implement code: models, services, APIs, UI, migrations |
| `software-tester` | Write and run tests: unit, integration, E2E |
| `reviewer` | Human review gate — code review, UAT, security review |

**Testing task rule:** Every implementation task (M or larger) should have a corresponding `software-tester` task that depends on it.

**Review task rule:** Place a `reviewer` task before any task that:
- Changes authentication or authorization logic
- Modifies production data schema
- Integrates with external payment or sensitive systems
- Closes a major user-facing feature

---

## Dependency Rules

- `doing` requires all `depends_on` tasks to be `done`
- Orchestrator enforces this — do not mark dependencies manually
- A task can depend on multiple tasks: `depends_on: [T-001, T-003]`
- Avoid long chains — aim for parallel paths where possible

## Critical Path Identification

List the longest dependency chain — this is the minimum delivery time.
Example:
```
T-001 (DB migration) → T-003 (User service) → T-007 (Auth API) → T-012 (E2E test)
= 4 sequential tasks = ~2 days minimum
```

Everything not on the critical path can run in parallel to save time.

---

## Task Template (complete)

```markdown
### T-XXX
- title: [Verb phrase describing the task]
- description: |
    [What needs to be done and why.
    Include relevant context from design.md — component name,
    API endpoint, data model changes. Don't describe HOW to implement.]
- agent: software-engineer
- depends_on: [T-001, T-002]
- status: backlog
- size: S | M | L
- acceptance_criteria:
  - [ ] [Binary, testable criterion]
  - [ ] [Binary, testable criterion]
- notes: |
    [Optional: edge cases, known gotchas, links to design decisions]
```

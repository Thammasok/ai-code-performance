# Agent Protocols

Detailed brief formats and expected response contracts per agent type.

---

## software-engineer

### Brief Format
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ENGINEERING TASK — T-XXX  [TDD]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Title: [title]
Size: [S/M/L]

What to implement:
[description — what and why, not how]

Technical context:
- Stack: [from design.md]
- Relevant component: [component name from design.md]
- Data model changes: [migrations needed, if any]
- API contract: [endpoint spec if applicable]

Acceptance Criteria:
- [ ] [binary criterion]

━━ TDD: Write tests first, then make them pass ━━

Unit Tests:
  TC-U-001 | [scenario]
    Given : [precondition]
    When  : [action]
    Then  : [expected output]
    Data  : input=[value] expected=[value]

  TC-U-002 | [edge case scenario]
    Given : [precondition]
    When  : [action]
    Then  : [expected error or boundary behaviour]
    Data  : input=[value] expected=[error type]

Integration Tests:
  TC-I-001 | [scenario]
    Given : [system state / mocked deps]
    When  : [trigger]
    Then  : [system-level outcome]
    Data  : input=[object] expected=[db state or event]

API Tests:
  TC-A-001 | [happy path scenario]
    [METHOD] [path]
    Headers : [auth header if required]
    Body    : [request JSON]
    Expect  : [status] + [response shape]

  TC-A-002 | [error path scenario]
    [METHOD] [path]
    Body    : [invalid or missing fields]
    Expect  : [error status] + [error message]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Completed dependencies summary:
- T-001: [what was built, key interfaces to use]

TDD workflow:
  1. Read all TC-* above before writing any code
  2. Write test stubs for each TC-*
  3. Run tests → confirm they all FAIL (red)
  4. Implement code to make tests pass (green)
  5. Refactor if needed, ensure tests still pass

Response when done:
  "T-XXX done: [one-line summary] | tests: [pass count]/[total] passing"
Response if blocked:
  "T-XXX blocked: [specific reason — missing info, credential, unclear requirement]"
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Expected Completions
- All TC-* test cases written and passing
- No broken existing tests
- Self-review against acceptance criteria completed
- Test results summary included in done report

---

## software-tester

### Brief Format
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 TESTING TASK — T-XXX
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Title: [title]
Verifying: T-YYY ([implementation task title])

What was implemented:
[Summary of T-YYY — what was built]

Run and verify all test cases from T-YYY:

Unit: TC-U-001, TC-U-002, ...
Integration: TC-I-001, ...
API: TC-A-001, TC-A-002, ...

Additional test scope (if any):
- Regression: [existing tests that must still pass]
- Coverage threshold: >= [X]% on [component]

Response when tests pass:
  "T-XXX tests pass: [TC-U: X/X] [TC-I: X/X] [TC-A: X/X] | coverage: X%"
Response if a test fails:
  "T-XXX fail: [TC-id] — [what failed and why] | T-YYY needs rework"
Response if blocked:
  "T-XXX blocked: [reason]"
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Expected Completions
- Every TC-* from T-YYY verified: explicit pass or fail per ID
- Coverage report attached if threshold is set
- Clear pass/fail summary in response message

---

## reviewer (Human)

### Review Prompt Format
```
⏸ HUMAN REVIEW REQUIRED — T-XXX

[title]

What was done:
[Summary of implementation + test results]

Please verify:
- [ ] Code is readable and follows project conventions
- [ ] Acceptance criteria are genuinely met (not just technically passing)
- [ ] No security concerns introduced
- [ ] No performance regressions
- [ ] Documentation updated if needed

Commands:
  approve T-XXX          → mark done, unblock dependents
  reject T-XXX: [notes]  → send back for rework with notes
```

### What Orchestrator Does with Response

**approve T-XXX:**
- Status → `done`
- Update `dev-plan.md`
- Check if any blocked or backlog tasks are now unblocked
- Resume pipeline loop

**reject T-XXX: [notes]:**
- Add `review_notes` field to task
- Status → `doing`
- Re-issue engineering brief with review notes prepended:
  ```
  ⚠️ REWORK REQUIRED
  Review feedback: [notes]
  [original brief below]
  ```

---

## Blocked Task Escalation

When a task has been `blocked` for more than the session (human hasn't responded):

1. Re-surface in every dashboard with `⚠️ ACTION NEEDED`
2. Include the `blocked_reason` prominently
3. Suggest possible resolutions if inferrable:
   - Missing credentials → "Check with DevOps / env config"
   - Unclear requirement → "Return to solution-planner Phase 1"
   - External dependency → "Track in blockers log"

Never auto-unblock or skip a blocked task.

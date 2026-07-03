# Requirements Gathering Guide

## Elicitation Techniques

### 1. The 5W1H Frame (start here)
Ask these before anything else:
- **Who** uses this? (actors, personas)
- **What** do they need to do? (use cases)
- **When** does this happen? (triggers, frequency)
- **Where** does this run? (web, mobile, API, background job)
- **Why** does this matter? (business value, problem being solved)
- **How** do they do it today? (current workaround, if any)

### 2. Use Case Walkthrough
For each actor, walk through a happy path scenario step by step:
"Tell me exactly what [actor] does from the moment they [trigger] to when they see [outcome]."
Then probe for: alternative paths, error cases, edge cases.

### 3. Constraint Mining
Explicitly ask:
- Performance: "How fast must this respond? Under what load?"
- Security: "What data is sensitive? Who should NOT see it?"
- Compatibility: "What browsers/devices/OS must this support?"
- Integration: "What existing systems must this connect to?"
- Compliance: "Any legal, regulatory, or audit requirements?"

### 4. Out-of-Scope Declaration
Always explicitly define what is NOT included. This prevents scope creep.
Ask: "What related things might people assume are included but are NOT?"

---

## Ambiguity Resolution Checklist

Before closing Phase 1, verify no ambiguities remain:

- [ ] Every requirement has exactly one interpretation
- [ ] All actors are named and their permissions defined
- [ ] Success criteria are measurable (not "fast" — say "< 200ms p99")
- [ ] All integrations with external systems are named
- [ ] Data ownership and retention policy is clear
- [ ] Error handling expectations are stated

---

## Common Requirement Anti-Patterns (flag and resolve these)

| Anti-Pattern | Example | Fix |
|---|---|---|
| Vague quality | "should be fast" | "p99 latency < 300ms under 100 concurrent users" |
| Assumed actor | "the user can..." | "the authenticated admin user can..." |
| Implicit dependency | "show the report" | "show the report, fetched from the reporting service via REST API" |
| Gold-plating | "and also maybe..." | Mark as out-of-scope or separate requirement |
| Conflicting reqs | FR-003 contradicts FR-007 | Surface conflict, get explicit decision |

---

## Requirements Template (quick fill)

```markdown
## Actors
- Guest User: unauthenticated visitor
- Member: authenticated user with standard access
- Admin: authenticated user with full system access

## Use Cases
- UC-001: [Actor] [does action] so that [outcome]
- UC-002: ...

## Functional Requirements
- FR-001: The system SHALL [behavior] when [condition]
- FR-002: The system SHALL NOT [behavior] unless [condition]

## Non-Functional Requirements
- NFR-001: Performance — [metric and threshold]
- NFR-002: Security — [requirement]
- NFR-003: Availability — [uptime SLA]

## Constraints
- Must use existing PostgreSQL database
- Must deploy to existing Kubernetes cluster
- No new third-party paid services without approval

## Out of Scope
- Mobile app (web only for v1)
- Reporting and analytics dashboard
- Email notifications
```

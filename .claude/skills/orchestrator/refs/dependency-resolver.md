# Dependency Resolver

How the Orchestrator resolves task dependencies and detects problems.

---

## Dependency Graph Rules

### Ready-to-assign criteria (ALL must be true):
1. Task status is `backlog`
2. Every task ID in `depends_on` has status `done`
3. No circular dependency exists involving this task

### Blocked propagation:
- When T-003 becomes `blocked`, any task that `depends_on: [T-003]` cannot start
- Display these as "waiting on T-003" in the dashboard — do NOT mark them `blocked`
- They remain `backlog` until T-003 is `done`

---

## Cycle Detection

Before starting any session, check for circular dependencies:

**Algorithm:**
```
For each task T:
  Walk the depends_on chain
  If you encounter T again → CYCLE DETECTED
```

**If cycle found:**
```
⚠️ DEPENDENCY CYCLE DETECTED

T-003 → T-005 → T-008 → T-003

This plan cannot execute. Please return to solution-planner 
Phase 3 to fix the task breakdown before proceeding.
```

Never attempt to proceed with a cyclic dependency graph.

---

## Parallel Execution

The Orchestrator should assign ALL ready tasks simultaneously, not one at a time.

Example:
```
T-001 done
T-002 done

Ready: T-003 (depends on T-001), T-004 (depends on T-002), T-005 (depends on T-001, T-002)

→ Assign T-003, T-004, and T-005 all at once in the same turn
```

Show all assignments in a single dashboard update:
```
🔄 Assigning 3 tasks:
  T-003 → software-engineer
  T-004 → software-engineer  
  T-005 → software-tester
```

---

## Dependency Summary Table

Build this at startup for quick reference:

```
Task   | Depends On      | Blocks          | Status
-------|-----------------|-----------------|--------
T-001  | —               | T-003, T-004    | done
T-002  | —               | T-004           | done
T-003  | T-001           | T-005           | doing
T-004  | T-001, T-002    | T-005           | backlog
T-005  | T-003, T-004    | —               | backlog
```

Update this table every time any status changes.

---

## Critical Path Calculation

**Critical path** = longest chain of dependent tasks (by count or estimated effort).

At startup, calculate and display:
```
Critical path: T-001 → T-003 → T-005
Estimated minimum time: [sum of sizes on critical path]
```

Tasks NOT on the critical path can run in parallel and won't delay delivery if they finish on time. Prioritize critical path tasks when there's a choice.

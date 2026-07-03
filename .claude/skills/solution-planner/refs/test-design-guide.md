# Test Design Guide

Test cases are designed in Phase 3 alongside task breakdown — before any code is written.
The engineer reads these tests first and writes code to make them pass (TDD).

---

## Test Layers

Every `software-engineer` task must have test cases across the relevant layers:

| Layer | What It Tests | When Required |
|---|---|---|
| **Unit** | Single function / class in isolation | Always — every task |
| **Integration** | Multiple components working together | When task touches 2+ components or DB |
| **API** | HTTP endpoints end-to-end | When task implements or modifies an endpoint |

If a layer is not applicable (e.g., a pure migration task has no API layer), write `n/a` with a reason.

---

## Test Case ID Convention

```
TC-U-XXX   → Unit test
TC-I-XXX   → Integration test
TC-A-XXX   → API test

Number sequentially per task: TC-U-001, TC-U-002, TC-U-003 ...
Across the full dev-plan, IDs must be globally unique.
```

---

## Unit Test Design

**Goal:** Test one function or method at a time. No DB, no network, no filesystem.

### Techniques to apply:
- **Equivalence Partitioning** — pick one representative value per valid class
- **Boundary Value Analysis** — test at the edges (0, max, empty, null)
- **Error Guessing** — what inputs would a real engineer forget to handle?

### Mandatory scenarios per function:
1. Happy path (valid input → expected output)
2. Empty / null / zero input
3. Invalid type or out-of-range value
4. Edge: minimum valid value
5. Edge: maximum valid value

### Template:
```yaml
- id: TC-U-001
  scenario: returns hashed password for valid plain text input
  given: plain text password "Secret123!"
  when: hashPassword("Secret123!") is called
  then: returns a bcrypt hash string starting with "$2b$"
  test_data:
    input: "Secret123!"
    expected: "string matching /^\\$2b\\$/"

- id: TC-U-002
  scenario: throws error when password is empty string
  given: empty string ""
  when: hashPassword("") is called
  then: throws ValidationError with message "Password cannot be empty"
  test_data:
    input: ""
    expected:
      error: ValidationError
      message: "Password cannot be empty"
```

---

## Integration Test Design

**Goal:** Test that two or more components work correctly together — with real DB or real service calls where possible, otherwise realistic mocks.

### Common integration scenarios:
- Service calls Repository → data is correctly persisted and retrieved
- Event emitted by one service is received and handled by another
- Transaction rolls back correctly on failure mid-sequence
- Cache is populated on first call, served on second call

### Template:
```yaml
- id: TC-I-001
  scenario: user registration persists user and returns created entity
  given: empty users table, valid registration payload
  when: UserService.register({ email, password, name }) is called
  then: |
    - new user row exists in DB with hashed password
    - returned object contains id, email, name, created_at
    - password field is NOT returned
  test_data:
    input:
      email: "test@example.com"
      password: "Secret123!"
      name: "Test User"
    expected:
      db_row: { email: "test@example.com", name: "Test User" }
      response_excludes: ["password", "password_hash"]

- id: TC-I-002
  scenario: duplicate email registration fails with conflict error
  given: user with email "test@example.com" already exists
  when: UserService.register({ email: "test@example.com", ... }) is called
  then: throws ConflictError, no new DB row created
  test_data:
    input:
      email: "test@example.com"
    expected:
      error: ConflictError
      db_row_count: 1  # still only 1 row
```

---

## API Test Design

**Goal:** Test the full HTTP request-response cycle — routing, middleware, validation, serialization, status codes.

### Mandatory scenarios per endpoint:
1. Happy path — valid request → correct status + response shape
2. Missing required field → 400
3. Unauthenticated request → 401
4. Unauthorized (wrong role) → 403 (if RBAC applies)
5. Resource not found → 404 (for GET/PUT/DELETE by ID)
6. Conflict / duplicate → 409 (for POST creating unique resource)
7. Invalid data type or format → 422

### Template:
```yaml
- id: TC-A-001
  scenario: POST /auth/register — happy path creates user and returns 201
  method: POST
  path: /api/v1/auth/register
  headers:
    Content-Type: application/json
  request_body:
    email: "newuser@example.com"
    password: "Secret123!"
    name: "New User"
  expected_status: 201
  expected_response:
    id: "[any uuid]"
    email: "newuser@example.com"
    name: "New User"
  response_must_exclude:
    - password
    - password_hash

- id: TC-A-002
  scenario: POST /auth/register — missing email returns 400
  method: POST
  path: /api/v1/auth/register
  headers:
    Content-Type: application/json
  request_body:
    password: "Secret123!"
    name: "New User"
  expected_status: 400
  expected_response:
    error: "Validation failed"
    field: "email"

- id: TC-A-003
  scenario: POST /auth/register — duplicate email returns 409
  method: POST
  path: /api/v1/auth/register
  headers:
    Content-Type: application/json
  request_body:
    email: "existing@example.com"
    password: "Secret123!"
    name: "Existing User"
  expected_status: 409
  expected_response:
    error: "Email already registered"
```

---

## Test Data Strategy

### Principles:
- Use **concrete, literal values** — not placeholders like `[some string]`
- Test data must be **deterministic** — same input always produces same expected output
- For IDs returned by the system, assert on shape/type not exact value: `"[any uuid]"` or `typeof === 'string'`
- For timestamps, assert existence not exact value: `created_at !== null`
- Sensitive fields (passwords, tokens) — assert they are NOT present in responses

### Fixture naming convention:
```
validUser       → standard valid case
minimalUser     → only required fields, all optional omitted
duplicateUser   → already exists in DB
invalidUser     → missing required fields or wrong types
adminUser       → has elevated permissions
guestUser       → unauthenticated / no token
```

---

## Test Design Checklist (before finalizing a task)

- [ ] Every acceptance criterion has at least one test case covering it
- [ ] At least one negative/error path test case exists per function/endpoint
- [ ] All test data values are concrete (no vague placeholders)
- [ ] TC IDs are globally unique across the dev-plan
- [ ] Integration tests specify DB/mock state in `given`
- [ ] API tests specify headers (especially auth) explicitly
- [ ] No test case tests more than one behaviour (single assertion focus)

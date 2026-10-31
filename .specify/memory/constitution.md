# Book Space Constitution

## Core Principles

### I. Server-Side Enforcement

No business rule that protects data may exist only in the client. Every authorisation
decision, validation rule and domain constraint MUST be enforced by the API. The UI MAY
duplicate a rule to improve the experience, but the API is the authority and the UI copy
is an optimisation that can be removed without changing what the system permits.

Concretely:

- A capability in the matrix in `spec.md` §3 is enforced by a guard on the endpoint, not
  by hiding a control.
- A write endpoint validates its own input. It MUST NOT rely on the caller having
  validated first.
- Ownership checks (for example "a staff member may edit only bookings they created") are
  server-side comparisons of identity, never a value supplied by the client.

Rationale: the legacy application enforced rights in the client. Any user could call the
Firebase API directly and bypass them. This principle exists because the rewrite's main
purpose is to close that hole; a rule enforced only in the UI is a rule that does not
exist.

Verified by: integration tests asserting the forbidden and unauthorised outcome for each
role, per endpoint. A capability with no such test is unverified, not "obviously working".

### II. Test-First for Domain Logic (NON-NEGOTIABLE)

Domain logic is written test-first. This covers conflict detection, cyclical booking
expansion, report aggregation, permission checks and input validation.

The repository cannot run a literal red-green cycle against code that does not exist yet,
so "test-first" is defined operationally as:

- A task that implements domain logic is not complete until its tests exist and pass.
- A task that changes behaviour changes a test. Changing behaviour with no test change is
  a defect, not a refactor.
- A test that asserts only that a module was constructed (`expect(service).toBeDefined()`)
  is not a test of behaviour and does not satisfy this principle.
- Tests are written against real code paths. A mock is permitted only where a real
  dependency is genuinely unavailable, and the reason is stated at the mock.

Rationale: conflict detection and cyclical expansion encode rules that were previously
enforced by hand and are the rules the business is most exposed to getting wrong. They
are also pure functions, so they are cheap to test and have no excuse.

Verified by: the coverage thresholds in Principle III and the review of every task that
touches a domain module.

### III. Measured Coverage

Coverage MUST be measured over all source files, not only over the files a test happens
to import. A coverage figure that a file with no tests can improve is not a measurement.

The targets are:

- **80 %** of the domain modules (bookings, conflicts, reports, authorisation), as
  required by `SC-008`.
- **100 %** statements and branches on files added or modified by a change.
- A **ratchet**: the global threshold is set to the measured value when the threshold is
  introduced and MUST NOT be lowered. It is raised as phases land.

Coverage is enforced by a configured threshold that fails the build, not by inspection.

Rationale: without a threshold, a coverage number is advisory and drifts. The ratchet
exists because applying a 100 % rule to code that a planned phase will rewrite produces
tests that are deleted, which is effort spent to no end. Applying it to new and changed
code is durable.

Verified by: `coverageThreshold` in each Jest configuration, and CI failing when a
threshold is not met.

### IV. Single Source of Truth for Types

Shared request and response types live in `libs/models` and are consumed by both
applications. A type describing an API payload MUST NOT be declared independently in
`apps/ui` and `apps/server`.

Rationale: the two halves of the system are written against the same contract. When the
shape is declared twice, they drift, and the failure appears at runtime in the UI rather
than at compile time.

Verified by: the shared `@models/*` path mapping in `tsconfig.base.json`, and review
rejecting a duplicated payload interface.

### V. Reversible Migration

The legacy Firebase project stays intact and readable until reconciliation passes. No
step of the migration may delete or mutate legacy data, and no cut-over may happen before
the reconciliation counts in `SC-003` agree.

Rationale: the legacy data is the only copy of the municipality's booking history. A
migration that can lose it is not a migration.

Verified by: reconciliation counts comparing legacy and migrated records, and the
continued availability of the legacy project until those counts pass.

## Security and Data Protection Constraints

- **No secrets in the client bundle.** Database credentials, the JWT secret and any
  mail-service identifier come from server-side configuration. `SC-007` requires that
  none is present in the built client assets, and CI scans the bundle to prove it.
- **No secrets in the repository.** `apps/server/.env` is never committed;
  `.env.example` is the template. Values that were committed historically are rotated,
  not merely deleted, because deletion does not revoke them.
- **Authentication uses short-lived tokens.** The legacy 15-minute inactivity auto-logout
  is explicitly not required (removed in legacy issue #70).
- **Personal data is minimised in public responses.** The public booking read path
  exposes only accepted, non-archived bookings, with `personName`, `personEmail`,
  `personPhone` and `comments` removed.
- **Validation errors do not disclose more than necessary.** Authentication failures do
  not reveal whether an e-mail address exists.
- **User-facing copy is Polish; code and the API are English.** Copy is centralised so it
  can be translated later (`NFR-005`).

## Development Workflow and Quality Gates

- **Spec-driven.** A feature begins as a specification, then a plan, then tasks. Work that
  is not traceable to a task in `specs/*/tasks.md` is out of scope until it is written
  down.
- **CI is the gate.** `main` is protected by the `OpenHandsBookSpace` ruleset, which
  requires a pull request and the single `CI` check. `CI` aggregates lint, unit tests,
  build and the client-bundle secret scan. Do not list the sub-checks individually.
- **No phase is complete on the strength of a passing build.** A phase's completion
  criteria are its tests and its acceptance criteria, not that CI is green.
- **Conventions documents are binding.** `specs/001-booking-platform-rewrite/ui-conventions.md`
  and `backend-conventions.md` fix how each half of the system is written. A deviation is a
  decision to amend the document, not a local exception.
- **Complexity is justified in writing.** A new dependency, abstraction or layer is
  introduced with a stated reason, in the change that introduces it.

## Governance

- **Authority.** This constitution supersedes other development practices. Where a
  convention document, a task description or a review comment conflicts with it, this
  document prevails and the other artefact is amended.
- **Amendment procedure.** An amendment is proposed as a change to
  `.specify/memory/constitution.md` in a pull request, with the rationale and the
  migration impact for any existing work stated in the description. Amendment requires
  the repository owner's approval.
- **Versioning policy.** The version is semantic: MAJOR for a backward-incompatible
  removal or redefinition of a principle, MINOR for a new principle or materially
  expanded guidance, PATCH for clarifications that do not change obligations.
- **Compliance review.** Every pull request is checked against these principles. A
  reviewer may fail a change that violates one. Where a principle is mechanically
  enforceable — lint, a coverage threshold, a CI job — the mechanism is preferred over
  review discipline, and a principle that can be mechanised SHOULD be, in a follow-up.
- **Runtime guidance.** `AGENTS.md` carries the operational detail: build commands, the
  layout, and the constraints that are easy to get wrong. It is subordinate to this
  document.

**Version**: 1.0.0 | **Ratified**: 2026-10-31 | **Last Amended**: 2026-10-31

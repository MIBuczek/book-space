# Requirements Quality Checklist — Book Space rewrite

## Completeness

- [x] CHK001 Every legacy route, view and feature is inventoried — see `gap-analysis.md` §1
- [x] CHK002 Every legacy data operation has a target API operation — see `contracts/openapi.yaml`
- [x] CHK003 Roles and their capabilities are enumerated — `spec.md` §3, `contracts/authorization-matrix.md`
- [x] CHK004 All twelve facilities and four cities are listed with their rentable sizes — `spec.md` §4
- [x] CHK005 Non-functional requirements cover security, validation, testing, i18n, accessibility, compatibility, observability, performance and maintainability — `spec.md` §6.2
- [x] CHK006 Key entities and their relationships are defined — `spec.md` §6.3, `data-model.md`
- [x] CHK007 Open questions are listed and marked for clarification — `spec.md` §9

## Clarity and testability

- [x] CHK008 Every functional requirement is written as a testable "MUST" statement
- [x] CHK009 Every user story has an independent test and acceptance scenarios in Given/When/Then form
- [x] CHK010 Success criteria are measurable and technology-agnostic
- [x] CHK011 Edge cases are enumerated, including cyclical bookings, DST, year boundaries and legacy defaults

## Consistency

- [x] CHK012 The capability matrix matches the legacy permission helpers
- [x] CHK013 The API contract's enums match the data model's enums
- [ ] CHK014 The booking status vocabulary is reconciled: legacy `QUIT` → target `CANCELED`, and one Polish label must be chosen (currently "Rezygnacja" vs "Odwołana")
- [ ] CHK015 The payment-method enum is reconciled: target must retain `FREE` (Bezpłatne) and decide whether `CARD` is needed
- [ ] CHK016 Client and facility delete routes are corrected to `:_id`
- [ ] CHK017 Password hashing is applied on update paths, not only on create

## Coverage of known defects

- [x] CHK018 Over-permissive user endpoints are recorded and assigned a requirement
- [x] CHK019 Public exposure of personal booking fields is recorded and assigned a requirement
- [x] CHK020 Committed credentials are recorded and assigned a requirement
- [x] CHK021 The dead PDF, auto-logout and modal-type paths are recorded so they are not reproduced
- [x] CHK022 Duplicated option-generation and date-formatting helpers are recorded for consolidation

## Traceability

- [x] CHK023 Every gap in `gap-analysis.md` §2 links to a requirement identifier
- [x] CHK024 Every requirement traces to a legacy feature or a documented gap
- [ ] CHK025 Open questions 1–9 are answered before the corresponding tasks are scheduled

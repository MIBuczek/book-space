# Tasks: Internationalisation and De-branding

**Input**: Design documents from `specs/004-internationalisation/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/)

**Organization**: tasks are grouped by user story. `[P]` marks tasks that can run in parallel
(different files, no dependency).

**Path conventions**: the translation library is `libs/i18n/`; the data is
`apps/ui/src/assets/i18n/`; the UI is `apps/ui/src/app/`; the server is `apps/server/src/app/`.

## Phase 0 — Research (done)

- [x] **T200** Library choice, fallback, de-branding surface — see `research.md` R1–R10.

## Phase 1 — The translation layer (foundation)

**Purpose**: the library, the provider and the data. Blocks everything else.

- [x] **T210** `libs/i18n` project: `project.json` (test/lint, like `libs/copy`), `jest.config.ts`,
      `src/index.ts`, `src/lib/languages.ts` (the list + default + storage key).
- [x] **T211** [P] `src/lib/language.store.ts`: a signal store (`language()`, `set()`,
      `available()`), persisting to `localStorage`.
- [x] **T212** [P] `src/lib/translate.providers.ts`: `provideAppI18n()` wrapping
      `provideTranslateService` + the HTTP loader + the initializer.
- [x] **T213** Add `@ngx-translate/core` and `@ngx-translate/http-loader` to `package.json`
      (Angular-22-compatible); `yarn install`.
- [x] **T214** Generate `apps/ui/src/assets/i18n/pl.json` from `libs/copy`'s `COPY` (a mechanical
      transform, grouped by surface, `{{param}}` for the interpolations).
- [x] **T215** Translate `pl.json` into `apps/ui/src/assets/i18n/en.json`.
- [x] **T216** Wire `provideAppI18n()` into `apps/ui/src/app/app.config.ts`.
- [x] **T217** Specs for `libs/i18n`: the store (set/persist/validate), the provider, and
      `translations.spec.ts` (key completeness + interpolation — FR-006, SC-003).

## Phase 2 — The language switch (User Story 1)

- [x] **T220** `apps/ui/src/app/shell/language-switch.component.ts`: a labelled `<select>` bound
      to the store; accessible (aria-label, keyboard).
- [x] **T221** Host it in the shell (`apps/ui/src/app/app.component.ts` or the nav/footer).
- [x] **T222** Spec: switching changes the rendered DOM and persists (FR-003, FR-004, SC-001).
- [x] **T223** [P] Sync `document.documentElement.lang` with the active language (accessibility).

## Phase 3 — Migrate the consumers (User Story 1)

**Purpose**: replace every `COPY.x` read with a `translate` key. The compiler drives this.

- [~] **T230** Migrate the shell: `nav.component.ts` and `footer.component.ts` are done
      (with the language switch, T220–T223); `navigation.ts` moves with the admin frame (T232),
      because `admin-shell.component.ts` renders its label.
- [ ] **T231** [P] Migrate the public features: `public-calendar`, `booking-request`,
      `informational/*`.
- [ ] **T232** [P] Migrate the admin features: `bookings`, `clients`, `users`, `facilities`,
      `summary`, `admin-shell`, `admin-tab-placeholder`.
- [ ] **T233** Migrate `sign-in`.
- [ ] **T234** Replace `libs/copy/src/lib/copy.spec.ts` with the completeness spec; **delete**
      `libs/copy` and its `project.json`; remove it from any `tsconfig` path alias.
- [ ] **T235** Update the migrated component specs to assert against the translation (or a test
      translation stub).
- [ ] **T236** Confirm `nx build ui` compiles (no stale `COPY` import) and the UI coverage
      threshold is met.

## Phase 4 — Retarget the guard (User Story 3)

- [ ] **T240** Rewrite `no-hardcoded-copy.spec.ts` from a Polish-character check to a
      user-facing-literal check (FR-012); a spec proves it fails on a literal.
- [ ] **T241** Fix any literal the retargeted guard finds.

## Phase 5 — De-branding (User Story 2)

> **Status (issue #189).** The *static* de-branding landed as a standalone slice before the i18n
> layer: the previous tenant's brand is gone from shipped source (identifiers, UI copy, e-mail
> signature, defaults and fixtures) and `tools/scan-brand.js` guards it in CI. That covers
> **T253**, **T254**, **T255**, **T256** and the rename half of **T250**
> (`SISK_CONTACT_EMAIL` → `TENANT_STAFF_EMAIL`, `TENANT_NAME` added). What remains here is the
> *configurable* design — the tenant model and `GET /api/tenant` (**T251**) and the UI reading
> the tenant rather than the hardcoded `Book Space` values (**T252**) — plus the rest of
> **T250** (`TENANT_CONTACT_EMAIL`, `TENANT_WEBSITE_URL`, `TENANT_PRIVACY_URL`).

- [ ] **T250** `env.validation.ts`: add `TENANT_NAME`, `TENANT_CONTACT_EMAIL`, `TENANT_WEBSITE_URL`,
      `TENANT_PRIVACY_URL`; rename `SISK_CONTACT_EMAIL` → `TENANT_STAFF_EMAIL`; update
      `.env.example`.
- [ ] **T251** [P] `libs/models/tenant.model.ts`: `ITenant`; a `GET /api/tenant` route (public)
      returning the public subset.
- [ ] **T252** [P] The UI reads the tenant and renders the footer/contact from it; an absent value
      hides the element (SC-005).
- [ ] **T253** `apps/server/src/app/notification/templates/templates.ts`: the signature is
      `TENANT_NAME`, not "SISK Siechnice"; update the template spec.
- [ ] **T254** [P] `apps/server/src/app/reporting/deny-list.ts`: empty default; update the spec.
- [ ] **T255** [P] Confirm `apps/server/src/app/buildings/seed/facility-seed.ts` carries no SISK
      brand (decision 5: the sample facilities stay as they are).
- [ ] **T256** Replace the SISK test fixtures (`@sisk.pl`, `admin@sisk.pl`) with neutral addresses
      (`@example.com`) across the UI and server specs.
- [ ] **T257** `libs/copy`'s SISK values are gone with the library (Phase 3); confirm no
      replacement reintroduces a brand.
- [ ] **T258** A bundle scan in CI: `grep -ri "sisk\|siechnice" dist/apps/ui` fails the build
      (SC-002).

## Phase 6 — Docs and conventions

- [ ] **T260** `AGENTS.md`: the translation conventions (runtime JSON, key completeness, the
      retargeted guard), the tenant settings, the deny-list behaviour change.
- [ ] **T261** [P] `specs/001-booking-platform-rewrite/ui-conventions.md`: the i18n convention.
- [ ] **T262** [P] `README.md`: the tenant settings and how to add a language.
- [ ] **T263** Record the server-side Polish decision (decision 2, FR-015) in `AGENTS.md`; note
      that the documentation keeps the legacy provenance (decision 3).

## Dependencies

- Phase 1 → Phase 2/3: the provider and the JSON must exist before a component can translate.
- Phase 3 (T234) deletes `libs/copy`; every consumer must be migrated first (T230–T233).
- Phase 5 is independent of Phases 1–4 except T257 (the copy removal).

## Out of scope

- A path-segment language (`/en/...`) — the stored preference is chosen (decision 1).
- A server-side translation of the CSV/report/e-mail bodies — they stay Polish (decision 2);
  only the e-mail signature becomes the tenant name.
- Any change to the HTTP contract, the authorisation model or the domain rules.
- Replacing the facility sample data — it stays as it is (decision 5).

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

- [x] **T230** Migrate the shell: `nav.component.ts` and `footer.component.ts` are done
      (with the language switch, T220–T223); `navigation.ts` moves with the admin frame (T232),
      because `admin-shell.component.ts` renders its label.
- [x] **T231** [P] Migrate the public features: `public-calendar`, `booking-request`,
      `informational/*`.
- [x] **T232** [P] Migrate the admin features: `bookings`, `clients`, `users`, `facilities`,
      `summary`, `admin-shell`, `admin-tab-placeholder`.
- [x] **T233** Migrate `sign-in`.
- [x] **T234** Replace `libs/copy/src/lib/copy.spec.ts` with the completeness spec; **delete**
      `libs/copy` and its `project.json`; remove it from any `tsconfig` path alias. The
      completeness spec is `libs/i18n/src/lib/translations.spec.ts` (T217).
- [x] **T235** Update the migrated component specs to assert against the translation (or a test
      translation stub).
- [x] **T236** Confirm `nx build ui` compiles (no stale `COPY` import) and the UI coverage
      threshold is met.

## Phase 4 — Retarget the guard (User Story 3)

- [x] **T240** Rewrite `no-hardcoded-copy.spec.ts` from a Polish-character check to a
      user-facing-literal check (FR-012); a spec proves it fails on a literal. The walk reads
      only the `template:` regions (a whole-file scan flags TypeScript generics), and two cases
      pin the rule by feeding it a literal and a translated/bound value.
- [x] **T241** Fix any literal the retargeted guard finds. It found one: the nav's hardcoded
      `Book Space` brand, now `nav.brand` with the name as an interpolation parameter.

## Phase 5 — De-branding (User Story 2)

> **Status (issue #189).** The *static* de-branding landed as a standalone slice before the i18n
> layer: the previous tenant's brand is gone from shipped source (identifiers, UI copy, e-mail
> signature, defaults and fixtures) and `tools/scan-brand.js` guards it in CI. That covers
> **T253**, **T254**, **T255**, **T256** and the rename half of **T250**
> (`SISK_CONTACT_EMAIL` → `TENANT_STAFF_EMAIL`, `TENANT_NAME` added). The *configurable* design
> has since landed too: the tenant model and `GET /api/tenant` (**T251**), the UI reading the
> tenant rather than the hardcoded `Book Space` values (**T252**), and the rest of **T250**
> (`TENANT_CONTACT_EMAIL`, `TENANT_WEBSITE_URL`, `TENANT_PRIVACY_URL`). **T258** is the one task
> left in this phase and it is blocked on a spec question (see below), not on implementation.

- [x] **T250** `env.validation.ts`: add `TENANT_NAME`, `TENANT_CONTACT_EMAIL`, `TENANT_WEBSITE_URL`,
      `TENANT_PRIVACY_URL`; rename `SISK_CONTACT_EMAIL` → `TENANT_STAFF_EMAIL`; update
      `.env.example`.
- [x] **T251** [P] `libs/models/tenant.model.ts`: `ITenant`; a `GET /api/tenant` route (public)
      returning the public subset. `TenantService` reads `ConfigService`; an absent or blank
      setting is `null` and the staff inbox is never read. `tenant.integration.spec.ts` pins the
      anonymous read and the absence of the inbox.
- [x] **T252** [P] The UI reads the tenant and renders the footer/contact from it; an absent value
      hides the element (SC-005). `TenantStore` is filled by an app initializer (a failure is
      swallowed, so the shell is never blanked); the nav brand, the footer, the contact page, the
      cookie notice and the server-error page read it. The catalogue's `contact.office.email`,
      `contact.office.website`, `contact.office.websiteHref`, `contact.websiteUrl` and
      `contact.privacyPolicyUrl` are retired with the move. The `@api/tenant` route and schema
      are in `contracts/openapi.yaml`.
- [x] **T253** `apps/server/src/app/notification/templates/templates.ts`: the signature is
      `TENANT_NAME`, not "SISK Siechnice"; update the template spec.
- [x] **T254** [P] `apps/server/src/app/reporting/deny-list.ts`: **removed entirely** (#195) — the
      Summary restriction is gone, not merely defaulted to empty; update the spec.
- [x] **T255** [P] Confirm `apps/server/src/app/buildings/seed/facility-seed.ts` carries no SISK
      brand (decision 5: the sample facilities stay as they are).
- [x] **T256** Replace the SISK test fixtures (`@sisk.pl`, `admin@sisk.pl`) with neutral addresses
      (`@example.com`) across the UI and server specs.
- [x] **T257** `libs/copy`'s SISK values are gone with the library (Phase 3); confirm no
      replacement reintroduces a brand.
- [x] **T258** A bundle scan in CI: the built `dist/apps/ui` fails the build if it carries the
      `SISK` brand or the `sisk-siechnice.pl` domain (SC-002). **Implemented by extending
      `tools/scan-bundle.js`**, not by a new `grep`: the pattern list lives in one script so the
      CI gate and a local run cannot drift, and the bundle scan already owns the client-bundle
      patterns. SC-002 was narrowed to the *brand tokens* — the original wording named `siechnice`
      too, but `siechnice` is the sample facilities' city name (`CITIES` in
      `libs/models/building.model.ts`) and legitimately reaches the client, so a `siechnice` check
      would fail a correct bundle (decision 5, AGENTS.md). `scan-brand.js` still guards the source
      tree (an identifier such as `SISK_CONTACT_EMAIL` never reaches a bundle); this is the bundle
      half.

## Phase 6 — Docs and conventions

- [x] **T260** `AGENTS.md`: the translation conventions (runtime JSON, key completeness, the
      retargeted guard), the tenant settings, the removal of the Summary deny-list (#195).
- [x] **T261** [P] `specs/001-booking-platform-rewrite/ui-conventions.md`: the i18n convention.
- [x] **T262** [P] `README.md`: the tenant settings and how to add a language.
- [x] **T263** Record the server-side Polish decision (decision 2, FR-015) in `AGENTS.md`; note
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

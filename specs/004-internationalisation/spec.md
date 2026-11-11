# Feature Specification: Internationalisation and De-branding

**Feature Branch**: `004-i18n-debranding`

**Created**: 2026-11-08

**Status**: Draft

**Input**: User description: "1. Remove all info about SISK. 2. Make a plan to implement i18n and
migrate all Polish content to `pl.json`. 3. Naming should always be English. 4. Create translation
with English. 5. Add a language switch."

## Context

The rewrite (feature `001`) centralised every user-facing string in one catalogue,
`libs/copy/src/lib/copy.ts` (T061, NFR-005), and added a guard spec
(`apps/ui/src/app/no-hardcoded-copy.spec.ts`) that fails on a Polish literal outside that
catalogue. That was the *preparation* for translation: one source, one place to translate.

This feature does the translation itself, and removes the municipality's branding:

1. The **copy catalogue becomes runtime data** (`pl.json`, `en.json`) loaded by a translation
   library, so a language can be switched without a rebuild and a second language needs no code.
2. An **English translation** is added alongside the Polish one.
3. A **language switch** lets a user choose the language, and the choice persists.
4. Every **SISK-specific reference is removed** from the product — the brand, the contact
   addresses, the facility seed data, the default deny-list — so the platform is a generic,
   unbranded booking system whose tenant is supplied by configuration.
5. **Naming is English throughout**: code identifiers, keys, filenames, environment variables
   and route paths are English (they already largely are); the Polish that remains is *content*,
   and it lives in the translation files, not in the code.

This is a UI feature with a small server-side component (the server-side artefacts that carry
Polish, and the tenant configuration that replaces the hardcoded brand). It does not change the
HTTP contract or the domain rules.

## Clarifications

### Session 2026-11-08

- Q: Which translation library? → **A: `@ngx-translate/core`** (18.x). It is the smallest fit:
  it loads a JSON file per language, works with a standalone/zoneless Angular app, and needs no
  build-time locale (which `@angular/localize` would, since it compiles one bundle per locale).
  Transloco is the alternative and is noted in `research.md`.
- Q: Which language is the default? → **A: Polish** (the current audience), with English
  selectable. The default is a setting, not a constant.
- Q: Does "naming should always be English" mean the *content* too? → **No.** It means
  identifiers, keys, filenames, env vars and routes. The content is Polish and English, in the
  translation files. A Polish word in `pl.json` is correct; a Polish word in a `.ts` identifier
  is not.
- Q: How far does "remove all info about SISK" go? → **A: the product carries no SISK value.**
  The brand, the contact e-mail/website/privacy-policy URLs, the facility seed addresses, the
  default deny-list address and the notification signature become **configuration** with neutral
  defaults. The repository *documentation* (`README.md`, `AGENTS.md`, `specs/`) still describes
  the legacy origin (`MIBuczek/sisk-booking-app`) — that is provenance, not product content, and
  removing it would falsify the history. See open question 3.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Switch the interface language (Priority: P1)

A visitor opens the application and can switch between Polish and English from a control in the
shell. The whole interface — navigation, forms, tables, buttons, notices, validation messages —
re-renders in the chosen language without a page reload. The choice survives a reload and a
return visit.

**Why this priority**: it is the user-visible half of the request ("create translation with
English", "add language switch"), and it is what proves the catalogue is really translatable.

**Independent Test**: load the app, switch to English, and walk the public calendar, the booking
form, the contact form and the sign-in page — every string is English. Reload; it is still
English. Switch back; every string is Polish.

**Acceptance Scenarios**:

1. **Given** the app is in Polish, **When** the user selects English, **Then** every visible
   string re-renders in English with no reload and no untranslated fallback.
2. **Given** the user selected English, **When** they reload or return later, **Then** the
   interface is still English.
3. **Given** a string exists in Polish but not in English, **When** the app renders in English,
   **Then** it shows the Polish value (a configured fallback), not the raw key.
4. **Given** the app is in English, **When** the user opens an admin table or a validation error,
   **Then** the column headers and the message are English.
5. **Given** the language switch, **When** a screen reader focuses it, **Then** it has an
   accessible label and announces the current language.

---

### User Story 2 - No SISK value ships in the product (Priority: P1)

The application contains no SISK brand, address, URL or facility e-mail. A deployment supplies
its own tenant identity through configuration; with nothing configured it shows a neutral product
name and no municipal links. The facility seed data is neutral or tenant-supplied.

**Why this priority**: it is an explicit requirement, and it is the prerequisite for the platform
being reusable by another tenant.

**Independent Test**: build the UI bundle and grep it for `sisk`/`siechnice` — no hit. Grep the
server source and the seed for the same — only the legacy provenance in documentation remains.
Boot the app with no tenant configuration and confirm it renders a neutral name and no broken
links.

**Acceptance Scenarios**:

1. **Given** the built UI bundle, **When** it is searched for `sisk` or `siechnice`,
   **Then** there is no match.
2. **Given** the application with no tenant configuration, **When** it renders, **Then** the
   footer shows the product name and no SISK link, and the contact page shows no SISK address.
3. **Given** the facility seed, **When** it runs, **Then** it contains no `@gmail.com` facility
   address and no SISK-specific name (the reference facilities are the municipality's, so they
   are configuration or a clearly-marked sample).
4. **Given** the notification templates, **When** a notification is sent, **Then** the signature
   is the configured tenant name, not "SISK Siechnice".
5. **Given** the default Summary deny-list, **When** no override is set, **Then** no specific
   person's address is denied (the legacy default is removed).

---

### User Story 3 - Add a third language without touching component code (Priority: P2)

A maintainer adds a new language by adding one JSON file and one entry in the language list. No
component, template or spec changes.

**Why this priority**: it is the proof that the translation is real rather than a second hardcoded
catalogue. It is P2 because it is a maintainer outcome, not a user one.

**Independent Test**: add `de.json` with a handful of keys, add it to the language list, and
switch to it — the keys that exist render, the rest fall back to the default, and no code changed.

**Acceptance Scenarios**:

1. **Given** a new `<lang>.json`, **When** it is added to the language list, **Then** the switch
   offers it and it renders.
2. **Given** the guard spec, **When** a component reintroduces a literal string, **Then** the
   spec fails (the guard is retargeted from "Polish characters" to "user-facing literal").

---

### Edge Cases

- **A missing key.** A key absent from the active language falls back to the default language,
  then to the key itself; a missing key is never a blank string (which hides the defect).
- **A missing key at build time.** A spec asserts that every key in the default language exists
  in every other language, so a partial translation fails CI rather than falling back silently in
  production.
- **Interpolation.** Keys with a value (`Wersja aplikacji ${version}`, the confirmation message
  that names a facility) must keep their parameters; a translation that drops a parameter is a
  test failure.
- **Pluralisation.** Polish has more plural forms than English; a count-bearing string must use
  the library's plural mechanism rather than a `count === 1 ?` in a component.
- **The guard spec.** `no-hardcoded-copy.spec.ts` currently flags Polish *characters*; once the
  copy is in JSON it must flag any user-facing literal, which is a stricter and language-agnostic
  rule.
- **Server-side Polish.** The CSV column labels, the report vocabulary and the notification
  templates are read outside the Angular bundle (a spreadsheet, an inbox). They cannot use the
  UI's translation library; the plan must decide whether they stay Polish, become configurable,
  or are translated server-side (open question 2).
- **Dates and numbers.** A locale implies a date and number format; `@booking/date-time` already
  formats through `Intl` with `Europe/Warsaw`. The switch must not silently change the
  facility's time zone — the language and the time zone are separate concerns.
- **The language in the URL.** Whether the language is a path segment (`/en/...`), a query
  parameter, or a stored preference affects shareable links and the SSR/caching story. The plan
  chooses the smallest option that satisfies the story.
- **The seed is authoritative.** `ReferenceDataService` `$set`s every field, so a rebranded seed
  overwrites an administrator's edits; the seed's tenant data must therefore be configuration,
  not a constant that flips with a release.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Every user-facing string MUST be loaded from a translation file at runtime, not
  compiled into a component or a TypeScript module.
- **FR-002**: The application MUST ship **Polish** and **English** translation files.
- **FR-003**: A **language switch** MUST be present in the shell, reachable by keyboard and
  screen reader, and MUST change the rendered language without a page reload.
- **FR-004**: The chosen language MUST persist across a reload and a return visit.
- **FR-005**: A missing key MUST fall back deterministically (active language → default language
  → key), never to an empty string.
- **FR-006**: A spec MUST fail when a key present in the default language is absent from another
  language file, and when a translation drops an interpolation parameter.
- **FR-007**: The product MUST carry **no SISK brand, address, URL, facility e-mail or personal
  address**. Tenant identity (name, contact e-mail, website, privacy-policy URL, the staff inbox,
  the seed facilities) MUST come from **configuration** with neutral defaults.
- **FR-008**: The facility seed MUST contain no SISK-specific or personal data; it is either
  neutral sample data or tenant-supplied configuration.
- **FR-009**: The default Summary deny-list MUST NOT name a specific person; an unset value denies
  nobody.
- **FR-010**: Notification templates MUST sign with the configured tenant name, not a hardcoded
  one.
- **FR-011**: Code identifiers, translation keys, filenames, environment variables and route
  paths MUST be **English**. Polish is content and lives only in the translation files.
- **FR-012**: The `no-hardcoded-copy` guard MUST be retargeted to catch any user-facing literal
  (language-agnostic), not only Polish characters.
- **FR-013**: Adding a language MUST require only a new JSON file and an entry in the language
  list — no component, template or spec change.
- **FR-014**: The language switch MUST NOT change the facility's time zone or the date/number
  formatting locale used for business data (the `Europe/Warsaw` behaviour is preserved).
- **FR-015**: The server-side artefacts that carry Polish (CSV labels, report vocabulary,
  notification templates) MUST be handled by an explicit decision — configurable, translated
  server-side, or documented as deliberately single-language — not left implicit.

### Key Entities *(include if feature involves data)*

- **Translation file** — one JSON document per language (`pl.json`, `en.json`), keyed by the
  catalogue's existing groups (`nav`, `footer`, `admin`, `calendar`, `bookingRequest`,
  `bookings`, `clients`, `users`, `facilities`, `summary`, `signIn`, `contact`, `cookieNotice`,
  `notFound`, `serverError`, `common`, `errors`, `validation`, `labels`).
- **Language** — a code (`pl`, `en`), a display name in its own language (`Polski`, `English`),
  and a flag for whether it is the default.
- **Tenant configuration** — the brand name, the contact e-mail, the website and privacy-policy
  URLs, the staff inbox, and the seed facility list. Server-side settings; a public subset
  reaches the UI (the footer and the contact page).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can switch between Polish and English and see every screen change, with no
  reload and no untranslated string.
- **SC-002**: The built UI bundle contains **no** `sisk` or `siechnice` string.
- **SC-003**: Every key in the default language exists in every other language file (enforced by
  a spec), so no screen silently falls back.
- **SC-004**: A new language can be added with one JSON file and one list entry, proven by doing
  it for a third language in the test.
- **SC-005**: The application renders a neutral product name and no municipal links when no
  tenant configuration is supplied.
- **SC-006**: The existing CI gate stays green: lint, unit tests (including the retargeted
  hardcoded-copy guard), build and the client-bundle secret scan.

## Assumptions

- The current audience is Polish; English is added, and the default remains Polish.
- The translation library is `@ngx-translate/core` (see Clarifications); Transloco is the
  documented alternative.
- The translation files are assets loaded at runtime (not compiled per-locale bundles), so one
  build serves every language.
- The tenant identity is server configuration; the UI reads the public subset from an endpoint
  (or a build-time/runtime config), not from a hardcoded constant.
- The server-side Polish artefacts are handled by the decision in open question 2; the plan
  proposes the smallest correct option.

## Open Questions

1. **Where does the language live?** The plan proposes a **stored preference** (a signal plus
   `localStorage`), with no path segment, so links are stable and the SPA stays a single bundle.
   A path segment (`/en/...`) is better for shareable language-specific links and for SEO; it is
   a larger change (every route and the guards). Confirm the stored-preference choice.
2. **Server-side Polish.** The CSV export, the printable report and the notification e-mails are
   read outside the browser. Options: (a) leave them Polish (documented), (b) make them
   **configurable per tenant** (a server translation file), (c) translate them by the same
   `Accept-Language` the request carries. The plan proposes **(a) for the report artefacts and
   (b) for the e-mail templates** (the tenant supplies the wording), because a spreadsheet and an
   inbox are the tenant's business artefacts, not the visitor's screen. Confirm.
3. **How much SISK remains in the repository documentation?** The plan removes SISK from the
   *product* and leaves the provenance in `README.md`/`AGENTS.md`/`specs/` (the legacy repo is
   named `MIBuczek/sisk-booking-app`). Removing it from the documentation would falsify the
   history; confirm that provenance stays.
4. **The tenant name and defaults.** The plan uses a neutral placeholder (`Book Space`) until a
   tenant is configured. Confirm the placeholder is acceptable, or supply the tenant name.
5. **The seed facilities.** The twelve facilities are the municipality's real facilities. The plan
   moves them to a tenant-supplied seed (or neutral sample data). Confirm which.

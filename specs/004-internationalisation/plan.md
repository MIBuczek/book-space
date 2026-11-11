# Implementation Plan: Internationalisation and De-branding

**Branch**: `004-i18n-debranding` | **Date**: 2026-11-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/004-internationalisation/spec.md`

## Summary

Two changes to the Angular UI, plus a small server-side configuration change:

1. **The copy catalogue becomes runtime translation data.** `libs/copy`'s single Polish `COPY`
   object (T061, NFR-005) is replaced by `pl.json` and `en.json` loaded by
   **`@ngx-translate/core`** (18.x). Components read strings through the `translate` pipe (or
   `TranslateService.instant`) instead of a static import, so a language switch re-renders without
   a rebuild.
2. **A language switch** in the shell changes the active language and persists the choice.
3. **SISK is removed from the product.** The brand, the contact addresses/URLs, the facility seed
   e-mails, the default Summary deny-list and the notification signature become **tenant
   configuration** with neutral defaults.

The change is bounded because the hard part is already done: the copy is centralised in one
object with a guard spec that stops literals creeping back. This feature is mostly *mechanical*
— turn that object into two JSON files and route the reads through a pipe — plus the de-branding,
which is a small set of named constants that become settings.

It is deliberately **not** a change to the HTTP contract, the authorisation model or the domain
rules: the server keeps returning English error messages, and the UI keeps mapping them (it
already never renders the server's `message` text — see `libs/copy`'s "API error localisation"
note).

## Technical Context

**Language/Version**: Node 24, TypeScript 6.0.3, Angular 22 (standalone, **zoneless**).

**Primary Dependencies**: `@ngx-translate/core` 18.x and `@ngx-translate/http-loader` 18.x (new).
Peer ranges: `@angular/core >= 18`, `rxjs >= 7` — both satisfied. No other runtime dependency.

**Storage**: translation JSON files, served as static assets from `apps/ui/src/assets/i18n/`.
The language preference is stored in `localStorage`.

**Testing**: Jest 30 (jest-preset-angular). The guard spec
(`apps/ui/src/app/no-hardcoded-copy.spec.ts`) is retargeted; a new spec asserts every default
key exists in every language; a new shell spec drives the language switch.

**Target Platform**: evergreen browsers; the existing `ui:build` produces one bundle for all
languages (runtime loading, not per-locale compilation).

**Project Type**: web application (unchanged).

**Constraints**: zoneless (a language change must be a signal write or a pipe that Angular marks
dirty); the `ui` coverage threshold is 100 % on every file, so every new file needs a spec; the
guard spec must stay meaningful; the client-bundle secret scan must stay green.

**Scale/Scope**: ~169 Polish strings in `libs/copy` (the bulk), ~35 server-side strings across
the templates, the CSV columns and the report vocabulary, and a handful of UI literals the guard
currently misses. Four to six new files, one new dependency, one retargeted spec.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | How this plan satisfies it |
|-----------|----------------------------|
| **I. Server-side enforcement** | Unchanged: this feature touches no rule. The server's English `message` stays English; the UI continues to map status → localised message rather than rendering the server's text. |
| **II. Test-first for domain logic** | The "domain logic" here is the translation layer (fallback order, key completeness, the switch's persistence) and it is test-first: the key-completeness spec and the switch spec are written with the implementation. |
| **III. Measured coverage** | The `ui` threshold is 100 % on every file. Every new file (the translate provider, the language store, the switch component) carries a spec; the existing `libs/copy` spec is replaced by the JSON-completeness spec. |
| **IV. Single source of truth for types** | The language list and the translation key shape live in one place (`libs/i18n`); a key is declared once and its absence from a language fails a spec. |
| **V. Reversible Migration** | Not applicable (no data migration), but the de-branding is reversible: the tenant values are configuration, so a SISK deployment re-supplies them without a code change. |
| **Security constraints** | The client-bundle secret scan must stay green: the tenant contact values are *public* contact details, not secrets, and they move from a constant to configuration; no secret is introduced. |

**Complexity Tracking**: one new dependency and one new library (`libs/i18n`), both justified by
the requirement (runtime, switchable translation). No new abstraction beyond the translation
layer the requirement asks for.

## Research Summary

Full detail in [research.md](./research.md). The decisions:

1. **Library: `@ngx-translate/core` 18.x**, not `@angular/localize` and not Transloco.
   `@angular/localize` compiles **one bundle per locale** and needs a build per language, which
   contradicts "switch at runtime"; Transloco is a fine alternative but heavier than this app
   needs. ngx-translate loads JSON at runtime and switches in place. *(ngx-translate.org,
   *Installation*: `provideTranslateService`, `provideTranslateHttpLoader`, `addLangs`, `use`.)*
2. **Runtime loading from assets**, not compiled bundles: one build serves every language.
3. **Default language Polish**, fallback Polish; English added. The default is a constant in one
   place, not a scattered assumption.
4. **The language preference is stored** (`localStorage`) and read at start-up, so a reload keeps
   it. No path segment (open question 1).
5. **De-branding = configuration.** A new `TENANT_*` settings group (server) and a public subset
   the UI reads; neutral defaults so an unconfigured deployment still renders.
6. **The guard spec is retargeted** from "Polish characters" to "user-facing literal", which is
   stricter and language-agnostic (the current rule would pass an English literal, and would pass
   a Polish *comment* is already excluded).
7. **Server-side Polish artefacts** are handled per open question 2: the report artefacts stay
   Polish (a spreadsheet is the tenant's business artefact) and the e-mail templates become
   tenant-configurable.

## Project Structure

### Documentation (this feature)

```text
specs/004-internationalisation/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output — library and de-branding decisions, with sources
├── data-model.md        # Phase 1 output — the translation file shape and the tenant config
├── contracts/           # Phase 1 output
│   ├── translations.md  #   the translation file contract (keys, fallback, pluralisation)
│   └── tenant.md        #   the tenant-configuration contract (what replaces SISK)
├── quickstart.md        # Phase 1 output — how to add a language, how to rebrand
└── tasks.md             # Phase 2 output (/speckit.tasks — NOT created here)
```

### Source Code (repository root) — the concrete layout

```text
# The translation library (new)
libs/i18n/
├── src/
│   ├── index.ts                       # barrel
│   └── lib/
│       ├── languages.ts               # the language list + default + storage key
│       ├── language.store.ts          # signal store: active language, persist, expose
│       └── translate.providers.ts     # provideAppI18n(): provideTranslateService + loader
├── project.json                       # test + lint targets (like libs/copy)
└── jest.config.ts

# The translation data (new — replaces the single COPY object)
apps/ui/src/assets/i18n/
├── pl.json                            # the Polish catalogue (migrated from libs/copy)
└── en.json                            # the English translation

# The UI (modified)
apps/ui/src/app/app.config.ts          # add provideAppI18n()
apps/ui/src/app/shell/
├── language-switch.component.ts       # NEW — the switch (a <select> with an aria-label)
└── shell.component.ts                 # host the switch in the header/footer
# every component that imported COPY now uses the translate pipe
libs/copy/                             # REMOVED (its spec is replaced by the JSON spec)

# The server (modified — de-branding)
apps/server/src/app/config/env.validation.ts   # TENANT_* settings, neutral defaults
apps/server/src/app/buildings/seed/            # the seed reads the tenant facility list
apps/server/src/app/notification/templates/    # the signature is the tenant name
apps/server/src/app/reporting/deny-list.ts     # the default deny-list is empty
```

**Structure Decision**: the translation layer is its own library (`libs/i18n`) because it is
consumed by the app *and* by specs, and because the language list is a single source of truth
(Principle IV). The catalogue itself moves to **assets** (`apps/ui/src/assets/i18n/`) because it
is runtime data loaded over HTTP, not a compiled module. `libs/copy` is removed; its role is
taken by the JSON files and its spec by the completeness spec.

## Design Decisions

### D1 — `@ngx-translate/core` with the HTTP loader

`app.config.ts` gains:

```ts
provideTranslateService({
  loader: provideTranslateHttpLoader({prefix: '/assets/i18n/', suffix: '.json'}),
  fallbackLang: DEFAULT_LANGUAGE,   // 'pl'
  lang: DEFAULT_LANGUAGE,
}),
provideAppInitializer(() => { /* addLangs, use(stored ?? default) */ }),
```

A component reads `{{ 'calendar.title' | translate }}` (or `translate.instant('...')` in a
`.ts`). The pipe is marked dirty by the service's language-change event, so the **zoneless**
constraint is satisfied without a manual signal.

### D2 — The language list and the store live in `libs/i18n`

`languages.ts` declares `[{code:'pl', label:'Polski', default:true}, {code:'en', label:'English'}]`.
`language.store.ts` is a signal store: `language()`, `set(code)` (which calls
`TranslateService.use` and writes `localStorage`), and `available()`. The switch component binds
to it. Adding a language is one entry plus one JSON file (FR-013).

### D3 — Fallback order is explicit and tested (FR-005)

Active language → default language → the key itself. ngx-translate's `fallbackLang` gives the
first two; a custom `MissingTranslationHandler` (or the default, which returns the key) gives the
third. A spec asserts a missing key renders the key, never an empty string.

### D4 — Key completeness is a spec, not a convention (FR-006, SC-003)

A spec loads `pl.json` and `en.json`, flattens both, and asserts `en` contains every `pl` key and
that every value with an interpolation parameter keeps it. This is the mechanised form of "a
partial translation fails CI". It replaces `libs/copy/src/lib/copy.spec.ts`.

### D5 — The guard is retargeted to "user-facing literal" (FR-012)

The current `no-hardcoded-copy.spec.ts` flags a Polish character outside the catalogue. Once the
copy is in JSON, the rule must catch **any** literal a template renders — Polish *or* English.
The plan retargets it to scan templates and component `.ts` for string literals in a
user-facing position (a template binding, an `aria-label`, a `title`), excluding imports, test
data, CSS and comments. This is the harder, correct version, and it is what keeps the translation
honest.

### D6 — SISK becomes tenant configuration (FR-007–FR-010)

| Was (hardcoded) | Becomes (configuration) | Neutral default |
|-----------------|-------------------------|-----------------|
| `COPY.footer.site` = "Strona SISK" | `TENANT_NAME` | the product name |
| `COPY.contact.email` = `biuro@sisk-siechnice.pl` | `TENANT_CONTACT_EMAIL` | unset (the field is hidden) |
| `COPY.contact.website` / `siskWebsiteUrl` | `TENANT_WEBSITE_URL` | unset |
| `COPY.contact.privacyPolicyUrl` | `TENANT_PRIVACY_URL` | unset |
| `COPY.contact.*` staff address | `SISK_CONTACT_EMAIL` → **`TENANT_STAFF_EMAIL`** | required for the staff path, no default |
| seed facility e-mails (`siechnice.hala@gmail.com`) | the tenant seed | neutral sample data |
| `DEFAULT_SUMMARY_DENY_LIST = 'mkulakowski@umsiechnice.pl'` | empty | deny nobody |
| template signature "SISK Siechnice" | `TENANT_NAME` | the product name |

The env var **renames** `SISK_CONTACT_EMAIL` → `TENANT_STAFF_EMAIL` (FR-011: English naming, no
brand). A public subset (name, contact e-mail, URLs) reaches the UI — either on an existing
public endpoint or a small `GET /api/tenant` (the plan chooses the endpoint, so the UI needs no
rebuild to rebrand).

### D7 — Server-side Polish artefacts (open question 2)

- **CSV export and printable report**: stay Polish, documented. A spreadsheet is the tenant's
  business artefact, not a visitor's screen; translating it would need a server-side catalogue
  and a locale on the request, for no user benefit.
- **Notification e-mail templates**: the *signature and wording* become tenant-configurable
  (a `TENANT_NAME` at minimum). The bodies stay as they are; a full server-side translation is
  deferred (recorded as out of scope).

### D8 — No route change; the language is a stored preference (open question 1)

The plan does **not** add a `/en/...` path segment. The reasons: every route and both guards would
need the prefix, `capabilityGuard`/`guestGuard` would need to preserve it, and the SPA is one
bundle. A stored preference satisfies every acceptance scenario in US1. A path segment is recorded
as the alternative if shareable language-specific links become a requirement.

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| A translation that silently falls back, hiding a missing key | The completeness spec (D4) fails CI; the fallback is tested (D3). |
| The zoneless app does not re-render on a language change | ngx-translate's pipe reacts to the language-change event; a spec drives the switch and asserts the DOM changes. |
| A literal slips back in (the guard is weakened) | The retargeted guard (D5) is stricter; a spec proves it fails on a literal. |
| The de-branding leaves a SISK string in the bundle | SC-002: the build is grepped for `sisk`/`siechnice` in CI (a new step or a spec). |
| `libs/copy` removal breaks 26 consumers at once | The migration is mechanical and compile-checked: the type is removed, so every stale import is a build error, not a silent miss. |
| The tenant config is a new surface with no default | Every setting has a neutral default; an unconfigured deployment renders (SC-005). |
| The 100 % UI coverage threshold fails on a new file | Each new file carries a spec; the threshold is not lowered. |

## Phase Plan (hand-off to `/speckit.tasks`)

- **Phase 0 — Research** (done in `research.md`): the library, the loader, the fallback, the
  de-branding surface.
- **Phase 1 — The translation layer**: `libs/i18n` (list, store, providers), `provideAppI18n()` in
  `app.config.ts`, the `pl.json`/`en.json` files generated from `libs/copy`, the language switch.
- **Phase 2 — Migrate the consumers**: replace every `COPY.x` read with a `translate` key (26
  components + the shell), retarget the guard spec, replace `libs/copy`'s spec with the
  completeness spec, delete `libs/copy`.
- **Phase 3 — De-branding**: the `TENANT_*` settings, the neutral defaults, the seed, the
  templates, the deny-list, the `SISK_CONTACT_EMAIL` rename, the UI's tenant read.
- **Phase 4 — Verification**: the switch works end to end; the bundle has no SISK string; the
  completeness and guard specs pass; CI is green.
- **Phase 5 — Docs**: `README`, `AGENTS.md`, `ui-conventions.md` (the translation conventions).

## Post-Design Constitution Re-check

Re-evaluated after the design: still passes. No rule is moved to the UI (Principle I untouched);
the translation layer is test-first (Principle II); every new file carries a spec (Principle III);
the language list is one source of truth (Principle IV); and the de-branding is configuration, so
it is reversible (Principle V's spirit) and introduces no secret (Security).

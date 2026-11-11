# Research: Internationalisation and De-branding

**Date**: 2026-11-08 | **Plan**: [plan.md](./plan.md) | **Spec**: [spec.md](./spec.md)

Each finding is a decision with its source. Library facts were checked against the npm registry
and the ngx-translate documentation on 2026-11-08; repository facts were read from the tree.

---

## R1 — Library: `@ngx-translate/core` 18.x

**Decision**: use `@ngx-translate/core` with `@ngx-translate/http-loader`. Runtime JSON loading,
switchable in place.

**Evidence** (ngx-translate.org, *Installation*):
- `provideTranslateService({loader: provideTranslateHttpLoader({prefix: '/assets/i18n/', suffix: '.json'}), fallbackLang, lang})`.
- `translate.addLangs([...])`, `translate.setDefaultLang(...)`, `translate.use(...)`.
- The provider functions must sit **inside** `provideTranslateService`, not as siblings.
- A standalone/zoneless app initialises through `provideAppInitializer(() => { ... })`.

**Evidence** (npm): `@ngx-translate/core@18.1.0` peers `@angular/core >= 18` and `rxjs >= 7`; the
repository is on Angular 22 and rxjs 7, so the range is satisfied.

**Rejected alternatives**:
- **`@angular/localize`** — compiles one bundle per locale and needs a build per language
  (`ng build --localize`), which contradicts "switch the language at runtime". It is right for a
  site that serves a different build per locale, wrong for an in-app switch.
- **`@jsverse/transloco`** — a capable alternative (`>=16` peers) with a similar API and extra
  features (scopes, message-format plugin, structural directives). It is heavier than this app
  needs; the plan notes it as the alternative if message-format or lazy scopes become a
  requirement.

---

## R2 — Runtime loading, one build for all languages

**Decision**: the translation files are static assets under `apps/ui/src/assets/i18n/`, loaded
over HTTP at start-up and on a language change.

**Evidence (repository fact)**: `apps/ui/project.json` already lists `apps/ui/src/assets` in the
build's `assets`, so an `i18n/` subdirectory is served with no build change. The nginx config
(`apps/ui/nginx.conf.template`) serves the SPA from `/usr/share/nginx/html`, so
`/assets/i18n/pl.json` resolves as a static file.

**Consequence**: the deploy artifact is one bundle; adding a language is adding a file (FR-013).

---

## R3 — Fallback order and the missing-key behaviour

**Decision**: active language → default language → the key itself. A missing key never renders an
empty string.

**Evidence** (ngx-translate.org, *Configuration* and *MissingTranslationHandler API*):
`fallbackLang` supplies the default-language fallback; a `MissingTranslationHandler` decides what
happens when neither has the key, and the default handler returns the key.

**Repository fact**: the current catalogue is a single object; a missing key is a **TypeScript
error** today (`COPY.calendar.title` would not compile if `title` were absent). Moving to JSON
loses that compile-time check, so it must be replaced by a **spec** (R5). This is the one place
the change makes a guarantee weaker, and the plan closes it explicitly.

---

## R4 — The copy is already centralised, so the migration is mechanical

**Decision**: migrate `libs/copy`'s `COPY` object into `pl.json` (and translate it into `en.json`),
then delete `libs/copy`.

**Evidence (repository fact)**:
- `libs/copy/src/lib/copy.ts` is one `as const` object, grouped by surface (`nav`, `footer`,
  `admin`, `calendar`, …), 590 lines, ~169 Polish strings.
- Its docstring states the intent: "NFR-005 requires every user-facing string to be Polish and to
  be centralised so it can be **translated later**." This feature is that "later".
- 26 UI files import `COPY`; each read becomes a `translate` pipe with the same dotted path, so
  the migration is a rename, not a redesign.
- `apps/ui/src/app/no-hardcoded-copy.spec.ts` already prevents literals from creeping back.

**Consequence**: the risk is volume (26 files), not design; and the TypeScript compiler catches
every stale import when `libs/copy` is removed.

---

## R5 — Key completeness and interpolation are specs

**Decision**: a spec asserts every key in the default language exists in every other language and
that interpolation parameters are preserved.

**Evidence (repository fact)**: the repository's convention is that a guarantee is mechanised
(the guard spec, the coverage thresholds, the "single source of truth" principle). A compile-time
guarantee is being traded for a runtime one (R3), so the replacement must be a test, not a
convention.

**Consequence**: `libs/copy/src/lib/copy.spec.ts` is replaced by a `translations.spec.ts` in
`libs/i18n` that reads both JSON files.

---

## R6 — The guard spec must be retargeted to "user-facing literal"

**Decision**: change `no-hardcoded-copy.spec.ts` from a **Polish-character** check to a
**user-facing-literal** check.

**Evidence (repository fact)**: the spec's own docstring says "English literals are not caught
here — a stray `Previous` in a template is a copy defect but not a localisation one". Once English
is a supported language, an English literal *is* a localisation defect: it cannot be translated.
The current rule would pass `{{ 'Save' }}` and would pass a component that hardcodes an English
aria-label.

**Consequence**: the retargeted rule scans template bindings and component literals for
user-facing strings, excluding imports, CSS, comments and spec data. It is stricter, and it is the
rule that keeps a new language honest.

---

## R7 — Zoneless re-render on a language change

**Decision**: rely on ngx-translate's `translate` pipe (which subscribes to the language-change
event) rather than a manual signal.

**Evidence (repository fact)**: the app is **zoneless**
(`provideZonelessChangeDetection()` in `app.config.ts`), so a change is rendered only when
something marks the view dirty. ngx-translate's pipe emits on `onLangChange`, which is a signal
path Angular tracks; a component that instead read `translate.instant()` into a plain field would
not re-render — the same trap the repository already documents for signal inputs and `ModalComponent`.

**Consequence**: components use the **pipe**, not a stored `instant()` value; a spec drives the
switch and asserts the DOM changes (so the trap is caught, not assumed away).

---

## R8 — The de-branding surface (what "all info about SISK" means)

**Decision**: remove SISK from the **product**; leave it in the **provenance** (documentation,
decision 3). The two are different audiences and are treated differently on purpose.

**Evidence (repository fact)** — the SISK values in tracked source, and their disposition:

| Location | Value | Disposition |
|----------|-------|-------------|
| `libs/copy/src/lib/copy.ts` | "Strona SISK", the meta line, `biuro@sisk-siechnice.pl`, `www.sisk-siechnice.pl`, the privacy URL, the contact-form clause PDF | → `TENANT_*` config, neutral defaults |
| `apps/server/src/app/buildings/seed/facility-seed.ts` | `siechnice.hala@gmail.com` and the city/facility names | → tenant seed / neutral sample |
| `apps/server/src/app/reporting/deny-list.ts` | `mkulakowski@umsiechnice.pl` | → empty default |
| `apps/server/src/app/notification/templates/templates.ts` | "SISK Siechnice" signature | → `TENANT_NAME` |
| `apps/server/src/app/config/env.validation.ts` | `SISK_CONTACT_EMAIL` | → `TENANT_STAFF_EMAIL` |
| `README.md`, `AGENTS.md`, `specs/` | the legacy origin (`MIBuczek/sisk-booking-app`) | **kept** — provenance (decision 3) |
| test fixtures (`@sisk.pl`, `admin@sisk.pl`) | sample addresses | → neutral (`@example.com`) |

**Consequence**: FR-007–FR-010 and SC-002 are checkable by grepping the built bundle (product)
and by reading the documentation (provenance). The facility **sample data** stays (decision 5);
it carries no SISK brand.

---

## R9 — Tenant configuration reaches the UI without a rebuild

**Decision**: the public tenant subset (name, contact e-mail, website and privacy URLs) is served
by the API, so a deployment rebrands by changing settings, not by rebuilding the bundle.

**Evidence (repository fact)**: `GET /api` exists (it reports the version), and the UI already
reads API data through a typed client. A small `GET /api/tenant` (or a field on an existing
public endpoint) fits the existing pattern; the alternative — build-time config — would need a
rebuild per tenant, which contradicts "configuration".

**Consequence**: the footer and the contact page read the tenant from the API; a missing value
hides the element rather than rendering an empty link (SC-005).

---

## R10 — Server-side Polish stays Polish (decision 2)

**Decision**: the CSV export, the printable report and the notification e-mail bodies stay
Polish, documented in `AGENTS.md` (FR-015); only the e-mail **signature** becomes the tenant name
(a de-branding fix, not a translation). The UI's translation layer is the only i18n surface.

**Evidence (repository fact)**: `apps/server/src/app/reporting/csv/csv-columns.ts` (4 labels),
`libs/reporting/src/lib/display.ts` (12 values), and
`apps/server/src/app/notification/templates/templates.ts` (18 strings) are read outside the
Angular bundle. `libs/copy`'s own docstring already says these "are server-side business
artefacts, not UI strings".

**Consequence**: the requirement "migrate all Polish content to pl.json" is satisfied for the
**UI**; the server artefacts are explicitly out of the UI catalogue and their handling is a
recorded decision, not an oversight.

---

## Sources

- ngx-translate.org — *Installation* (`provideTranslateService`, `provideTranslateHttpLoader`,
  `provideAppInitializer`), *Configuration* (`fallbackLang`), *MissingTranslationHandler API*,
  *Testing components that use TranslateService*, *Synchronizing HTML lang attribute*.
- npm registry — `@ngx-translate/core@18.1.0` peer dependencies; `@jsverse/transloco@8.4.0` peer
  dependencies.
- Angular documentation — *Internationalization* (`@angular/localize` compiles per locale).
- Repository: `libs/copy/src/lib/copy.ts`, `libs/copy/src/lib/copy.spec.ts`,
  `apps/ui/src/app/no-hardcoded-copy.spec.ts`, `apps/ui/src/app/app.config.ts`,
  `apps/ui/project.json`, `apps/ui/nginx.conf.template`, `apps/server/src/app/config/env.validation.ts`,
  `apps/server/src/app/buildings/seed/facility-seed.ts`,
  `apps/server/src/app/reporting/deny-list.ts`,
  `apps/server/src/app/notification/templates/templates.ts`,
  `libs/reporting/src/lib/display.ts`, `README.md`.

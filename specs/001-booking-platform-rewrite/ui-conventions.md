# UI Conventions — Angular 22

Standards for `apps/ui`. Applies to all of Phase 6 (T032–T040).

## Status of the current UI

`apps/ui` is the unmodified Nx starter shell:

| | Count |
|---|---|
| Components | 1 (`app.component.ts`) |
| NgModules | 0 |
| Feature folders | 0 |
| Routes | 0 (`appRoutes = []`) |

It is already `bootstrapApplication`, already standalone, already using `inject()`, and already
on Angular 22.2.4 (the range `~22.2.0` resolves to 22.2.4).

**There is no Angular code to migrate.** The Angular 16 → 22 upgrade was completed under
`002-dependency-modernization` Stage 3 (PRs #101, #102, #103; issues #73–#77). Nothing in
`apps/ui` predates it.

The porting work is **React → Angular**, not Angular-old → Angular-new. The legacy app at
`MIBuczek/sisk-booking-app` holds 71 `.tsx` components that Phase 6 reimplements from scratch.
This document fixes the conventions those implementations must follow.

## Non-negotiable conventions

These are enforced by lint rules **already active** in `apps/ui/eslint.config.mjs`, verified by
injecting a violation and observing the rule fire. The rule is the standard — do not restate it
in review.

| Convention | Enforced by | Verified |
|---|---|---|
| Components/directives/pipes are standalone | `@angular-eslint/prefer-standalone` | fires on `standalone: false` |
| Constructor injection is not used; `inject()` only | `@angular-eslint/prefer-inject` | fires on constructor injection |
| OnPush is not opted out of | `@angular-eslint/prefer-on-push-component-change-detection` | fires on `ChangeDetectionStrategy.Default` |
| Built-in control flow, not `*ngIf`/`*ngFor` | `@angular-eslint/template/prefer-control-flow` | enabled |
| Inputs/outputs are not renamed in metadata | `@angular-eslint/no-input-rename`, `no-output-rename` | enabled |
| Lifecycle interfaces are implemented | `@angular-eslint/use-lifecycle-interface` | enabled (warn) |

Template accessibility rules are also on as errors: `alt-text`, `label-has-associated-control`,
`click-events-have-key-events`, `mouse-events-have-key-events`, `interactive-supports-focus`,
`valid-aria`, `role-has-required-aria`, `table-scope`.

### Do not write `changeDetection: ChangeDetectionStrategy.OnPush`

**OnPush is already the default in Angular 22.** The enum in `@angular/core` says so directly:

```
OnPush = 0,   // NOTE: OnPush is enabled by default.
Eager  = 1,
Default = 1,  // @deprecated Use `Eager` instead.
```

So the correct code omits the property entirely, and `prefer-on-push-component-change-detection`
only fires when you opt *out* (to `Default`/`Eager`). Adding it explicitly is at best noise and
the rule treats it as redundant.

```ts
// Angular 22 — correct
@Component({
  selector: 'book-space-client-list',
  imports: [RouterLink],
  templateUrl: './client-list.component.html',
})
export class ClientListComponent {}

// Redundant — OnPush is the default
@Component({ changeDetection: ChangeDetectionStrategy.OnPush, /* ... */ })
```

This matters more than it looks. Under the old mental model, "add OnPush to every component" was
a thing you had to remember. In v22 it is the default, and the failure mode is inverted: you only
think about change detection when you are deliberately opting out, which in this codebase should
never happen.

### `standalone: true` is redundant — omit it

Angular 22 defaults `standalone` to `true`. Verified empirically: a component declared with no
`standalone` flag is accepted directly in `imports: [...]` and instantiates under `TestBed`.

The rule permits the explicit flag by default (`allowExplicitStandalone: true`), so writing it is
not an error — but it is redundant. Set `allowExplicitStandalone: false` in the ui lint config to
have it flagged and autofixed.

### Rules that are NOT enabled

Do not rely on these; they exist in `@angular-eslint` but are absent from the active config:
`inject-at-top`, `no-uncalled-signals`, `prefer-output-emitter-ref`, `prefer-host-metadata-property`.

`no-uncalled-signals` is the notable gap — it catches a template reading `count` instead of
`count()`, which silently renders nothing under zoneless. Enable it as part of the zoneless step
below; it is the cheapest guard against the most common signal mistake.

## State: signals first

Local and derived state uses signals. RxJS stays for streams with real time semantics —
debounced search, HTTP, router events — and is bridged with `toSignal`/`toObservable` from
`@angular/core/rxjs-interop`.

```ts
export class ClientListComponent {
  private readonly clientsApi = inject(ClientsApi);

  readonly search = signal('');
  readonly page = signal(1);

  // Derived — recomputes only when a dependency changes
  readonly filtered = computed(() => {
    const term = this.search().toLowerCase();
    return this.clients().filter((c) => c.nick.toLowerCase().includes(term));
  });

  // Async — loading/error/value as one signal, no manual subscribe
  readonly clients = httpResource<IClient[]>(() => ({
    url: `/api/clients`,
    params: { page: this.page() },
  }));
}
```

Rules:

- **Never `.subscribe()` in a component.** `httpResource`, `resource` or `rxResource` for
  requests; `toSignal` when an existing Observable must be consumed.
- `computed()` for anything derivable. Do not keep parallel writable state in sync by hand.
- `linkedSignal()` when a value must reset on a dependency change but stay writable —
  the page number resetting when the search term changes is the canonical case.
- `effect()` only for side effects outside the template (storage, focus, analytics). It is
  not a way to compute state.
- `untracked()` to read a signal without subscribing inside an `effect` or `computed`.

### Inputs and outputs are signal functions

```ts
export class BookingRowComponent {
  readonly booking = input.required<IBooking>();
  readonly compact = input(false);          // default
  readonly approved = output<IBooking>();   // OutputEmitterRef, not EventEmitter
}
```

`input.required<T>()` where the value must be supplied. `input(default)` otherwise. Read via
`this.booking()`.

## Templates

Use built-in control flow. `*ngIf`/`*ngFor`/`*ngSwitch` and `CommonModule` do not appear in
new code.

```html
@if (clients().length) {
  @for (client of clients(); track client.id) {
    <book-space-client-row [client]="client" />
  } @empty {
    <p>No clients yet.</p>
  }
} @else {
  <book-space-loading />
}

@switch (status()) {
  @case ('INITIAL') { <span class="badge badge--initial">Initial</span> }
  @default { <span class="badge">{{ status() }}</span> }
}
```

`track` is mandatory on `@for` — the identity expression, normally the entity id.

`@defer` for anything below the fold or behind interaction, with a placeholder:

```html
@defer (on viewport) {
  <book-space-calendar-grid [events]="events()" />
} @placeholder {
  <book-space-skeleton />
}
```

## Routing

Routes are lazy via `loadComponent`, guards are functions, and route params are bound to
signal inputs.

```ts
export const appRoutes: Route[] = [
  { path: '', loadComponent: () => import('./features/public-calendar/public-calendar.component').then((m) => m.PublicCalendarComponent) },
  {
    path: 'admin',
    // authGuard first (session), then the staff capability. CanMatchFn — no chunk fetched
    // when either fails.
    canMatch: [authGuard, capabilityGuard('staff')],
    loadChildren: () => import('./features/admin/admin.routes').then((m) => m.adminRoutes),
  },
];
```

Enable `withComponentInputBinding()` so a `:id` param arrives as a signal input with no
`ActivatedRoute` plumbing:

```ts
// route: { path: 'clients/:id', ... }
readonly id = input.required<string>();  // bound from the :id param
```

**Guards read capabilities, not the role (T033).** `capabilityGuard` is a factory over a
capability key; the redirect differs by whether a session exists (anonymous → `/sign-in`,
signed-in but not permitted → `/`). The admin tab list and the tab routes both come from
`ADMIN_TABS`, so a hidden tab and its route cannot disagree.

```ts
export const capabilityGuard = (capability: keyof IUserCapabilities): CanMatchFn => () => {
  const session = inject(SessionStore);
  const router = inject(Router);
  if (!session.isAuthenticated()) {
    return router.createUrlTree(['/sign-in']);
  }
  return session.capabilities()?.[capability] === true ? true : router.createUrlTree(['/']);
};
```

## Zoneless

**Landed in T032, before any feature component.** Zone.js is no longer wired up:

```
apps/ui/project.json   →  polyfills: ["zone.js"] removed
apps/ui/src/test-setup.ts  →  setupZonelessTestEnv()
apps/ui/src/app/app.config.ts  →  provideZonelessChangeDetection()
```

`package.json` still declares `zone.js ~0.16.0`, but nothing imports it — the build no longer
lists it as a polyfill and no source references it. It can be dropped from `package.json` in a
dependency cleanup, not as part of a feature task.

Under Zone.js, a missed change-detection trigger is invisible — a template reading a plain
field still updates, because the zone re-runs detection on every async boundary. Zoneless
removes that safety net: **a value that is not a signal does not update the view.**

Enabling zoneless first made every "I forgot a signal" bug surface immediately, while the
codebase was one component; doing it after 40 components would mean auditing all of them.

Cost while it is on: every mutable field read by a template must be a signal, and
`markForCheck` is no longer available as a crutch. It also bites in specs — a test host that
drives a component through a plain field silently stops updating after the first render. See
the two zoneless notes in `AGENTS.md` for the shape that failure takes.

## Forms

Two options, and the choice is per-form:

**Signal Forms** (`@angular/forms/signals`) — stable in 22 (`@publicApi 22.0`), signal-native,
no `ControlValueAccessor`, no `valueChanges` subscription. Preferred for new forms, and the
right fit for T035 (booking request) and T037 (client form), whose validation must mirror the
server.

```ts
import { form, required, pattern, submit } from '@angular/forms/signals';

readonly model = signal<IClientRequest>({ nick: '', nip: '', clientType: 'INDIVIDUAL' });
readonly clientForm = form(this.model, (path) => {
  required(path.nick);
  // NIP required only for COMPANY — mirrors the server rule in T008
  required(path.nip, { when: ({ valueOf }) => valueOf(path.clientType) === 'COMPANY' });
});
```

One caveat: `provideSignalFormsConfig` is marked `@experimental`. `form`, `field` and the
validators are stable; the config provider is not. Do not build on the config provider.

**Reactive Forms** (`@angular/forms`) — use only if a form needs a third-party
`ControlValueAccessor` that has no signal equivalent. Not expected in Phase 6.

Template-driven `ngModel` is not used in new code.

## Testing

`jest-preset-angular` ~17, Jest 30. One `*.spec.ts` beside each component. Per the project
constitution, tests are written first.

The repo does **not** use `@testing-library/angular`. Follow the existing
`app.component.spec.ts`: `TestBed` directly.

```ts
import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';

describe('ClientListComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ClientListComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('renders a row per client', () => {
    const fixture = TestBed.createComponent(ClientListComponent);
    fixture.detectChanges();

    httpMock.expectOne('/api/clients').flush([{ id: '1', nick: 'Acme' }]);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('book-space-client-row').length).toBe(1);
  });
});
```

- Assert on **rendered output and signal values**, not on internal method calls.
- HTTP goes through `provideHttpClientTesting()`; `httpMock.verify()` in `afterEach` proves no
  request was left outstanding.
- Under zoneless, call `fixture.detectChanges()` after flushing — there is no zone to trigger it.
- A test that fails only because a value is not a signal is a real bug. Fix the code, not the
  test.

## Accessibility

Required, not optional — `spec.md` FR-039 and NFR-006:

- Every input has a `<label>` or `aria-label`.
- Conflict state is never colour alone (FR-037) — pair the colour with text or an icon.
- Interactive elements are real `<button>`/`<a>`, keyboard reachable, visible focus.
- Modal focus is trapped and returns to the trigger on close.

## Translation catalogue (T061, T210–T240, NFR-005, FR-001–FR-013)

NFR-005 required all user-facing copy to be Polish and centralised so it could be translated
later. T061 built that catalogue as a TypeScript object (`libs/copy`, `COPY`); the
internationalisation feature (004) then made the copy **runtime data** and translated it, so
`libs/copy` no longer exists and there is no `@booking/copy` alias.

- **The catalogue is JSON, loaded at runtime.** `apps/ui/src/assets/i18n/pl.json` and `en.json`
  are served as static assets and loaded by `@ngx-translate/core` through
  `provideTranslateHttpLoader({prefix: '/assets/i18n/', suffix: '.json'})`. One build serves every
  language, so a language can be added or corrected without a rebuild (FR-001, FR-013). The
  language list itself — the codes, the endonyms, the default — is `libs/i18n/src/lib/languages.ts`
  (`LANGUAGES`, `DEFAULT_LANGUAGE`), the single source the switch, the store and the completeness
  spec all read.
- **A component reads a key, never a literal.** The template uses the pipe
  (`{{ 'nav.calendar' | translate }}`); a `.ts` that needs a string uses `t('key')` from
  `injectTranslate()`. A pure feature module (`bookings-table.ts`, `calendar-events.ts`) cannot
  inject, so it takes a `TranslateFn` parameter and the component supplies `injectTranslate()` —
  the module stays pure and the string is still the active language's.
- **A switch re-renders without a manual subscription.** The pipe is marked dirty by
  ngx-translate's language-change event, so the zoneless app re-renders on a switch; a derived
  label in a `computed()` re-runs because `TranslateService.instant` reads the service's signals.
  `LanguageStore` owns only the choice, its persistence and `<html lang>` — not the strings.
- **`CITY_LABELS` is not a catalogue entry.** It labels the screen selectors and lives in
  `libs/models/building.model.ts`, because the server's reporting vocabulary is a different
  audience (see `reporting/`). It is display decoration only — cities are data (spec.md §9 open
  question 1, FR-007), so it is a `Record<string, string>` that falls through to the stored value,
  not the compiled-in `CITIES` list it used to sit beside.
- **English is not caught by the guard**, but the rendered-component specs pin the strings that
  matter; a stray `Previous` is a copy defect, not a localisation one.

### The two guards: completeness and the literal check

The move from a TypeScript object to JSON traded a compile-time guarantee for a runtime one —
`COPY.calendar.title` failed the build if `title` were absent, and a JSON key does not. Two specs
replace that guarantee, and both must be understood before the catalogue is edited:

- **`libs/i18n/src/lib/translations.spec.ts` is key completeness (FR-006, SC-003).** It reads the
  *shipped* `pl.json` and `en.json`, flattens both to dotted keys, and asserts that every default
  key is present in every other language, that no extra key exists (a translation for a string no
  screen renders is dead data), and that every value with a `{{param}}` keeps the same parameter
  set. A partial translation therefore fails CI rather than falling back silently. It also
  asserts no value is empty, which would render as a blank string.
- **`apps/ui/src/app/no-hardcoded-copy.spec.ts` is the literal check (T240, FR-012).** Its first
  version flagged a Polish *character* outside the catalogue, which was right while every string
  was Polish and the catalogue was TypeScript. Both have changed, so the rule is retargeted to a
  language-agnostic **user-facing literal**: it flags a static text node (`>Some text<`) and a
  literal for an attribute a user reads or hears (`aria-label`, `placeholder`, `title`, `alt`),
  while accepting an interpolation, a binding and a structural block (`@if`, `@for`). It reads
  only the `template: \`...\`` regions — a whole-file scan flags TypeScript generics
  (`Array<string>`) as text — and it is *stricter* than the character check it replaced, because
  an English literal is exactly what the old one could not see. Specs are exempt, since a spec
  legitimately quotes copy.

### Adding a language

Adding a language is **two edits and no code change** (FR-013):

1. Add an entry to `LANGUAGES` in `libs/i18n/src/lib/languages.ts` (`{code, label, default}`).
   The code is the IETF tag used as the file name and the `lang` attribute; the label is the
   endonym, so a speaker recognises it in the switch.
2. Add `apps/ui/src/assets/i18n/<code>.json` with every key the default language declares. The
   completeness spec fails the build until it does.

The switch (`LanguageSwitchComponent`) renders `LanguageStore.available`, which reads `LANGUAGES`,
so it picks up the new language with no change to the component. The default language is the
entry flagged `default`, not a scattered assumption — a spec asserts the flag and
`DEFAULT_LANGUAGE` agree.

### API error localisation: the UI owns the wording

The API is English (NFR-005). A validation failure answers `{message: string[]}` in English, and
a `409` answers a single English sentence. The UI must not render either.

- **A `422` message is used to locate the field, not to render it.** `mapServerErrors` matches
  the English message to the field it names (`city must be longer...` → `city`) and shows the
  UI's own copy (`errors.fieldInvalid`); a message that names no field becomes the generic prompt
  (`errors.generic`). The server's sentence is discarded.
- **A `409` is keyed by its status, not its body.** The clients delete conflict and the
  last-administrator rule both show a message chosen from the status; the English body is
  ignored.
- **The server-error page shows the HTTP status text, never a cause.** That is deliberate: a
  `5xx` is opaque by contract (`ErrorExceptionFilter`), and the page's own prompt and fallback
  are from the catalogue.

So the strategy is: **the API returns English and a status code; the UI maps the status (or the
named field) to a catalogue key.** The API is never asked to produce Polish, and a Polish
sentence never travels in a response body.

### CSV labels and e-mail subjects live server-side, on purpose

Both are Polish, and neither is UI copy:

- **The CSV column labels** (`apps/server/src/app/reporting/csv/csv-columns.ts`) are the export
  contract (FR-028): the header is the columns' `label`s joined, and a spreadsheet reads them by
  position. They are produced by the server that writes the file, not rendered by a screen.
- **The notification subject lines and bodies** (`apps/server/src/app/notification/templates/`)
  are versioned assets with the legacy EmailJS ids; `contracts/notification-templates.md` is
  their contract. The server composes the e-mail, so the wording is a server asset.

The shared *report vocabulary* (statuses, cities, payments) that both the CSV and the printable
report print lives in `libs/reporting`, so the export and the report cannot disagree.

## Shared UI kit (T032)

Built once in `apps/ui/src/app/shared`, then used everywhere. No feature reimplements a
control: button, input, select, checkbox, table, modal, pagination, date picker.

Each is standalone (the default), relies on the default OnPush strategy, uses
`input()`/`output()`, and is covered by a spec.

## Stale references to fix

`specs/001-booking-platform-rewrite/plan.md` still describes the pre-002 stack:

| plan.md says | Actual |
|---|---|
| Angular 16 | Angular 22.2.4 |
| TypeScript 5.0 | TypeScript 6.0.3 |
| server target ES2015 / Node 18 | ES2022 / Node 24 |
| NestJS 9 | NestJS 11.2.8 |

Correct when plan.md is next touched.

# AGENTS.md

## Layout

Nx 23 workspace, Node 24 (`.nvmrc`/CI/`engines`). Apps: `apps/server` (NestJS 11 + Mongoose 9
on Express 5), `apps/ui` (Angular 22, standalone), plus `apps/server-e2e` and `apps/ui-e2e`.
Shared types live in `libs/models`.

Writing conventions for the rewrite: `specs/001-booking-platform-rewrite/ui-conventions.md`
(Angular 22) and `specs/001-booking-platform-rewrite/backend-conventions.md` (NestJS 11). Read the
relevant one before writing code in that app; it records decisions that would otherwise be
re-derived per task.

The dependency-modernization plan (`specs/002-dependency-modernization/`) is complete. Every
stage has landed, so the table below is the current state, not a target:

| Package    | Version | Landed in |
| ---------- | ------- | --------- |
| Node       | 24      | Stage 0   |
| Nx         | 23.3.1  | Stage 1   |
| TypeScript | 6.0.3   | Stage 3   |
| Angular    | 22.2.4  | Stage 3   |
| NestJS     | 11.2.8  | Stage 4   |
| Mongoose   | 9.11.4  | Stage 4   |
| Express    | 5       | Stage 4   |
| Jest       | 30      | Stage 3   |
| ESLint     | 10      | Stage 5   |
| Cypress    | 16      | Stage 5   |

TypeScript is a single workspace-wide version pinned by Angular, so the server does not get
6.0.3 on its own — it moves when Angular moves. Check `package.json` rather than trusting a
version written down anywhere, including this file.

## Version ceilings

Three ceilings are deliberate. Each was verified against the npm registry, not read from
release notes. Do not raise them without re-checking the constraint named here; a version
that looks stale is usually pinned on purpose.

- **Nx 23, not 24.** Nx 24 ships empty `executors` maps for `@nx/jest`, `@nx/eslint` and
  `@nx/cypress`, and drops `webpack` from `@nx/webpack` (keeping only `ssr-dev-server`).
  Verified by extracting `executors.json` from the published tarballs:

  ```
  nx 23.3.1   jest:[jest] eslint:[lint] cypress:[cypress] webpack:[webpack|dev-server|ssr-dev-server]
  nx 24.0.3   jest:[]     eslint:[]     cypress:[]        webpack:[ssr-dev-server]
  ```

  Every `project.json` here uses `@nx/jest:jest`, `@nx/eslint:lint`, `@nx/cypress:cypress`
  and `@nx/webpack:webpack`, so moving to 24 means migrating the whole workspace to inference
  plugins first. That is a separate project, not a version bump.
- **NestJS 11, not 12.** `@nx/nest` peers `@nestjs/core >=10.0.0 <12.0.0` — still true in
  24.0.3. NestJS 12 is unreachable without dropping `@nx/nest`. Raising Nx does not lift this.
- **TypeScript 6.0.x, not 7.** `@angular/compiler-cli@22` peers `typescript >=6.0 <6.1`, so
  TypeScript 7 is unreachable while Angular is 22. Angular pins TypeScript, not the other way
  round, and the peer ranges do not tile: every adjacent Angular pair overlaps except
  16 → 17, where Angular 16 caps TypeScript below Angular 17's floor. TypeScript therefore
  steps *with* Angular, never before it. `ts-jest` adds a cap of its own: the previous
  29.1.0 peers `typescript >=4.3 <6`, so it had to move alongside TypeScript. The installed
  29.4.15 peers `typescript >=4.3 <7`, which is what lets the server test runner sit on 6.0.3.

`@nestjs/config` is a fourth case of the same trap: its majors jump 4 → 12 with no 11.x line,
so NestJS 11 takes `@nestjs/config@4.0.4`. See the constraint below.

## Commands

```bash
yarn install --frozen-lockfile
yarn nx run-many --target=lint --all
yarn nx run-many --target=test --projects=server,ui,date-time,booking-rules,reporting,version,migration --configuration=ci
yarn nx run-many --target=build --projects=server,ui --configuration=production
```

Add `--skip-nx-cache` when you need to be sure a result is real rather than replayed.

The `test` list must name every project with a `test` target, including the shared libraries —
`--projects=server,ui` silently skips `date-time`, `booking-rules`, `reporting`, `version` and
`migration`, so a change to one of those would pass unnoticed. CI runs the same list.

## Docker

`docker compose up --build` starts MongoDB, the API and the nginx-served UI on
`http://localhost:4200`. Both Dockerfiles are multi-stage production builds:

- **`apps/server/Dockerfile`** — a `node:24` builder runs `nx build server --configuration=production`;
  the runtime is `node:24-slim` with the production `node_modules` (the bundle is webpack-externalised
  against them) and runs as the non-root `node` user. `bcrypt` is a native addon and is compiled in
  the builder stage, where the toolchain is present.
- **`apps/ui/Dockerfile`** — a `node:24` builder runs `nx build ui --configuration=production`; the
  runtime is `nginx:alpine` serving the bundle and proxying `/api/` to `${API_UPSTREAM}`
  (`apps/ui/nginx.conf.template`, substituted by the nginx image's `envsubst` entrypoint at start).

Two traps:

- **The build context must carry full git history.** The Nx build depends on `version:build`, which
  runs `git rev-list --count HEAD`; a shallow clone makes the generator exit non-zero and the image
  build fails. That is deliberate — a shallow clone would stamp a wrong build number, not an error
  (see "The build number is a task input").
- **`--production` in the deps stage installs only `dependencies`.** The server bundle requires
  nothing from `devDependencies` at runtime; adding a runtime import of a dev-only package moves it
  to `dependencies` or the container fails at start with `Cannot find module`.

## Environment setup

The repo is a **Yarn 1** workspace (`yarn.lock` is lockfile v1). Some sandboxes ship Node
without `yarn`, and `corepack enable` fails there because it cannot write symlinks into
`/usr/local/bin`. Install yarn 1 into a user-local prefix instead:

```bash
npm i -g yarn@1.22.22 --prefix "$HOME/.local"
export PATH="$HOME/.local/bin:$PATH"
```

`npm i -g` without `--prefix` fails the same way for the same reason. Do not "fix" this by
switching the project to npm or pnpm: `yarn.lock` v1 is not readable by them, and CI uses
`yarn install --frozen-lockfile`.

## Constraints that are easy to get wrong

- **Always set `NX_NO_CLOUD=true`.** CI does. The `nx-cloud` client was removed in Stage 0;
  do not reintroduce it or an Nx Cloud token into `nx.json`: a read-write token in this
  repository lets anyone poison the shared cache.
- **`npmScope` is gone from `nx.json` and must not come back.** Nx 17 dropped it from the
  schema. The `@models/*` and `@server/*` aliases resolve through `paths` in
  `tsconfig.base.json`, so nothing depends on `npmScope`.
- **Never run `nx migrate` in this repository.** It resolves `@nx/linter` from the current
  package set and tries to install `@nx/linter@23.3.1`, which was removed after Nx 20; the
  fetch 404s and the command aborts with no `migrations.json`. Bump `nx` and every `@nx/*`
  in `package.json` by hand instead.
- **`@nx/eslint` and ESLint are version-locked.** `@nx/eslint@23` refuses to run on ESLint 8
  (`Supported: >= 9.0.0`) because it calls `eslint.loadESLint`. Nx 17.0.6 is the last version
  whose `@nx/eslint` runs on ESLint 8. Any further `nx` bump must move `eslint`,
  `@typescript-eslint` and `@angular-eslint` with it.
- **Caching is configured per target, not via `tasksRunnerOptions`.** Nx 23 ignores
  `tasksRunnerOptions.cacheableOperations` silently — targets just stop being cached, with no
  warning. `cache: true` lives in `targetDefaults` in `nx.json`. If a repeat build is not a
  cache hit, this is the first thing to check.
- **`.nx/cache` and `.nx/workspace-data` are gitignored.** Nx 17 moved its cache out of
  `node_modules/.cache`; `.nx/` grows to tens of megabytes and must never be committed.
- **ESLint runs on flat config.** `eslint.config.mjs` exists at the root and in all four
  projects; the five `.eslintrc.json` files and `.eslintignore` are gone (Stage 5, U021).
  `.eslintignore` only listed `node_modules`, which flat config ignores by default. The
  per-project configs import the root one and spread `nx.configs['flat/*']`.
- **`yarn lint` runs the Nx target, and the root config ignores build output.** The legacy
  root `.eslintrc.json` carried `ignorePatterns: ["**/*"]`, which made the root config match
  nothing so each project was linted through its own config. `convert-to-flat-config` does not
  carry that over, so bare `eslint` walks `dist/` and `.angular/cache/` and exits with
  thousands of errors. The ignores are now explicit in `eslint.config.mjs` and the `lint`
  script is `nx run-many --target=lint --all`, which resolves per-project configs.
- **`@angular-eslint` 22 dropped its legacy `plugin:` configs.** There is no
  `plugin:@angular-eslint/template/process-inline-templates` or `plugin:@nx/angular` to
  `extends` any more, and `@angular-eslint/*` no longer ships `dist/configs`. The
  `convert-to-flat-config` generator still emits a `FlatCompat` block referencing them, which
  fails at load with `Failed to load config "plugin:@angular-eslint/template/..."`. Use
  `nx.configs['flat/angular']` and `nx.configs['flat/angular-template']` instead — Nx bundles
  the inline-template processor and the same rule sets, so no `FlatCompat` is needed.
- **Lint output is 0 errors, 3 warnings.** The warnings are pre-existing `no-unused-vars` /
  `no-explicit-any` findings in `apps/server`; they are the Stage 5 acceptance baseline. A
  change in that count means a rule was silently dropped or added. The count was 5 until T007,
  which removed two genuinely unused imports (`Req` in `authorization.controller.ts`, `TUser`
  in `users.controller.ts`) — that is the baseline moving because the code changed, not a rule
  going missing. Check the rule list, not the number, if a change is unexplained.
- **A pre-save hook does not run for `updateOne`.** `bcrypt` hashing lives in the users schema's
  `pre('save')` hook, so `Model.updateOne` writes the value it is given verbatim. The update path
  therefore hashes the password itself before calling the driver; a refactor that moves hashing
  back into the schema alone silently stores plaintext (CHK017). `user.service.spec.ts` asserts
  the hash reaches the driver, which is the only place that defect is visible.
- **`Partial<SomeDto>` in a controller erases validation.** `Partial<T>` is a type, gone at
  runtime, so the global `ValidationPipe` sees `Object` and validates nothing — no `whitelist`,
  no `forbidNonWhitelisted`, no field rules. Any route whose body is a partial needs a concrete
  class (`UpdateUserDto`, `UpdateClientDto`), not a mapped type. The same applies to
  `Pick`/`Omit`. `client.controller.ts` carried this defect on `PUT /clients/{_id}` until T008.
- **Mongoose does not run a custom validator on an absent value.** `validate: {validator}` runs
  only when the path has a value, so a "required when another field says so" rule cannot live
  there alone — a document that omits the path entirely is silently valid. `client.schema.ts`
  splits the NIP rule across `required: [function, message]` (the only validator Mongoose runs
  when the value is missing) and the custom `validate` (the format and the not-for-individual
  case). A spec that only ever supplies a *present, malformed* value passes with the `required`
  half missing, which is why `client.schema.spec.ts` pins the omitted-`nip` company case.
- **A Mongoose custom validator must be a `function`, not an arrow.** Mongoose calls it with
  `this` bound to the document; an arrow captures the module's `this`, so `this.type` is
  `undefined` and every conditional rule reads the wrong field. `function (this: Client, val)`.
- **A conditional field rule cannot live in a partial-update DTO.** A `PATCH`/`PUT` body may
  carry one half of a cross-field rule (`type` without `nip`) or the other, so a DTO constraint
  sees only one side — and `updateOne` does not run the schema validator. The rule has to be
  re-checked on the *merged* record in the service, which is the only point both halves are
  visible. `ClientService.updateClient` merges `{...current.toObject(), ...body}` and refuses a
  company left without a NIP; a DTO-only implementation would let that through.
- **The clients read is paged and searchable, and it reuses the booking list's helpers (T037,
  #123).** `GET /clients` answered a bare array and downloaded the whole collection, which
  FR-043 forbids; it now answers the same `{items, total, page, limit}` envelope `GET /bookings`
  does. `resolvePagination` and `DEFAULT_LIMIT` are imported from `bookings/list/booking-list`
  rather than copied, so the two reads cannot disagree on a default or a cap, and the escape for
  the search term lives in `utility/escape-regexp.ts` for the same reason — one list escaping
  and the other not is the drift that matters. The sort is `{name: 1, _id: 1}`: `name` is the
  column and the index, and `_id` breaks a tie so two clients with the same name do not swap
  between pages (the same total-order reasoning as the booking recency index). A whitespace-only
  or empty `search` is dropped rather than compiled, because a `$regex: ''` matches every record
  and looks like a working search that returns everything.
- **The global `ValidationPipe` does not validate a top-level array body.** Nest's pipe
  declines an `Array` metatype (`toValidate` excludes it), so `@Body() x: SomeDto[]` reaches the
  handler unchecked — no `whitelist`, no field rules, and an extra property is silently kept.
  A route whose body is an array must attach `ParseArrayPipe({items: SomeDto, ...})`, and it
  needs the validation options passed explicitly because it builds its own `ValidationPipe`.
  Those options live in `apps/server/src/app/config/validation-options.ts` so the global pipe
  and the array pipe cannot drift. `PUT /bookings/{_id}/booked-times` is the case in point
  (T021); the `ParseArrayPipe` default status is 400, so `errorHttpStatusCode: 422` has to be
  carried across or the contract's 422 becomes 400 on that route alone.
- **A field with its own route must be stripped from the generic update.** `updateBooking`
  deletes `accepted`, `archive` and `bookedTimes` from the body before writing, because each has
  a dedicated route carrying a rule the generic update does not run (conflict check, resolved-slot
  immutability). `BookingDto` declares all three, so without the strip the rule is enforced on
  one route and absent on the other that writes the same field — and `forbidNonWhitelisted` does
  not help, because the field *is* whitelisted. When a write rule is attached to a dedicated
  route, add the field to that strip list.
- **A passing lint cannot prove a rule is live.** `@nx/enforce-module-boundaries` is what
  caught the 33 errors fixed in PR #59, and it is the rule most likely to vanish silently in a
  config-format change. Verify it by adding an `@server/*` import inside `apps/server` where a
  relative import is correct and confirming lint *fails*; a green run looks identical whether
  the rule works or is absent (U023).
- **`@typescript-eslint/types`, `@typescript-eslint/utils` and `jsdom` are direct devDependencies
  on purpose.** `@angular-eslint@22` peers `@typescript-eslint/utils@^8` and
  `jest-preset-angular@17` peers `jsdom@>=26`, but nothing else pulls either one in, so yarn 1
  reports them as unmet peers even though the packages are hoisted and working. Declaring them
  is what clears the install warnings (U028). Do not remove them as "unused" — `yarn why` shows
  no other requester, which is exactly the point.
- **Two `incorrect peer dependency` warnings remain and are not fixable here.** `@napi-rs/wasm-runtime`
  (inside `@angular/build`'s optional `wasm32-wasi` binding) wants `@emnapi/core@^1.7.1`, while
  `nx@23.3.1` pins `@emnapi/core` to exactly `1.4.5`. That is an upstream disagreement between
  Nx and Angular; forcing it with a `resolutions` entry would override Nx's exact pin. They are
  warnings about an optional wasm path, not a resolution error.
- **`bcrypt` is a native addon.** It is the one dependency that can break on a Node upgrade
  independently of version ranges; confirm it loads and hashes after any runtime change.
  `bcrypt@6` builds and hashes fine on Node 24.
- **`@nestjs/config` has no 11.x line.** Its majors jump 4 → 12, so a NestJS 11 upgrade takes
  `@nestjs/config@4.0.4`, which peers `@nestjs/common ^10 || ^11`. Do not read the shared
  major number as a package version.
- **TypeScript 6 defaults `strict` to `true`.** This is the single biggest trap in the
  Angular 22 step, and it is not Angular's doing: the same source that compiles under
  TypeScript 5.5.4 fails under 6.0.3 with no tsconfig change. Verified by A/B against both
  compilers — under 5.5.4 `{}` compiles, under 6.0.3 `{}` reports TS18046/TS18047/TS7006.
  The repository predated strict mode, so `tsconfig.base.json` set `strict: false` to keep
  the previous semantics. **That pin has been removed (#105); the compiler default now
  applies.** The migration was 91 errors in the server and none in the UI: 85 `TS2564`
  class properties (Mongoose schemas, DTOs, `env.validation.ts` — all populated by
  decorators or the framework, so `!` is the deliberate annotation), 43 `TS18046` catch
  clauses across 23 blocks, 2 `TS7016` for `bcrypt` (fixed by installing `@types/bcrypt`),
  plus `TS7053`, `TS2366`, `TS2345` and `TS18047`. Measured by flag, `strict` is eight
  flags and they do not sum: four report 0 errors on their own, `strictPropertyInitialization`
  reports 1 alone but 85 once `strictNullChecks` is on. Do not plan this per-flag.
- **`target` is `es2022`, in both `tsconfig.base.json` and `apps/server/tsconfig.app.json`.**
  Both had to move: the server's `tsconfig.app.json` sets its own `target` and does not inherit
  the base one, so changing only the base leaves the server emitting ES2015 (U010).
- **`moduleResolution: "node"` (node10) cannot read Angular 22.** Angular 22 packages are
  `exports`-only — `@angular/common` ships no physical `http/` directory, only
  `exports["./http"]`. node10 ignores `exports` maps, so `import { HttpClient } from
  '@angular/common/http'` fails with TS2307 even though the types exist. `tsconfig.base.json`
  uses `moduleResolution: "bundler"`, which also lets `baseUrl` be dropped: `paths` entries
  are already `./`-prefixed, so they resolve relative to the tsconfig. Both `baseUrl` and
  node10 are hard errors under TypeScript 6 (TS5101/TS5107), not warnings.
- **Removing `@angular-devkit/build-angular` removes `webpack`.** The server builds with
  `@nx/webpack:webpack`, which needs `webpack` at the workspace root. `webpack` used to arrive
  transitively via `@angular-devkit/build-angular`; once Angular 22 uses `@angular/build`,
  nothing provides it and the server build dies with `Cannot find module 'webpack'` — a
  failure that looks like an Nx problem and is not. `webpack@^5.112.2` is now a direct
  devDependency.
- **`@angular-eslint` 22 requires flat config, and that is now the state.** v22 drops the
  legacy `dist/configs` entry points, so an `.eslintrc.json` workspace cannot use it
  (`Failed to load config "plugin:@angular-eslint/recommended"`). The 21 → 22 move was held
  until Stage 5 moved ESLint to flat config; both have now landed, so `@angular-eslint/*` and
  `angular-eslint` are on 22.6.0 and there is no version ceiling left here. If this ever has to
  be reverted, it reverts *with* the flat config, not on its own.
- **`@angular-eslint` 22 adds `prefer-on-push-component-change-detection` as an error.** In
  Angular 22 `OnPush` is the default, so the rule fires only on an explicit
  `changeDetection: ChangeDetectionStrategy.Default`, not on a component that omits the
  property. A component with no `changeDetection` is already compliant.
- **`@angular-eslint@21` adds `prefer-inject`.** It flags constructor parameter injection in
  favour of `inject()`. `AppComponent` was migrated rather than disabling the rule.
- **Mongoose 9 removed callback-style middleware.** `pre('save', function (next) {...})` no
  longer compiles — `next` is typed `SaveOptions` and calling it is TS2349. Write hooks as
  plain async functions instead. `@nestjs/mongoose@11` pulls this in with Mongoose 9.
- **`nx test` does not type-check files no spec imports.** The `user.schema.ts` TS2349 above
  passed `nx test` and only failed `nx build`. When a dependency bump changes library types,
  run the build too — a green test run is not a type check.
- **Inside `apps/server`, use relative imports.** `@server/*` resolves to a file in the
  same project, which trips `@nx/enforce-module-boundaries`. Cross-project imports use
  the `@models/*` alias, which is fine.
- **Never commit `apps/server/.env`.** It is gitignored; `apps/server/.env.example` is the
  template. The real MongoDB URI and `JWT_SECRET` were committed historically and remain in
  git history.
- **`ui:test` is no longer a single spec (T032).** The UI foundation landed the shell, the core
  stores/guards/interceptors and the shared kit with specs for each, so the project now has a
  real suite. The original warning still holds in spirit: a green UI run is evidence the
  *unit* behaviour works, not that the screens do — T034–T040 are the surfaces that need
  their own tests. `apps/ui/jest.config.ts` carries a `coverageThreshold` that was measured at
  introduction and is a ratchet; adding an untested component lowers it and fails the run.
- **Angular is zoneless, so a spec cannot drive a component with a plain mutable field.**
  `provideZonelessChangeDetection()` means only a signal write marks a view dirty. A host
  whose binding is `[open]="open"` with `open` a plain property renders once and then ignores
  every later `fixture.detectChanges()`, so the child's signal input never changes — the test
  fails while the component is correct. Bind to a signal (`[open]="open()"`, `open = signal()`)
  or use `fixture.componentRef.setInput(...)`. `ModalComponent`'s spec hit exactly this: the
  open/close `effect` looked broken and was not. The same trap is why `test-setup.ts` calls
  `setupZonelessTestEnv()`, not `setupZoneTestEnv()`.
- **jsdom does not implement `HTMLDialogElement.showModal`/`close`.** `ModalComponent` is built
  on the native `<dialog>` for the focus trapping and inertness it gives free, so the gap is in
  the environment, not the component. `test-setup.ts` installs the two methods when they are
  absent. Any future `<dialog>`-based control inherits that stand-in; do not "fix" a
  `showModal is not a function` failure by moving off `<dialog>`.
- **Integration tests use `createMongoTestContext()`** (`apps/server/src/testing/`). CI has no
  MongoDB, so it starts an ephemeral `mongod` via `mongodb-memory-server`. Three traps, all
  already handled there:
  - **MongoDB driver 7.x + Jest = a 27-second hang, not an error.** The driver resolves its
    `os` adapter with a dynamic `import('os')`, which Jest's `vm` sandbox rejects
    ("A dynamic import callback was invoked without --experimental-vm-modules"). The driver
    swallows the rejection, so client metadata ships without its `driver` sub-document and
    `mongod` refuses the handshake. `MongooseModule` then retries 9x every 3s, which looks
    like a hang. Fix: pass `runtimeAdapters: {os}` to `createConnection` (test-only; the
    production app resolves `os` normally).
  - **The connection must be overridden, not just the URI.** `runtimeAdapters` cannot be
    expressed through `MongooseModule.forRoot(uri)`, so the harness overrides the
    `getConnectionToken()` provider with a connection it builds itself.
  - **`AppModule` reads `DB_URI` at import time.** Import it *after* `mongod` is up, never at
    module top level, or the URI is captured as `undefined`.
  `reset()` drops the database between tests, and `mongo-test-context.spec.ts` proves the
  harness boots the real app and that isolation works.
- **The `mongod` version is pinned** in `apps/server/src/testing/mongo-version.ts`. Left
  unpinned, `mongodb-memory-server` resolves the latest supported version at install time, so
  the same commit could be tested against different servers. CI caches the ~220 MB binary,
  keyed on the version.
- **`actions/cache` does not expand `~`.** The first version of that cache step used
  `path: ~/.cache/mongodb-binaries`; it looked for a directory literally named `~`, so it
  never restored and never saved, and the only signal was a warning. The workflow now sets
  `MONGOMS_DOWNLOAD_DIR` to an absolute `${{ github.workspace }}/.cache/mongodb-binaries` and
  caches that. The restore must also come *before* `yarn install`, because the package's
  postinstall hook downloads the binary when it is missing.
- **Jest's `coveragePathIgnorePatterns` are matched against absolute paths.** `^src/main\.ts$`
  matched nothing and `main.ts` sat in the denominator at 0%; use `/src/main\.ts$`. Prefer
  unanchored suffixes (`.module.ts$`) or anchor on `/src/`.
- **A glob `coverageThreshold` group is enforced per file, not per directory.** Adding
  `'**/src/app/authorization/**/*.ts': {statements: 80, ...}` means *every file* under that
  path must reach 80%, not that the directory's aggregate must. Verified by deleting one spec
  and watching the run fail with `Coverage for statements (0%) does not meet
  ".../ownership.ts" threshold`. That is the stronger reading and the one SC-008 wants.
- **Adding a threshold group silently removes those files from `global`.** Jest assigns each
  file to the first matching group and only unmatched files fall through to `global`, so the
  first per-directory group made the global figure *fall* (81.62 → 78.18 statements) even
  though the excluded files were at 100%. Re-derive `global` from the report whenever a group
  is added; the drop is the arithmetic, not a regression.
- **A narrower group key must come before a broader one, or it is dead.** Jest assigns a file
  to the *first* matching key, so `'**/src/app/bookings/conflicts/**/*.ts'` has to be declared
  above `'**/src/app/bookings/**/*.ts'` (T045); reversed, the broader key claims the conflict
  rules and the narrower one matches nothing. The two happen to carry the same 80 floor today,
  so the ordering is invisible until one of them is tightened — which is the point of keeping
  them separate.
- **The `bookings/**` group could not be set until T045.** Jest applies a glob threshold per
  file, and `models/booking-query.dto.ts` sat at 75% branches until its spec drove the real
  `ValidationPipe` over every `BooleanQuery` arm, including the explicit-`undefined` case
  class-transformer skips. The group is now in and every file under `bookings/` measures 100%.
  `booked-time.schema.ts` needed its own spec for the same reason: its `endHours` validator
  guards against a non-`Date` value, and that arm is *unreachable* through parent validation
  because the `type: Date` cast runs first, so the spec calls the validator directly.
- **The `global` branch floor moved with T045 (94 → 95).** Adding the 100%-covered `bookings/`
  group lowered the pool's aggregate branches to 93.56 — just under the old 94 — so the floor
  was not lowered; reachable defensive arms were covered instead (the error filter's
  non-`Error` throw and unusable response, the redactor's unserialisable structure, and the
  request context read outside a request). Some arms stay uncovered on purpose because they
  are not reachable from a test without contriving the failure: `mail-transport.ts`'s
  `String(e)` for a non-`Error` rejection, the correlation middleware's array-header case, and
  the interceptor's non-HTTP context. Measure the pool with `minimatch` against the real
  absolute paths, not by reading the report's `total`.
- **`JwtStrategy.validate` must `await` the user.** Passing the promise to `done` sets
  `request.user` to a `Promise`, so `RolesGuard` reads `role` off it, finds `undefined`, and
  refuses every role-restricted route for every caller — including an administrator. The
  failure is a silent `403`, not an error. `jwt.strategy.spec.ts` asserts the resolved value is
  not a `Promise` so this cannot regress.
- **The `User` schema carries `role`.** `libs/models/user.model.ts` declares it and
  `users/schemas/user.schema.ts` enforces it as required with no default (T007, #11). A
  default would have been a silent privilege decision: `ADMIN` makes every unroled user an
  administrator, `EMPLOYEE` grants the least-privileged role to a caller who meant something
  else.
- **The JWT payload carries `role`, and it must come from the database.** `RolesGuard` reads
  the role off `request.user`, which `JwtStrategy` builds from the payload, so a token minted
  without a role lets an administrator in but refuses every role-restricted route to everyone.
  `JwtPayload.role` is required, which is what makes that a compile error rather than a silent
  `403`. The sign-in handler takes it from the stored user and never from the request body — a
  body-supplied role would let any caller mint an administrator token.
- **`JwtPayload._id` is a `string`; a hydrated `user._id` is an `ObjectId`.** It worked
  untyped because JSON serialisation converts the `ObjectId` to its hex string, so the token
  was already a string and only the type was wrong. Annotating the payload surfaces it as
  TS2322; `String(user._id)` is the fix.
- **`@Roles` on the class is what makes a new route restricted by default.** `RolesGuard` uses
  `getAllAndOverride`, so a route-level `@Roles` overrides the class one and a route without
  any inherits it. `UsersController` relies on this (T015): every route is administrator-only,
  and the integration spec fails with `200` where it expects `403` if the decorators are
  removed. `ClientController` (T025) uses the same shape with a wider class default
  (`@Roles('OFFICE','ADMIN')`) and narrower route overrides (`@Roles('ADMIN')` on the writes),
  and `BuildingController` is `@Roles('EMPLOYEE','OFFICE','ADMIN')` with the same
  administrator-only writes — so "read for staff, write for admin" is one class decorator plus
  three route decorators, not five per-route decisions.
- **The role matrix is asserted per role, and an administrator-only row must refuse the
  *office* role as well as the employee (T046, SC-001).** An earlier round of specs proved an
  employee's `403` on the approve, archive, conflicts and facility-write rows and stopped
  there, which leaves the office role untested: it is the one role that sits between employee
  and administrator on several rows and the one most likely to be accidentally admitted by a
  `@Roles('ADMIN')` widened to `@Roles('OFFICE','ADMIN')`. Every administrator-only row now
  carries an office refusal, and the success half of each row is proved too — the users create
  and single read, the client single read, the facility single read for each staff role, the
  booking single read, and the CSV export — rather than inferring them from a neighbouring
  route that shares the decorator. A decorator that is attached is not the same claim as a
  decorator that is attached *and* produces the right status on each route.
- **An unauthenticated write is `401`, not `403`, even on a route whose `@Roles` is narrow.**
  The route-level `@Roles('ADMIN')` does not replace the class-level `AuthGuard('jwt')`, so the
  credential is checked first: an absent token answers `401` before `RolesGuard` ever reads a
  role. The clients and facilities writes and the booking delete now pin that, the same
  authentication-before-authorisation order the users spec pins.
- **A new `@Roles` on a controller breaks every unit spec that boots it with only
  `overrideGuard(AuthGuard('jwt'))`.** The real `RolesGuard` then runs, reads the (absent) role
  off the stub request and answers `403` before the handler is reached, so a spec about route
  matching or handler wiring fails for an unrelated reason. `delete-routes.spec.ts` and
  `client.controller.spec.ts` both had to add `.overrideGuard(RolesGuard)`. When you attach
  `RolesGuard` to a controller, grep the specs that construct it and stub the guard where the
  spec is not itself about authorisation — the integration spec is where the role rule belongs.
- **The last active administrator is protected in `UserService`, and the role comes from the
  database (T015).** `removesLastAdministrator` reads the target's *stored* role — a
  request-supplied role would let the rule be skipped by a body that claims the target is not
  an administrator — and answers `409` when the change would deactivate it or move it off
  `ADMIN` and no other active administrator remains. It fires only on a demotion or a
  deactivation (`changes.role !== 'ADMIN'` / `changes.active === false`), so a rename of the
  sole administrator is allowed. The `countDocuments` excludes the target, so "another one
  remains" is one query rather than a read-then-count. `DELETE` is still a hard delete; the
  contract recommends deactivation (`PUT ... {active: false}`) so booking audit references
  survive, but the hard delete is refused for the last administrator rather than silently
  becoming a deactivation.
- **`RolesGuard` returns `403`; `AuthGuard('jwt')` returns `401`.** A guard that returns
  `false` makes Nest answer `403`, so an authentication stand-in must *throw*
  `UnauthorizedException` to reproduce the real `401`. A double that returns `false` lets a
  "not authenticated → 401" assertion pass while the real stack answers `403` — the
  integration spec comments this explicitly.
- **Sign-in answers one message for every rejection, and the message is not the only
  channel.** Unknown e-mail, wrong password and deactivated account all return `401 Invalid
  e-mail or password`. The distinct messages came from `handleAuthErrors`, a *second*
  mapping layer: the service could have thrown a generic message and the mapper would have
  rewritten it to "That email is not registered" anyway. Fixing only the service is not
  enough — the mapper is out of that path now and its two branches are deleted, because a
  dead branch that names the failing field is an invitation to reuse it. The unknown-address
  path also compares against a dummy bcrypt hash, so it does not return measurably faster
  than the wrong-password path; the timing is the same oracle the message was. The
  per-rejection `reason` still reaches the log (`auth.sign_in.rejected`).
- **`handleUserWriteError` (was `handleAuthErrors`) is the user-write mapper, not an auth
  one.** It is used only by `UserService`. Its "validation errors" branch was **dead**: it
  tested `message.includes('user validation failed')`, but Mongoose capitalises the model
  name, so the real message is `"User validation failed: ..."` and a validation failure
  returned the raw driver message (field path included) to the client. It now matches
  `err.name === 'ValidationError'`. This was found by writing the spec for the file, not by
  reading it — the branch looks correct at a glance.
- **`/auth/me` reads the account the strategy already loaded, not the token.** `role`,
  `city` and `buildings` come from the database, so an administrator's change to an account
  shows up on the next request instead of when the token expires. It is guarded with
  `AuthGuard('jwt')` and reads the user through `@CurrentUser()`.
- **Sign-out is not revocation.** `GET /auth/sign-out` clears the cookie and returns
  `{message: 'Signed out'}`; it destroys no server state, so a captured token stays valid
  until it expires. The integration spec asserts the token still authenticates afterwards,
  so the documented answer and the behaviour cannot drift.
- **`serializeUser` is what keeps the hash out of `/auth/me`, and it accepts `IActingUser`.**
  The `@CurrentUser()` parameter is typed `IActingUser` (id, e-mail, role), which is all an
  authorisation decision needs; the serialiser is called with it and drops `password` by
  allow-list. A spec that wants to prove the hash is dropped has to build an `IUser` — a
  hydrated document — because `IActingUser` does not declare a `password` field at all.
- **`OptionalJwtAuthGuard` authenticates without requiring a credential, and refuses a bad
  one.** `GET /api/bookings` is the public calendar *and* the staff calendar — one resource at
  two levels of detail — so the guard runs the JWT strategy when a token is present and lets
  the request through when there is none. It is overridden on `handleRequest`, not
  `canActivate`: a malformed or expired token must not be downgraded to anonymous, or a
  caller whose session just ended gets a silently redacted calendar instead of a `401`.
  Whether a credential was *presented* is the only thing that separates "absent" from
  "invalid", so it is checked explicitly rather than inferred from the absence of a user.
- **`overrideGuard(AuthGuard('jwt'))` does not cover a subclass.** `OptionalJwtAuthGuard`
  extends `AuthGuard('jwt')`, so a spec that overrides only the base class leaves the real
  guard in place and the request is answered `401` before reaching the controller. Both must
  be overridden. This is the same shape as the `RolesGuard` note above: the guard most likely
  to be missed is the one attached to the route you just changed.
- **The public booking scope is one boolean, not two decisions.** `BookingController` computes
  `staff` once and uses it for both the query filter and the response shape. Computing the
  filter from the user and the shape from the request is what served a restricted query's
  results *unredacted* when the two inputs disagreed — a hole the unit spec's fail-closed
  cases caught, not review. Both inputs are fail-closed: `request.isPublic` must be exactly
  `false` and the user must carry a recognised role, so an unmarked request and a user with no
  role both read as public.
- **`serializePublicBooking` deletes five named fields and goes through `toJSON`.** The list
  is a `const` tuple asserted one name at a time, because a redaction list that is wrong is a
  data leak and a count assertion would not catch a missing name. `clientId` is one of the
  five: it is a foreign key into the client records, so leaving it in lets an anonymous caller
  enumerate clients (issue #20). It spreads `toJSON()` rather
  than the document: Mongoose data lives on internals, so spreading a document directly yields
  the schema's internals, not the fields. Assert against the raw response *text* in an
  integration test — a field present but `undefined` still travels, and `toHaveProperty`
  does not see it.
- **`validateUser` re-checks `active`, not just the signature.** Sign-in already refused an
  inactive account, but a token lives for a day, so an account disabled after its token was
  issued kept working until the token expired. Found by the integration case that deactivates
  a user and re-uses the token it already holds. `=== false` rather than a falsy test, so a
  legacy document with no `active` field stays active.
- **The booking schema now carries `nick`, `discount`, `extraOptions` and `selectedOptions` (T010).**
  `nick` is required (3–100) because the public calendar shows it in place of the redacted
  personal fields; a booking without it would be unlabelled to an anonymous caller.
  `discount` is an optional string validated against `^[0-9]{1,3}%$` in the schema *and* the
  DTO — the schema is what stops a direct write from storing `10`, the DTO is what answers
  `422` at the boundary. `extraOptions` is *derived*: the service sets it from
  `selectedOptions.length > 0` on create, and the DTO does not declare it, so a caller cannot
  supply a second, contradictory value. It is a stored boolean rather than a virtual because
  the legacy reporting reads it directly and a virtual is absent from a projection or an
  aggregation. The DTO no longer `implements Booking` for the same reason
  `building.dto.ts` does not: the request body and the stored document are deliberately
  different shapes (server-owned audit fields, the derived flag).
- **`BookingDto.bookedTimes` had no `@ValidateNested` (T011).** The field carried only
  `@ArrayMinSize(1)`, so the global pipe checked that the array was non-empty and nothing
  inside it — every per-slot rule (the `endHours`/`startHours` order, `participants`, the
  status enum) was absent on the create path, which is where the issue's crafted payload
  arrives. `PUT /bookings/{_id}/booked-times` was already covered because it attaches
  `ParseArrayPipe({items: BookedTimeDto})`, and that masked the gap: one route enforced the
  slot rules, the other wrote the same field without them. When a rule is attached to a
  route that names a DTO, check whether the *other* route that writes the field nests it.
- **The interval rule is cross-field, so it is a `ValidatorConstraint`, not a single-property
  decorator (T011).** `endHours > startHours` compares two siblings; `@Min` compares against a
  constant. `AfterStartHours` returns `true` for a non-`Date` value so a malformed field gets
  one message (`@IsDate`'s) rather than two for the same problem. The schema repeats the rule
  as a `function`-form `validate` so `this` is the subdocument — an arrow function has no
  `this` and would compare against `undefined`. The DTO is the boundary (`422`); the schema is
  what stops a migration or a script writing an inverted interval directly.
- **The schema file was renamed `booked-time.schemta.ts` → `booked-time.schema.ts` (T011).**
  The misspelling was load-bearing only in import paths; the rename used `git mv` so the
  history follows. `jest.config.ts`'s coverage comment referred to the old name and to the
  file as a blocker for a `bookings/**` threshold group — it now has a spec.
- **A per-file coverage group cannot be set for `bookings/` yet.** Jest applies a glob
  threshold to each matching file, and `models/booking-query.dto.ts` measures 75% branches
  (the `BooleanQuery` transform's guard arms). That is unrelated to the booking domain rules,
  so a `bookings/**` group would fail on a file T045 owns. The two schema files that blocked
  it earlier cleared with T011: `booked-time.schema.ts` gained its spec and
  `booking.schema.ts` reaches 100% because the nested validation executes its validators.
- **The booking indexes are asserted against a real `mongod`, not the schema object.** A
  declared index, a built index and an index the query planner actually picks are three
  different claims; `booking-indexes.integration.spec.ts` proves all three via `listIndexes()`
  and `explain('queryPlanner')`. `reset()` drops the database and the indexes with it, so
  `createIndexes()` runs before each test. The recency index is `{createdAt: -1, _id: -1}`,
  not `{createdAt: -1}` as `data-model.md` wrote it: `createdAt` alone is not a total order,
  so two bookings created in the same millisecond could swap between pages.
- **A raw-driver call inside an integration spec does not type-check against
  `Model<Booking>`.** `create` and `find(...).explain(...)` use shapes the hydrated-document
  overloads reject (`TS2769`, `TS2352`), and `nx test` fails the whole suite to run because of
  it. Declare the three methods the spec touches as a local structural type and cast only the
  index key, rather than widening to `any` or pretending the document type fits.
- **A boolean query flag inverts under `enableImplicitConversion`.** The global pipe runs with
  `transformOptions.enableImplicitConversion`, which coerces a query string with
  `Boolean(value)` — and `Boolean('false')` is `true`. So a bare `@IsBoolean() archive?: boolean`
  turns `?archive=false` into `true`, and the filter silently asks for the opposite of what was
  sent. A `@Transform` that reads the callback's `value` does **not** help: `value` is already
  coerced by the time the transform runs. Read the raw source instead — the callback's `obj[key]`
  is still the string. `@BooleanQuery()` in `booking-query.dto.ts` is that transform; it is
  applied to `accepted`, `archive` and `all`. `booking-query.dto.spec.ts` drives the real
  `ValidationPipe` (a hand-built `plainToInstance` would not reproduce it).
- **`GET /bookings` returns an envelope, and a public caller must name a period.** The list
  answers `{items, total, page, limit}` (the `IPaginated` shape), not a bare array; `total` is a
  separate `countDocuments` on the same filter, so it is the pre-pagination count. An anonymous
  request without both `from` and `to` is `422` (`BookingRangeRequiredError` →
  `UnprocessableEntityException`), because the unbounded read is the exposure issue #26 names.
  Staff default to the current academic year; `all=true` is administrator-only and refused with
  `403` for anyone else. The period filters `createdAt` (a field T022 adds to the schema), not
  the slot date, matching the legacy `getBookingsDataByDate`. The `items` are redacted for a
  public caller, never the envelope — redacting the envelope would drop the paging fields.
  Specs that hit `GET /bookings` anonymously (`error-mapping.spec.ts`,
  `bookings.integration.spec.ts`) must now pass a period.
- **Booking ownership is an exact identity on `createdBy`, and the acting user's `_id` is an
  `ObjectId`.** `canModifyBooking` (T017) compares the booking's `createdBy` against the
  caller's id or e-mail with `ownsRecord`, which fails closed on an empty identity on either
  side. Two traps: (1) the `_id` on a real request is a hydrated document's `ObjectId`, not the
  `string` `IActingUser` declares, so `normalise` reads it as `''` and denies the record's own
  creator unless it is `String()`-converted — a string-only unit test passes and only the
  integration spec catches it; (2) the update route takes `Partial<BookingDto>`, a mapped type
  erased at runtime, so the global pipe whitelists nothing and the *service* has to strip
  `createdBy` or a caller reassigns ownership of a booking to themselves.
- **Conflict detection is pure and lives in `bookings/conflicts/conflicts.ts` (T018).** The
  overlap test is *strict* inside-or-contains, so a touching interval (`end === start`) is not a
  conflict; `day` is compared as an instant, matching the legacy `checkDay`, so a "same local
  calendar day" rewrite would diverge from the SC-002 reference. An accepted booking is excluded
  as a *reported* id but still participates as a comparison target — only the reported booking
  has to be unaccepted. `conflicts.spec.ts` holds an independent transcription of the legacy
  algorithm and asserts agreement over 200 generated sets; do not "simplify" it by importing the
  new code from both sides, which would prove nothing.
- **`GET /bookings/conflicts` must stay declared before `@Get(':_id')`.** Express matches routes
  in declaration order, so the reverse order makes `conflicts` a booking id and answers `500` on
  the `ObjectId` cast instead of the conflicts. `@Roles('ADMIN')` is on the route, not the class:
  the rest of `BookingController` is public or any-authenticated.
- **Approval-time conflict detection is `findConflictsWith(target, others)`, not
  `findConflictingBookingIds` (T020).** They answer different questions. The counter reports every
  unaccepted booking that overlaps another in the facility-month, and skips an accepted booking as
  a *candidate*. Approval is about *one* booking: only the bookings that overlap it matter, and an
  already-accepted booking is exactly the one that cannot be double-booked, so it counts as a
  conflict. `findConflictsWith` compares `target` regardless of its own `accepted` flag (the flag
  still holds its previous value while the decision is made) and never excludes an accepted
  `other`. Do not "unify" the two by adding a flag to `findConflictingBookingIds`; the two
  exclusion rules are opposite, and the unit and HTTP specs pin each.
- **The `409` on a conflicted approval carries the conflicting ids, and the global filter had to
  learn to pass a body through (T020).** `ErrorExceptionFilter` narrows every error to
  `{statusCode, message, error}`, which cannot hold `conflicts`. `StructuredHttpException`
  (`config/structured-http-exception.ts`) carries its body whole and the filter returns it
  verbatim — but only below `500`, so it can never be used to smuggle a driver message out. A
  `409` is a *client* error and is not opaque; a 5xx still is.
- **`POST` defaults to `201` in Nest, and the contract says `200`.** The approve and archive
  routes return the updated booking, not a created resource, so each needs `@HttpCode(HttpStatus.OK)`.
  The integration spec asserts `200`; without the decorator it answers `201` and the assertion
  fails for a reason unrelated to the behaviour.
- **The approve/archive body DTOs are concrete classes, not `Partial<...>`.** `ApprovalDto`
  (`accepted`, optional `force`) and `ArchiveDto` (`archive`) are declared so the global pipe's
  `whitelist`/`forbidNonWhitelisted` see a type; a mapped type is erased to `Object` at runtime
  and would let an unknown property through. The controller supplies `force ?? false` — the pipe
  does not require `force`, and a service that treated a missing value as consent would approve a
  conflicted booking silently.
- **`modifiedBy`/`modifiedAt` are written by the decision routes with the update, not by a schema
  hook (FR-016, T020).** The stamp and the flag are one `findOneAndUpdate`, so a concurrent change
  between a read and a write cannot lose the audit fields. The booking schema now declares both
  (they were absent), so a test that seeds them reads them back rather than finding Mongoose
  dropped the fields.
- **`updateBooking` strips `accepted` and `archive` as well as `createdBy` (T020).** The generic
  `PUT /bookings/{_id}` takes a `Partial<BookingDto>` body, which declares both flags, so an
  owner could set `accepted` there and skip the conflict check the approve route enforces — the
  same field would be guarded on one route and open on the other. The strip can leave the update
  empty (a caller who sent only `accepted`), and MongoDB rejects an empty update document, so the
  service returns a no-op success rather than a `500`. The approval integration spec pins that a
  generic update cannot change `accepted`.
- **The booking size is validated against the facility's allowed sizes on write, and only when
  the facility resolves (T052, FR-031).** `bookings/size/size-rule.ts` is the pure rule;
  `BookingService.assertSizeOffered` looks the facility up by `{place.place, city}` and throws
  `422` when the size is not in its `sizes`. A missing facility is *not* a size error — it is
  left to T059 (#126), which owns referential integrity; treating it here as a size failure
  would reject every fixture that uses a placeholder facility name (`hala`, `Hala`, `Sala A`)
  and report the wrong problem. On update the rule reads the *effective* pair: a body that
  changes only `size`, only `place`, or both is checked against the facility that will actually
  be stored, so the read happens only when the body touches `size` or `place`. The lookup builds
  its filter as a plain `Record<string, unknown>` rather than `FilterQuery<Building>`: `city` is
  a `string` on the booking but an enum union on the building, and Mongoose's overloads reject
  the wider type (`buildBookingQuery` does the same). `booking-size.integration.spec.ts` iterates
  every seeded facility and proves both the accept and the reject path over HTTP.
- **A booking whose own slots overlap is accepted and warned, not refused (T053, FR-012).**
  `bookings/slots/intra-booking-overlap.ts` reuses the booking-versus-booking `slotsConflict`
  predicate, so "overlap" means the same thing on both checks and a touching interval
  (`end === next start`) is not one. The legacy form warned ("Niektóre godziny rezerwacji
  konfliktują ze sobą") and let the request through, so the server does the same and records
  `booking.create.intra_overlap` / `booking.booked_times.intra_overlap`. The rule is attached
  to *both* routes that write `bookedTimes` — create and the replacement — because a rule on
  one route and absent on the other is the recurring defect here. `spec.md` FR-012 and §5
  Edge Cases, and `data-model.md`, carry the decision.
- **A `conflicts/**` coverage group was added with T018 (SC-008).** Like `authorization`, it takes
  its files out of the `global` pool, so the global figure is measured without it — re-derive it
  from the per-file rows, not the report's `total`.
- **Conflict detection keys on the slot day, not the stored `month` (T054, #121).** The legacy
  rule gated the comparison on `currentBooking.month === b.month`, and `month` is derived from the
  booking's **first** slot. A booking whose slots straddle a month boundary (30 Sep + 2 Oct) thus
  carried one scalar and its cross-boundary slot was never compared against bookings in the month
  it crossed into — a *missed* conflict, which is the defect #58 recorded. `bookingsConflict` now
  compares only the slots, which is sound because two slots can only overlap when they share a
  day; the day test subsumes the month gate everywhere the gate was correct. Both conflict queries
  scope by `bookedTimes.day`: the counter (`GET /bookings/conflicts`) takes a `from`/`to` **date
  range** rather than a 0-based `month`, and the approval check uses the target's own day set
  (`$in`). The stored `month` is now a documented denormalised hint nothing reads; it is kept only
  because the migration tool (T041) and the UI form (T035) still carry it. The
  facility-month index is replaced by `{place.city, place.place, bookedTimes.day}`.
- **The SC-002 oracle keeps the legacy month gate, and the generator must stay inside the domain
  it got right.** `conflicts.spec.ts` transcribes the legacy algorithm *including*
  `current.month === other.month`, so its `booking` inputs carry no month and `asLegacy` stamps
  each with the first-slot-derived month at comparison time. The generated sets are all
  single-slot, so a generated booking's legacy month always matches its day and the two agree; a
  *crossing* booking would disagree with the oracle by design, so those cases are named tests that
  assert the legacy transcription misses what the corrected rule finds (month and year boundary)
  rather than generated. Do not "simplify" by removing the month gate from the transcription or
  by generating crossing bookings — either removes the contrast that pins the correction.
- **`POST /bookings` is public, and the RODO rule lives in the service, not the DTO (T023).**
  The route runs `OptionalJwtAuthGuard`, so an anonymous visitor can submit; the controller
  passes `request.isPublic !== false` to the service and the service requires
  `rodoAcknowledgement: true` only for a public caller. The DTO declares the field *optional*
  because `whitelist` would otherwise strip it before the service could read it — a `@IsBoolean`
  that is not declared is not validated, it is removed. Staff entering a booking on a tenant's
  behalf are exempt, matching the legacy staff path. The acknowledgement is stored on the
  booking, so the consent is provable rather than merely required.
- **`accepted` and `archive` are no longer in `BookingDto`, and the create path forces them
  (T023).** They are administrator decisions taken on the approve/archive routes, so leaving
  them in the create body let a public submission set `accepted: true` and skip the conflict
  check. The service writes `accepted: false, archive: false` regardless of the body; the
  contract keeps the two on the `Booking` *response* shape only. The existing create specs that
  still sent the flags now get a `422` from `forbidNonWhitelisted`, which is the intended signal.
- **A PR that is green on its base can be red once a sibling PR merges.** T052 (#152) and T023
  (#148) each passed CI on the pre-merge `main`, but T023 changed `createBooking` to take a third
  `isPublic` argument and removed `accepted`/`archive` from `BookingDto`, and T052's specs were
  written against the old shape. Merging them in sequence left `main` red — a *semantic* conflict
  the text merge cannot see, because the two changes touch different lines. When two open PRs
  touch the same method signature or request body, merge one, rebase the other, and re-run tests;
  do not trust each PR's own green run.
- **`updateBooking` stamps `modifiedBy`/`modifiedAt` after the empty-body check (T023).** The
  stamp must come *after* the "strip left nothing" early return, or a no-op request becomes a
  write that only records who asked for nothing. Stamping is what makes the generic update
  attributable like an approval (FR-016).
- **All instant↔civil-calendar conversion goes through `@booking/date-time` (`libs/date-time`,
  T019/T055, R4).** It moved out of `apps/server/src/app/utility/facility-time.ts` so the API
  *and* the UI import one implementation; a copy in each app is the drift R4 exists to prevent
  and it stays invisible until the two disagree on a DST day. It uses
  `Intl.DateTimeFormat('Europe/Warsaw', {hourCycle: 'h23'})`; the `h23` is load-bearing —
  the default cycle reports local midnight as hour `24`, which shifts every day boundary. Do not
  replace it with a fixed `+1`/`+2` offset or a "same UTC calendar day" test: `startOfFacilityDay`
  returns `23:00Z` the day before spring-forward and `22:00Z` the day before fall-back, and the
  spec pins both. `addFacilityDays` preserves the *wall-clock* hour, so a day is 23 or 25 hours
  long across a transition — that is the point, not a bug.
- **Cyclical expansion is `bookings/cyclical/cyclical.ts` and its count is `floor(days/7) + 1`
  (T019).** The rule is "slots on `startDay` and every 7 days after, keeping each slot day not
  after `endDay`", both endpoints inclusive. The legacy `do/while` over `round(days/7)` emitted one
  extra occurrence for every sub-week range; `cyclical.spec.ts` contrasts the two counts so the
  off-by-one cannot come back. `expandBookingTimes` throws `RangeError` when `endDay` precedes
  `startDay`, and `endHour` may be `24` (local midnight at the end of the day).
- **A per-directory threshold group removes its files from `global`.** Jest's `global` key
  aggregates only the files no *more specific* glob key matches, and the `coverage-summary.json`
  `total` row still counts everything. So with `'**/src/app/authorization/**/*.ts'` at 80, the
  `global` figure is measured without `authorization/` — at 100% it lowers the global number.
  Reading `total` (87/87/71/86) and setting `global` to that makes the run fail with "does not
  meet global threshold" while the printed report looks like it passes. Derive the floor by
  summing the per-file rows that do not match the specific glob.
- **Test scaffolding is excluded from coverage** (`/src/testing/`). It is ~98% covered by its
  own spec, so counting it inflated the global figure from 54.18% to 67.44% without a line of
  production code changing.
- **The reference seed is idempotent by upsert, not by "insert if empty" (T012).**
  `ReferenceDataService` (`buildings/seed/`) matches each facility on the `{city, property}`
  key the schema already declares unique, so a second run leaves twelve documents and a
  *partially* seeded database is completed rather than skipped. An "is the collection empty?"
  guard looks equivalent and is not: it skips the whole seed the moment an administrator has
  created one facility by hand. The constant (`facility-seed.ts`) is authoritative, so the
  seed `$set`s every field and reverts an edit — which is why the `onApplicationBootstrap`
  hook runs only when `SEED_REFERENCE_DATA` is the exact string `true`. Do not route that flag
  through `validateEnv`: `enableImplicitConversion` coerces with `Boolean(value)` and
  `Boolean('false')` is `true`, so a boolean field would turn the seed on whenever the
  variable was present at all (same trap as the query-flag note above).
- **`street`/`zipCode` on a facility are optional, and that is deliberate (T012).** Neither
  `spec.md` §4, FR-009 nor the legacy `building-data-const.ts` carries a facility address —
  the only municipal address in the legacy repository is SISK's own office in the footer.
  Both fields were `required` because the building schema was copied from the client schema,
  error strings included ("Please add client street"). Requiring them would have forced the
  seed to invent twelve addresses, so they are optional in the schema, DTO, contract and
  `data-model.md`. `spec.md` §4's per-city tables, CHK004 and the legacy constant all list
  **twelve** facilities; §1's introduction said "13" and was corrected to match.
- **`ui-e2e` is now part of the CI gate (T047).** The generated stub is gone; the project
  runs three P1 journeys (`public-journey`, `staff-auth`, `admin-approval`) against the real
  stack. The harness (`apps/ui-e2e/src/support/backend.ts`) starts an ephemeral
  `mongodb-memory-server` and spawns the *built* `dist/apps/server/main.js` in
  `setupNodeEvents`, and the browser reaches it through the `/api` proxy the dev server
  carries (`apps/ui/proxy.conf.json`). Seeding is exposed as Cypress tasks because a spec runs
  in the browser and cannot open a database connection; each spec resets the seed in
  `beforeEach`. `server-e2e` is still not gated — it is a different project and T047 covers
  only `ui-e2e`.
- **The `ci` configuration serves the production UI bundle through `ui:serve:production`, not
  `ui:serve-static`.** `@nx/web:file-server` cannot do both: its `spa` option makes a single
  404-fallback proxy and the `/api` proxy then swallows the deep links, so `cy.visit('/sign-in')`
  answers `404` from http-server rather than the SPA. It also cannot read the UI's structured
  `outputPath` (`{base, browser}`) — `getBuildTargetOutputPath` passes the object straight to
  `path.join` and dies with `The "path" argument must be of type string`. The Angular dev
  server serves the production build *and* honours `proxyConfig`, so it is the correct target
  for a headless CI run. The e2e job needs `xvfb-run` for Electron.

## CI

`.github/workflows/ci.yml` runs lint, unit tests, build, the P1 journey end-to-end tests and a
client-bundle secret scan on every PR, then a `gate` job that fails unless all of them passed.
The e2e job (`xvfb-run -a yarn nx e2e ui-e2e --configuration=ci`) boots its own `mongod` and
the built server, so it needs the same `MONGOMS_DOWNLOAD_DIR` cache as the unit-test job.

- **The client-bundle secret scan is `tools/scan-bundle.js`, and the pattern list lives there.**
  It was inlined in the `secrets` job and in `quickstart.md`, two copies that had already
  drifted: both omitted the EmailJS `template_` ids and the Gmail rule SC-007's issue names.
  The script is the single copy now and both places call it. `scan-secrets.js` is a different
  check — it scans *source* for a real credential and allows placeholders; `scan-bundle.js`
  scans a *build* and allows nothing, because a public bundle has no legitimate reason to carry
  any of these strings. Do not merge them: the placeholder exception is what makes the source
  scan usable and would make the bundle scan useless.
- **The list read is proved index-served, not just fast.** `performance.integration.spec.ts`
  (T050) seeds a year of bookings and asserts the query plan contains `IXSCAN` and no
  `COLLSCAN`. Walk the whole `inputStage` chain to find it — `LIMIT`→`FETCH`→`IXSCAN` is three
  levels, so reading only the top two stages reports no index and the assertion fails on a
  correct plan. The wall-clock bounds are the specification's own 2 s/3 s targets, an order of
  magnitude above the measured value, so a failure is structural rather than a slow runner.

## Branch ruleset

`main` is protected by the `OpenHandsBookSpace` ruleset (id 26131068): deletion and
non-fast-forward blocked, PR required, and the single `CI` check required. Require `CI`
alone — the `gate` job already aggregates lint, test, build and secrets with `if: always()`,
so listing the four sub-checks individually is redundant and, if a job is ever renamed,
leaves a check that can never be satisfied.

Three things that are easy to get wrong:

- **`git push --dry-run` does not validate rulesets.** It reports success while the real
  push is rejected. Do not use it as a gate in scripts.
- **The ruleset has `bypass_mode: always` for Repository admin**, so CI does not actually
  block a direct push to `main` by an admin. It protects against accidents, not against you.
- **Testing a bypass-enabled rule with a bypass-enabled token is self-defeating.** The push
  succeeds, so the test proves nothing about the rule. Read the ruleset config via
  `GET /repos/{owner}/{repo}/rulesets/{id}` instead of pushing to `main`.

## Issue closure

- **A `Closes #N` line is not evidence the work landed.** PR #131 was titled "Add roles to
  the users schema and restrict the users endpoints to administrators (T007, T015)" and
  carried "Closes #11 and closes #15" — the second was copied in without the task. Issue #15
  (T011) read `closed / completed` for two days while `booked-time.schemta.ts` was still
  misspelled and unvalidated on `main`. When resuming from a closed issue, open the closing
  PR's diff and confirm it touched the files the issue names; do not trust the issue state.
  `git log --oneline -- <path>` is the check that cannot be fooled by a stale issue.
- **Batch the closes-line to the tasks the PR implements, not to the slice it sits in.**
  #131 covered T007/T015 and named #15 as well; #98 (`#78–#81`) and #99 (`#87,#88`) batched
  correctly and their tasks were all genuinely done. A PR that closes four issues is fine;
  a PR that closes an issue it does not implement is the defect.
- **Closing by hand is the other way a task state drifts.** #74, #90 and #91 have no
  referencing PR at all — an administrator closed them after verifying the work by hand.
  All three were genuinely done, but there is no automated evidence: verify against the tree
  (`project.json` executor, `.nvmrc`/`engines`/Dockerfiles, `env.validation.ts`) rather than
  the issue's state.
- **A `Refs #N` line with no close is the third drift, and the honest one.** PR #130
  (`2f8063e`) landed `RolesGuard`, `@Roles` and `@CurrentUser` and wrote "Refs #49, #18, #21.
  Does not close them: see Scope below" — it built the *primitives* and deferred the wiring to
  T007/T015/T016/T025. That was correct at the time, so #18 (T014) stayed open and `tasks.md`
  kept T014 unchecked, while `AGENTS.md` and the matrix notes describe the guard as landed.
  The two are not in conflict: the primitive exists, the task is the primitive *plus* its
  application, and only the former was on `main`. When a task is described as landed in one
  artefact and open in another, read the PR's Scope section — the answer is usually "landed
  in slices", and the check is whether the *later* slices exist in the tree. Here they do
  (T007 `role`, T015 users, T016 public read, T017 ownership, T025 client/facility writes),
  so the task is genuinely complete and only its bookkeeping lagged.
- **A task identifier is an issue title, so two artefacts can collide on one.** `tasks.md`
  defined `T061` as "notify the applicant on approve/reject" while issue #128 held `T061` for
  the Polish copy catalogue, and `contracts/notification-templates.md` called the same
  notify-applicant work `T060` while `tasks.md` gave `T060` to backup and retention — so the
  two documents disagreed with each other as well as with the issue. The notify-applicant task
  is now `T062`, `T060` is backup and retention and `T061` is the copy catalogue, matching the
  issue titles. Before adding a task, grep the whole repo (`tasks.md`, `contracts/`, `README`,
  `quickstart.md`, `research.md`, `data-model.md`) for the identifier, not just `tasks.md`;
  several `T05x` tasks were referenced in prose before they had an entry. The issue title is
  the authority, because that is what a `Closes #N` line resolves to.

## Angular UI conventions that are easy to break

- **A dialog is `ModalComponent` (native `<dialog>`), never a `<section role="dialog">` (T048,
  NFR-006/FR-039).** `showModal()` is what provides focus trapping, `Esc`-to-close, an inert
  background, a `::backdrop` and focus returned to the trigger; a hand-rolled box carries the
  `role` and none of the behaviour, which is a dialog only to a screen reader that cannot tell
  the difference. Six dialogs (the four bookings ones and the two clients ones) were hand-rolled
  until T048. The body is projected, so the caller keeps its own fields and buttons; the
  component owns only the chrome and the accessible name (`aria-modal`, and an `aria-labelledby`
  pointing at a heading rendered *only while open*, so a closed dialog adds no text to the
  page). `Esc` closes the element natively and the component forwards the resulting `close` as
  `(closed)`, which the caller must wire to clear its pending target — otherwise a dismissed
  dialog leaves stale state behind. The element is closed, not removed, because `close()` is
  what restores focus to the trigger. A confirmation that demands an answer is
  `role="alertdialog"`.
- **A field's error must be tied to the control, not merely rendered beside it (T048).**
  `InputComponent` and `SelectComponent` both set `aria-invalid` and `aria-describedby` on the
  control and put the message in a `role="alert"` node with the matching id. `SelectComponent`
  rendered the message but did not associate it until T048, so a `<select>` error was silent to
  assistive tech while the `<input>` beside it was announced — the same error, two behaviours.
  When adding a field control, copy the association from `InputComponent`, do not just render
  the text.
- **Navigation marks the current page with `aria-current="page"`, not only a colour class
  (T048).** `RouterLinkActive` sets an `active` class, and the class is a colour/weight change —
  the "state conveyed by colour alone" defect NFR-006 names, invisible to a screen reader.
  `ariaCurrentWhenActive="page"` is what carries it, on both the top navigation and the admin
  tabs. The spec asserts exactly one link is current after navigating and that it is the routed
  one; it needs `await fixture.whenStable()` after `navigateByUrl`, because the active state is
  applied after the navigation promise resolves.
- **A `ResourceRef` has `status()`/`isLoading()`, not `isError()`.** `isError` is a private
  field on `BaseWritableResource`, so `bookingsResource.isError()` compiles in a spec but fails
  `nx build` with TS2551 (`Property 'isError' does not exist`). Read the error state as
  `status() === 'error'`. `nx test` does not type-check the template, so a green test run says
  nothing about it — the build is the only place this shows up, the same "a green test run is
  not a type check" shape as the server's `nx test`/`nx build` note.
- **`rxResource`'s `params` must be an object, and the object's identity is the reload key.**
  `stream: ({params}) => api.list(params)` gives the stream the resolved params rather than the
  whole request context. The `clients` tab passes `{search, page, limit}`; a `search` of `''` is
  sent as `undefined` so the request omits the key (the server treats an absent search as "no
  filter", and a `$regex: ''` would match everything).
- **A component that reloads after a write needs the `reload()` to be awaited in the spec, and
  `await Promise.resolve()` is not enough.** `rxResource.reload()` schedules the re-subscribe on
  a microtask chain that a single `Promise.resolve()` does not drain, so `httpMock.expectOne`
  finds no request and the test fails with "found none". `await new Promise((resolve) =>
  setTimeout(resolve))` before the `expectOne` is the reliable flush.
- **A `Row`/record read off a `Record<string, unknown>` must be indexed with brackets under
  `strict`.** `toRow(client)` returns `Record<string, unknown>`, so `row.nipLabel` is TS4111
  ("comes from an index signature, so it must be accessed with `['nipLabel']`"). The template's
  `row.nipLabel` is fine (Angular's template type-checker permits it); only the spec's direct
  access needs `row['nipLabel']`. This compiles under `nx test`'s ts-jest only because the spec
  tsconfig is checked, so a green run does catch it — the failure is at suite-compile time, not
  at an assertion.
- **A test helper that finds a control by label must scope to the panel when labels repeat.**
  `control(fixture, label)` matched any `<label>` whose text *contains* the string, so the
  reschedule dialog's "Od"/"Do" hour selects resolved to the period loader's "Od początku"
  option instead — `setSelect` silently set the wrong `<select>` and the assertion failed for a
  reason unrelated to the reschedule. Pass the dialog root (`reschedulePanel(fixture)`) so the
  lookup is scoped. The same trap applies to `pressButton`, whose label match is exact but whose
  root must be the panel when the button text also appears elsewhere. The `clients` spec hits
  the same shape: "Zapisz"/"Anuluj" appear in the form panel and would resolve to a row action
  without the `formPanel(fixture)` root.
- **A tab's body is a body in `admin.routes.ts`'s `TAB_COMPONENTS`, and `app.routes.spec`
  asserts that map.** The tab list and the routes come from `ADMIN_TABS`, but the *body* is a
  separate decision (`T036–T039` land one tab at a time). A tab absent from the map still gets a
  route and renders `AdminTabPlaceholderComponent`; moving a tab into the map is the whole
  change. The route spec carries a `realBodies` map, so adding a tab here is a two-line change,
  not a rewrite of the assertion.
- **The Facilities tab reads `GET /buildings` as staff, and that read has no compiled-in
  fallback (T038).** `FacilitiesApi.list()` types the *public* shape and `listStaff()` the full
  record; both hit the same URL — the bearer token the interceptor attaches selects the response
  — but naming the two shapes stops a screen reading `email` off a value typed as public, which
  the server had already redacted. The legacy `Building.tsx` fell back to `INITIAL_ALL_BUILDINGS`
  when the API had none; that fallback is the defect issue #42 names, so the tab renders no
  detail rows and no employees for an absent facility rather than stale static data.
  `facilityDetails(null)` returning `[]` is the mechanised form of "no fallback".
- **The employee message is one route, two audiences, and the rewrite splits sender from
  destination.** `POST /notifications/message` delivers to the SISK inbox without a `recipient`
  (public contact form, FR-034) and to that address with one (Facilities tab, FR-041). The legacy
  `Building.tsx` form had a single `email` field pre-filled with the facility address and used it
  as the destination, conflating "who replies" with "who receives"; `IMessageRequest` keeps them
  separate — `email` is the facility's contact address (the sender a reply returns to) and
  `recipient` is the employee's destination. `buildMessageRequest` reads the sender from the
  facility record, never from the form.
- **`CITY_LABELS` lives in `libs/models/building.model.ts`, beside `CITIES` (T038).** It was
  duplicated in the public calendar, the booking form and the bookings tab; the Facilities tab
  was the fourth copy. Four copies of a display label is the drift the shared model exists to
  prevent — a renamed city would render correctly on one screen and not another, with nothing to
  catch it. Import it; do not re-declare it.
- **A `linkedSignal` is the right tool for a form that must re-fill when its subject changes.**
  The Facilities tab's message form is `linkedSignal({source: selectedFacility, computation:
  emptyEmployeeMessage})`, so switching facility cannot leave the previous facility's address in
  the recipient field — the stale-state bug the legacy form avoided with a hand-written reset.
  A plain `signal` would keep the old value and only the manual `startMessage` reset would fix
  it, which is exactly the kind of hand-maintained invariant this codebase replaces with a
  derived one.
- **The navigation is driven by a `capabilities` object the API resolves, not by the role.**
  `authorization/capabilities.ts` (`capabilitiesFor`) is the single derivation; `libs/models`
  declares the shape; `openapi.yaml` (`UserCapabilities`) is the contract. It is returned on the
  sign-in body and on `GET /auth/me`. The client renders tabs from it, so a rule that lives in
  server configuration — the Summary deny-list (FR-006) — reaches the menu without being
  duplicated there. Do not re-derive a capability from `session.role()` in a component: that is
  what the legacy `credentials-function.ts` helpers did, in five files. A capability flag is
  presentation only; every one is also enforced on the endpoint it names (FR-003).
- **Two capability flags are deliberately narrower than the endpoint they gate.**
  `canSeeFacilitiesTab` is office/administrator even though `GET /buildings` admits an employee
  (the booking form needs the facility list), and `canSendFacilityMessages` is every staff member
  even though the facility *write* routes are administrator-only. Do not "unify" a tab gate with
  its endpoint's role list; the tab is the stricter gate on purpose.
- **The admin area is staff, not administrator-only.** `app.routes.ts` admits `/admin` with
  `authGuard` + `capabilityGuard('staff')`; each tab carries its own `capabilityGuard`. The
  legacy panel gave an employee the Calendar and Bookings tabs, so an administrator-only guard
  would lock them out of their own workspace.
- **`capabilityGuard` is a factory, and its redirect depends on whether a session exists.** A
  caller with no session goes to `/sign-in`; a signed-in caller who lacks the capability goes to
  `/` (the calendar), because offering sign-in to someone who holds a valid session is wrong.
  It is a `CanMatchFn`, so the chunk is not fetched for a caller who cannot use it. `admin.guard.ts`
  was removed — `capabilityGuard('staff')` plus the per-tab guards replaced it.
- **`guestGuard` keeps a signed-in caller off `/sign-in`** (redirects to `/admin`), matching the
  legacy `Login.tsx` redirect. Without it, Back after signing in shows a form that would issue a
  second token.
- **The tab list and the tab routes come from one `ADMIN_TABS` entry.** `features/admin/admin.routes.ts`
  generates a child route per tab from `shell/navigation.ts`, and `AdminShellComponent` renders the
  same list. A tab hidden by a capability and the route behind it therefore cannot disagree; if you
  add a tab, add it to `ADMIN_TABS` and it gets both.
- **`AuthService.restore()` runs from an app initializer and must complete, not error.**
  `app.config.ts` calls it through `provideAppInitializer` before the first route resolves, so a
  token the server no longer accepts is discarded at start-up. It completes even when `/auth/me`
  fails, because a throwing initializer aborts bootstrap and blanks the page. `/auth/me` returns
  no token, so `SessionStore.setUser` replaces the user and keeps the token — a restore that
  cleared the token would sign the caller out by refreshing them.
- **`SessionStore` holds `IAuthenticatedUser`, not `IUser`.** The stored shape plus the
  capabilities. `capabilities()` returns `null` with no user, and `visibleAdminTabs(null)` is `[]`,
  so the navigation fails closed rather than flashing the full menu before the session loads.
- **The sign-in form's bounds mirror the server's `LoginUserDto` (e-mail 3–125, password 6–30),
  not the legacy form's 5–100.** The server is the authority; a client that accepts a value the
  server rejects turns a specific problem into a generic "sign-in failed" after a round trip.
  `SignInComponent` shows the API's single rejection message — it must not invent a distinction
  (unknown address vs wrong password) the server refuses to make.
- **Zoneless means signal state, not `[(ngModel)]`.** `setupZonelessTestEnv()` is in `test-setup.ts`;
  a plain field read by a template would not update the view. `ui/jest.config.ts` excludes
  `/src/testing/` from coverage — it holds shared spec fixtures, not application code, and counting
  them would inflate the denominator. The UI is at 100 % on every file; the `global` threshold is a
  ratchet that is never lowered.
- **The report vocabulary lives in `libs/reporting`, and both artefacts import it.** The CSV
  export (`apps/server/src/app/reporting/csv/`) and the printable report (`SummaryTabComponent`)
  print the same values — statuses, cities, facility keys, payments, sizes, selected extra
  options — so the label map, `toPercentage`, `displayBoolean`, `displaySelectedOptions` and
  `summaryTotalBookingsNumber` are shared. A copy per artefact is the drift the constitution's
  single-source principle forbids, and it surfaces only as a report whose wording disagrees with
  the export it is supposed to match (T028 acceptance criterion 2). This is *not* the same map as
  `CITY_LABELS` in `libs/models/building.model.ts`: that one labels the UI's screen selectors, this
  one is the legacy Polish vocabulary a business artefact prints (it carries statuses, payments and
  facility keys the screens never show). The city labels agree today, but they answer to different
  audiences, so do not collapse one into the other. The library is a workspace
  project with its own `test`/`lint` targets and a 100 % `coverageThreshold`; like `date-time`, a
  change to it is *not* covered by `run-many --projects=server,ui` — add `reporting` (CI does).
  `apps/server/src/app/reporting/csv/display.ts` and `.../summary/summary.ts` now re-export from
  it, so the server's existing import sites are unchanged. The server's `display.ts` keeps the
  date/time formatting (its projection of `@booking/date-time`) and nothing else.
- **The printable report is the page, not a popup.** FR-030/T028 is satisfied by rendering the
  report in a `bs-printable` node and calling `window.print()`; `styles.scss` hides every other
  element under `@media print`. The legacy `PreviewPDF.tsx` opened a window at a hardcoded
  production URL and wrote the HTML into it, which fails offline and depends on the deployment.
  `ReportExport.print()` is the seam so a spec can stub the global rather than spy on it.
- **jsdom needs `URL.createObjectURL`/`revokeObjectURL` stubbed for a download spec.** The CSV
  download builds a `Blob` and hands its object URL to an anchor (a `data:` URI has a length
  limit that would silently truncate a large export). `test-setup.ts` installs both when absent,
  the same shape as the `<dialog>` stub, so the real download path is exercised rather than mocked
  away. The anchor must be in the document before `click()` — a detached anchor is ignored by
  Firefox — so a spec asserting the click also asserts the anchor was attached and then removed.
- **A tab's body is `TAB_COMPONENTS`, and a tab with no entry renders the placeholder.** The
  loader is the exported `tabLoader`, not an inline `??` inside the route map, so the placeholder
  branch is reachable from a spec. Every current tab has a body, so the fallback is dead in
  practice — but it is the branch a *later* tab (added to `ADMIN_TABS` before its component lands)
  takes, and an unreachable fallback that renders nothing would be dropped in a "dead code" pass.
  `app.routes.spec.ts` calls `tabLoader('not-a-real-tab')` to keep it live.
- **The summary tab corrects `updateToMonthDataInForm`; do not reintroduce the coupling.** The
  legacy form reset the end month to the start month whenever the start month changed, silently
  discarding a chosen end month. Here `onFromMonth` sets only the start month and an inverted
  range is refused with an explicit message (`rangeError`), so the two pickers are independent.
  The spec pins both halves: changing the start month leaves `toMonth` untouched, and a start
  after the end shows the message and keeps "Generuj podsumowanie" disabled.
- **The Users tab separates pure logic from the component (T051).**
  `features/admin/users/users-table.ts` holds validation, `buildCreateRequest`/`buildUpdateRequest`,
  the server-message-to-field map and row shaping; `users-table.component.ts` is the signal wiring.
  The two request builders are split rather than one `buildUserRequest(form, editing)`: the create
  body and the update body are different shapes (create always carries the password pair, update
  omits it when the field is blank so the stored hash survives), and a single boolean parameter
  made the call site read as `buildUserRequest(form, true)` — the flag's meaning was not visible
  where it was passed. The service wraps the five routes and types the two bodies separately with
  `IUserRequest`/`IUserUpdateRequest` from `libs/models`, which is what removes the `as never` cast
  a single merged builder forced on the `create` call.
- **A server error message names its field in prose, so mapping it needs a token list, not a key
  match.** `mapServerErrors` turns the API's `422` `message: string[]` into field errors by looking
  for a field token in each message, longest/most specific first (`recheck`/`confirm`/`not match`
  before `password`, or a confirmation message lands on the password field). The server spells the
  field `E-mail`, so hyphens are stripped before the match or the `email` token misses and the
  message falls through to the general error. A message that names no field (`Role must be one
  of…`) becomes the general error, joined; a `422` whose body carries no array, and a non-`422`
  failure, both fall back to a fixed message.
- **The bootstrap tool is a `tools/` project and CI must name it, like `migration`.** `nx run
  bootstrap-admin:run` is the documented first-administrator path (FR-046); the password comes from
  `BOOTSTRAP_ADMIN_PASSWORD` so it stays out of the shell history, and the tool hashes through the
  users schema's `pre('save')` hook so the stored value is a `bcrypt` hash — the same path the API
  uses, not a second hashing implementation. `run-many --projects=server,ui,...` does not include
  it, so `.github/workflows/ci.yml`'s unit-test and coverage-report steps name it explicitly or its
  coverage never reaches the gate (the same trap `migration`, `date-time`, `booking-rules`,
  `reporting` and `version` document).
- **A cross-module reference check registers the model it counts, rather than importing the other
  module.** `ClientService.deleteClient` needs `Booking` and `BuildingService.deleteBuilding` needs
  `Booking` and `User`, and neither module owns those schemas. Importing the owning module would
  drag its controllers and guards into a second module; instead `MongooseModule.forFeature` in
  `client.module.ts`/`building.module.ts` registers the extra schema and the service injects it by
  token (T059). This is the shape `ReportingModule` already used to read bookings.
- **`BuildingService.deleteBuilding` matches a booking on `{place.place, place.city}`, not on
  `property` alone.** `property` is unique only *per city* (`hala-sportowa` exists in all four), so
  a count on `property` alone would refuse a delete in one city because a booking exists in
  another. The staff-assignment half *is* over-approximate — `User.buildings` carries the property
  key with no city — and that is deliberate: refusing in the safe direction leaves the facility
  deactivatable, whereas an orphaned booking cannot be un-orphaned (T059).
- **A "soft delete" flag is read as `active !== false`, never `active === true`.** `clients` and
  `buildings` gained an `active` field in T059 with `default: true`, but the filter is
  `{active: {$ne: false}}` and the write test is `active === false`, so a document written before
  the field existed (or by a direct driver call that omitted it) reads as active rather than
  silently vanishing from the calendar. A `=== true` test would retire every legacy document the
  moment the field was added.
- **A retire-the-record rule has a UI half or it is a dead end.** The delete routes refuse with
  `409` and point at `PUT ... {active: false}`, so the clients tab gained an "active" checkbox in
  its form and a Status column, and the facilities tab a Status row — otherwise the message names
  an action the operator cannot take. The staff `GET /buildings` read deliberately still returns
  retired facilities for the same reason: withholding them would make a deactivation invisible in
  the admin area.

## Logging

`LoggingModule` is registered once in `AppModule` and applies to every route, so a new
module is covered without opting in. Records are one JSON object per line.

- Use `StructuredLogger`, not `console.log` or Nest's `Logger` directly.
- The correlation id and the acting user are ambient (`request-context.ts`); do not thread
  them through a method signature.
- The store is created in the **correlation-id middleware**, not in an interceptor. An
  interceptor returns an observable that is subscribed after it returns, so a context
  opened around its body has already been left by the time the handler runs.
- Redaction is applied by the logger, so a call site does not have to remember. It matches
  on the key (`password`, `token`, `email`, …) **and** on the value, because an address can
  arrive under a key such as `recipient` that names nothing.
- A failing request is logged from the error path, and its status comes from the exception
  — the filter that sets the response status has not run yet at that point.

## Constitution

`.specify/memory/constitution.md` (v1.0.0) is binding. It supersedes other practices, so
read it before starting work that touches authorisation, domain logic or shared types.

The principles that change day-to-day decisions most often:

- **Server-side enforcement** — a rule enforced only in the UI does not exist.
- **Test-first for domain logic** — a task implementing domain logic is not complete
  until its tests pass; a behaviour change changes a test. A `toBeDefined()` assertion is
  not a test.
- **Measured coverage** — 80 % on the domain modules, 100 % on files added or modified,
  and the global threshold is a ratchet that is never lowered.
- **Single source of truth for types** — payload types live in `libs/models`, not in each
  app.

The spec-driven artefacts are `specs/001-booking-platform-rewrite/` (spec, plan, tasks,
contracts, `ui-conventions.md`, `backend-conventions.md`) and
`specs/002-dependency-modernization/` (complete). Work not traceable to a task in a
`tasks.md` is out of scope until it is written down.

## Backend conventions that are easy to break

- **A user-supplied substring search must be regex-escaped before it reaches `$regex`.**
  `buildBookingQuery` turns the tenant-name `search` (FR-021) into
  `{$regex: escapeRegExp(term), $options: 'i'}`. Without the escape, a term containing `.` or
  `*` is read as a pattern (matching more than the caller asked for) and a term such as `(` is
  an invalid expression the driver rejects. The legacy search used a string `includes`; a regex
  is the closest MongoDB equivalent, so it has to be made a literal first. The DTO also bounds
  the length (125), so a pathological term is refused at the boundary rather than compiled.
- **Guards must be attached per route when one route in a controller is public.**
  `BuildingController`'s list is public (`OptionalJwtAuthGuard`) while its single read and
  writes are staff-only. A class-level `@UseGuards(AuthGuard('jwt'), RolesGuard)` runs *before*
  the method's `OptionalJwtAuthGuard` — Nest concatenates class and method guards — so it would
  reject the anonymous list request the route exists to serve. The guard belongs on each route.
  The same shape as `BookingController`, which is public on the list and per-route elsewhere.
- **A public read of a route that also serves staff needs the redaction in a serialiser, and
  the field list in `libs/models`.** `GET /buildings` answers the full record to staff and a
  redacted one to an anonymous caller; `serializePublicBuildings` deletes
  `PUBLIC_BUILDING_REDACTIONS` and the spec asserts each name individually, because a redaction
  list that is wrong is a disclosure and a count assertion would not catch a missing name.
  Assert on the raw response text in the integration test: a field present but `undefined` still
  travels, and `toHaveProperty` does not see it.
- **Validation and error mapping are configured once, in
  `apps/server/src/app/config/configure-app.ts`**, and applied by both `main.ts` and the test
  harness. Do not register a `ValidationPipe` or exception filter in `main.ts` directly: the
  harness boots `AppModule` without running `main.ts`, so anything registered only there is
  absent in every integration test and a regression that removed it would still pass. A lint
  rule bans `new ValidationPipe()` in controllers.
- **Validation failures are `422`, not Nest's default `400`.** `contracts/openapi.yaml`
  declares 422 and the UI is written against the contract.
- **A 5xx response never carries the cause.** Services catch a database error and re-throw
  `new HttpException(rawMessage, 500)`, so the filter treats every 5xx as opaque and logs the
  real error instead. Without this a malformed id returns the Mongoose message naming the
  model.
- **Integration tests that boot `AppModule` need a raised Jest timeout.** Starting `mongod`
  exceeds the 5s default on a cold CI runner. When it times out the hook's assignment never
  runs and the suite fails in teardown on `undefined`, which reads like a different bug — this
  passed locally and failed only in CI. `jest.config.ts` sets `testTimeout: 120_000` globally
  so a new spec cannot forget it.
- **A service that reads a document through `.lean()` needs the stub to return a query, not a
  promise.** `NotificationService.loadBooking` and `ReportingService.requireClient` call
  `model.findOne(...).lean()`, so a unit-spec stub of `findOne` that resolves the document
  itself throws `findOne(...).lean is not a function` and the service maps it to a 500 — the
  test then fails with a status mismatch rather than the real cause. Stub
  `findOne: () => ({lean: () => Promise.resolve(doc)})`.
- **A boolean query flag needs `@BooleanQuery()`, not a bare `@IsBoolean()`.** The global pipe
  runs with `transformOptions.enableImplicitConversion`, which coerces a query string with
  `Boolean(value)` — and `Boolean('false')` is `true`. So `?fromTheBeginning=false` inverts.
  A `@Transform` that reads the callback's `value` does **not** help: `value` is already
  coerced by the time the transform runs. Read the raw source instead — the callback's
  `obj[key]` is still the string. `summary-query.dto.ts` and `booking-query.dto.ts` both carry
  a local `BooleanQuery`; each drives the real `ValidationPipe` in its spec, because a
  hand-built `plainToInstance` would not reproduce it.
- **A `@BooleanQuery()` transform needs an explicit-`undefined` case in its spec to reach the
  branch it guards.** The branch is `raw === undefined ? undefined : ...`, and a query object
  that omits the key (`{}`) does not run the transform at all — class-transformer skips an
  absent key. `transform({fromTheBeginning: undefined})` is what executes the `undefined` arm;
  without it the file sits at 75% branches and the reporting coverage group's 80% floor hides
  a genuinely uncovered path.
- **The reporting month range is facility-local, not UTC.** `startOfFacilityMonth` /
  `endOfFacilityMonth` (`@booking/date-time`) go through `instantFromWallClock`, so a
  slot late on the last local day of a month belongs to that month even when its instant is in
  the next UTC month. A `Date.UTC` bound would move a booking between months at the edges.
- **A legacy local-time value is a Europe/Warsaw wall clock, and the migration must say so
  (T055, R4).** The legacy app built slot times by concatenating a local date and time and
  parsing them in the *viewer's* browser zone (`overwriteDate`), while `day` was anchored at
  `T00:01:00.000Z` — neither is an instant. `instantFromLegacyLocal` in `@booking/date-time` is
  the reinterpretation (T041/T042 must use it, never `new Date(value)`): the same string parsed
  as UTC moves every slot one or two hours, by a different amount either side of a transition.
  A value in the spring gap maps forward; a value in the autumn repeated hour resolves to the
  *later* occurrence — the same reading `atFacilityTime` gives, pinned by the spec. Do not
  "simplify" this to `new Date(...)`, which is the exact defect the legacy issues #27/#58 are.
- **The migration tool is the `migration` Nx project under `tools/migration`, and it is not in
  the server image (T041/T042).** It reads a directory of per-collection JSON exports, validates
  every transformed record against the server's **real** `SchemaFactory.createForClass(...)`
  schemas, and writes by idempotent upsert on an `_id` derived from the legacy id
  (`lib/identity.ts`). Two traps are worth naming. First, the database-touching code is injected
  rather than imported at module top level (`run(cli, {hashPassword, connect})`), because a
  top-level `import('mongoose')` trips Jest's `vm` sandbox — the same dynamic-import trap the
  server harness documents. Second, the four schemas are imported through `@server/*` aliases,
  and `@nx/enforce-module-boundaries` forbids an app import from anywhere, so the one exception
  is scoped to `tools/migration/eslint.config.mjs` rather than added to the root config. Its
  `coverageThreshold` is 100 % on every metric, and it is named in CI's `run-many` list and
  coverage-summary table; a new project that is not added to both never reaches the gate.
  `month` is derived from the first slot in the **facility** calendar
  (`facilityWallClock(...).month - 1`), matching the UI form's `buildRequest` — `getUTCMonth()`
  on the local-midnight instant reads the previous UTC day for a slot late in the local evening.
- **A new shared library is a project, and its Jest coverage is separate from the apps'.**
  `libs/date-time` declares `test`/`lint` targets in `project.json`; the workspace-wide
  `run-many --all` picks it up, but `--projects=server,ui` does not, so a change to the library
  must run `nx test date-time` (or `--all`) or its tests are silently skipped. Its
  `coverageThreshold` is 100 % and `collectCoverageFrom: ['src/**/*.ts']` excludes the barrel
  (`/src/index.ts$`) the way the server excludes its re-export-only files. `libs/booking-rules`
  (`@booking/rules`, T035) is a second one, and the `test`/coverage steps in `ci.yml` name it
  explicitly (`--projects=server,ui,date-time,booking-rules`, plus its
  `coverage/libs/booking-rules/coverage-summary.json` row) — a new library has to be added to
  *both* the run-many list and the summary-merge table or its coverage never reaches the gate.
  `libs/version` (`@booking/version`, T040) is the third: `ci.yml` now runs
  `--projects=server,ui,date-time,booking-rules,reporting,version` and prints its summary row.
- **The build number is a task input, not just a task dependency.** `libs/version` stamps
  `git rev-list --count HEAD` into a gitignored `generated/build-number.ts`, and both apps swap
  it in through `fileReplacements`. Depending on `version:build` is *not* enough: Nx keys a
  task's cache on its own inputs, and the app build reads the generated file as ordinary
  source, so on the next commit the version task re-runs but the app build is a cache hit and
  keeps the old number. Both apps therefore declare
  `inputs: ["default", "^default", {"runtime": "git rev-list --count HEAD"}]` — the `runtime`
  entry is what invalidates the app build when the count moves. Keep `^default` in that list;
  specifying `inputs` replaces the default set, and dropping `^default` silently stops a
  dependency's source change from invalidating the build. Verified by committing an empty
  commit between two builds: without the `runtime` input the bundle stayed at the old count,
  with it the bundle moves.
- **The committed `build-number.ts` is the fallback, and it must stay `'0'`.** A test run and a
  fresh checkout read `libs/version/src/lib/build-number.ts` (which is never overwritten), so
  `APP_VERSION` is `1.0.0+0` there and `version.spec.ts` asserts the shape (`/^1\.0\.0\+\d+$/`)
  rather than a number that changes with every merge. The generated file is under
  `/libs/version/generated/` in `.gitignore`; committing it would make the stamp a merge
  conflict on every branch.
- **`git rev-list --count HEAD` needs full history.** CI already checks out with
  `fetch-depth: 0` (Nx needs the merge base anyway), but a shallow clone would stamp a count
  from the truncated history — a wrong number rather than an error. `--unshallow` before
  trusting the value locally.
- **The cyclical expansion, the slot-overlap predicate and the intra-booking check live in
  `@booking/rules`, not in the server.** `expandBookingTimes`, `slotsConflict`, `slotsOverlap`
  and `findIntraBookingOverlap` were moved out of `apps/server/src/app/bookings/` (T035) so the
  public booking form and the API expand a request identically — the same single-source reason
  the date/time conversion was extracted. `conflicts.ts` imports `slotsConflict`, and
  `booking.service.ts` imports `findIntraBookingOverlap`, from the library; do not re-add a
  local copy, which is what would let the week count or the "touching interval is not a
  conflict" rule drift between the two callers. The library's `jest.config.ts` excludes the
  barrel and holds the 100 % threshold, like `date-time`.
- **The UI coverage gate is 100 % on every file, and `app.routes.ts` loaders count.** Adding a
  lazy route without a spec that invokes its `loadComponent` leaves the loader uncovered and
  fails the `ci` run; the `app.routes.spec.ts` table is where each route earns its coverage.
  The booking-request route (T035) is asserted there alongside the calendar and sign-in routes.
- **The CSV column labels are the contract (FR-028), so the label set and order are asserted
  one name at a time.** The file is `\uFEFF`-prefixed, `\r\n`-terminated and `;`-separated, and
  the header is built from `CSV_COLUMNS.map((c) => c.label).join(';')`. A count assertion would
  not catch a renamed or reordered column, and a downstream spreadsheet would silently read the
  wrong column.
- **The mail transport fails rather than dropping a message.** With `MAIL_ENDPOINT`/`MAIL_FROM`
  unset the module installs `UnconfiguredMailTransport`, which throws on every send; the
  service maps that to `502` (FR-036). A transport that resolved instead would report success
  for a notification the operator believes was sent. The recipient is always resolved
  server-side — never from the request body — so a caller cannot redirect a notification
  (FR-035). `POST /notifications/booking` is `OFFICE`/`ADMIN`; `POST /notifications/message` is
  public for the contact form.
- **`POST /notifications/*` answers `202`, and Nest's `POST` default is `201`.** Both routes
  need `@HttpCode(HttpStatus.ACCEPTED)`. Without it the integration spec's `202` assertion
  fails for a reason unrelated to the behaviour (same trap as the approve/archive routes).
- **The notification templates are versioned assets, and the renderer fails on an unfilled
  placeholder (T058).** `notification/templates/templates.ts` holds the four templates
  (`booking-facility`, `booking-staff`, `contact-message`, `employee-message`) with the legacy
  EmailJS ids; `contracts/notification-templates.md` documents each one's recipient, subject
  and variable set. `render` throws when a required `{{name}}` is absent **or empty**, so a
  template that names a variable its caller does not supply fails the send (a `502`) instead of
  shipping `{{club}}` to an inbox. `{{#name}}…{{/name}}` is an optional block whose newline
  must sit *inside* the tags, or a dropped block leaves a blank line. The two booking variants
  are deliberately not merged: the facility variant carries `buildingEmail` and newline-joined
  slots, the staff variant does not and joins with `" / "` — collapsing them changes what one
  audience receives, which is what the task exists to prevent. Do not rename a placeholder in a
  template without the builder; `templates.spec.ts` asserts every declared variable is
  populated for a complete booking.

## Abuse protection (T057)

- **The abuse controls sit on the two public write routes, and only those.** `POST /bookings`
  and `POST /notifications/message` are the only endpoints an unauthenticated caller can drive,
  so they are the only ones carrying `RateLimitGuard`, `HoneypotGuard` and the outbound quota.
  The guards are attached per route, not at the class: a controller-level guard would run on the
  authenticated reads too. `SecurityModule` is `@Global` so a guard is resolvable from any
  controller's module context without every module importing it.
- **The rate-limit and quota stores are in memory, and that is a decision, not an oversight.**
  `security/rate-limit/rate-limit.store.ts` is a process-local fixed-window counter behind a
  `record(key, limit, windowMs)` seam. Behind more than one replica the effective limit is
  multiplied by the replica count and a restart clears the counters; the single-replica
  municipal deployment makes that acceptable and the seam lets a shared backend drop in without
  touching the guard. Do not "fix" it by reaching for Redis without the deployment change that
  needs it.
- **A limit of `0` disables the check, and an empty setting is *absent*, not zero.** The guard's
  `numberFrom` treats `undefined`/`null`/`''` as "use the default" and a non-numeric value as the
  default too, because `Number('')` is `0` and a typo must not turn the limit off — a limit of
  zero that refused everything would make a misconfigured environment look like a broken
  endpoint. `0` is the operator's deliberate off switch.
- **The test harness raises the limits, and must.** `createMongoTestContext` sets
  `PUBLIC_RATE_LIMIT`/`NOTIFICATION_QUOTA` to `100000` *before* importing `AppModule`, because
  `ConfigModule.forRoot` captures the environment at import time and the booking-size spec alone
  posts a booking per seeded size. The one suite that exercises the limits
  (`security/abuse.integration.spec.ts`) sets its own small values *before* calling
  `createMongoTestContext`, which is the only place a later change would have an effect.
  `reset()` also calls `RateLimitStore.clear()`: the windows live in memory, so dropping the
  database does not clear them and a suite would start answering `429` partway through.
- **A filled decoy is `422` from a guard, and the field is `optional` on the DTO.** The honeypot
  is a hidden `website` field; `HoneypotGuard` refuses a non-empty value with `422` (the same
  status as any bad field, so the response tells a bot nothing). The field is declared
  `@IsOptional()` on `MessageDto`/`BookingDto` so `whitelist`/`forbidNonWhitelisted` do not
  reject it as unknown before the guard can read it. It is a guard, not a DTO rule, because the
  *value* rule needs the raw value and a single-field guard keeps the refusal in one place. A
  bot mitigation must not be a CAPTCHA: that would break NFR-006, so the decoy is chosen for its
  accessibility neutrality.
- **The decoy must actually be rendered, or the guard is inert.** The public booking form
  renders `.bs-request__decoy` — off-screen via `clip-path`, *not* `display:none`, so a bot that
  skips hidden fields still fills it — with `aria-hidden="true"` and `tabindex="-1"` so it is
  invisible to assistive technology and the keyboard order, and always submits it empty. A guard
  on a field no form renders protects nothing; the component spec asserts the decoy is present,
  `aria-hidden`, `tabindex="-1"`, and sent empty.
- **The 429 body carries `retryAfterSeconds` through `StructuredHttpException`.** The global
  `ErrorExceptionFilter` narrows every `HttpException` to `{statusCode, message, error}`, which
  would drop the hint — the same reason the conflicted-approval `409` uses that class. It is
  honoured only below `500`, so it cannot smuggle a driver message out.
- **The client address is Express's `request.ip`, never a raw `X-Forwarded-For`.** Reading the
  header unconditionally lets a caller pick their own key and walk around the limit; the
  operator opts in by setting `trust proxy`.
- **The outbound quota counts the *recipient*, and runs before the transport.** It is a different
  control from the request limit: a script behind rotating IPs, or one that stays just under the
  request limit, still spends the recipient's allowance. Checking it inside `NotificationService`
  before `transport.send` means a message that would exceed the cap is a `429` that never reaches
  the provider.
- **`MessageDto.recipient` is allow-listed, and that is the fix for the open relay (#124).** The
  public route (no credential) would otherwise deliver the SISK-branded `employee-message`
  template to any syntactically valid address a caller named. It is honoured only when the caller
  is authenticated staff (`request.isPublic === false`) *and* the address matches a facility's
  stored contact address: a public caller that names one gets `403`, a staff caller whose address
  matches no facility gets `422` (a wrong field, not a missing resource).
- **`BookingDto.place` needed `@ValidateNested` + a concrete `PlaceDto`.** `@IsObject` alone
  validates nothing inside the object, so `place.place`/`place.city` were unbounded and reached
  the database and their index at whatever length the caller sent — the same gap `bookedTimes`
  had before T011. A nested object is validated only when `@ValidateNested` and `@Type` are both
  present.
- **Every free-text field on a public route carries an explicit server-side `maxLength`.** The
  DTO is the boundary (`422`) and the contract documents the same bound; an unbounded value is
  what reaches an index and a report. `comments` is bounded at 525 (FR-047).

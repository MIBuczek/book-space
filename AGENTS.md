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
yarn nx run-many --target=test --projects=server,ui --configuration=ci
yarn nx run-many --target=build --projects=server,ui --configuration=production
```

Add `--skip-nx-cache` when you need to be sure a result is real rather than replayed.

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
  class (`UpdateUserDto`), not a mapped type. The same applies to `Pick`/`Omit`.
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
- **`ui:test` has a single spec.** `apps/ui/src/app/app.component.spec.ts` is the only one, and
  it exists to guard the test harness and the HttpClient wiring. A green UI run is still thin
  evidence that the UI works — do not read it as coverage of the app.
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
  removed.
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
- **`serializePublicBooking` deletes four named fields and goes through `toJSON`.** The list
  is a `const` tuple asserted one name at a time, because a redaction list that is wrong is a
  data leak and a count assertion would not catch a missing name. It spreads `toJSON()` rather
  than the document: Mongoose data lives on internals, so spreading a document directly yields
  the schema's internals, not the fields. Assert against the raw response *text* in an
  integration test — a field present but `undefined` still travels, and `toHaveProperty`
  does not see it.
- **`validateUser` re-checks `active`, not just the signature.** Sign-in already refused an
  inactive account, but a token lives for a day, so an account disabled after its token was
  issued kept working until the token expired. Found by the integration case that deactivates
  a user and re-uses the token it already holds. `=== false` rather than a falsy test, so a
  legacy document with no `active` field stays active.
- **`nick` is not in the booking schema yet.** T010 adds it. A test that seeds `nick` and
  reads it back will find nothing — Mongoose drops fields the schema does not declare — so the
  calendar-label assertions wait for T010 and the redaction list is the control meanwhile.
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
- **A `conflicts/**` coverage group was added with T018 (SC-008).** Like `authorization`, it takes
  its files out of the `global` pool, so the global figure is measured without it — re-derive it
  from the per-file rows, not the report's `total`.
- **All instant↔civil-calendar conversion goes through `utility/facility-time.ts` (T019, R4).**
  It uses `Intl.DateTimeFormat('Europe/Warsaw', {hourCycle: 'h23'})`; the `h23` is load-bearing —
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
- E2E projects are not part of the CI gate: `ui-e2e` still asserts the Nx starter text.

## CI

`.github/workflows/ci.yml` runs lint, unit tests, build and a client-bundle secret scan on
every PR, then a `gate` job that fails unless all of them passed.

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

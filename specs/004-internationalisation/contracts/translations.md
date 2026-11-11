# Contract: Translations

The contract between the code and the translation data. It fixes the key space, the fallback, the
interpolation and the rules a spec enforces, so a component and a JSON file cannot disagree.

## 1. File location and loading

| Aspect | Value |
|--------|-------|
| Path | `apps/ui/src/assets/i18n/<code>.json` |
| Served at | `/assets/i18n/<code>.json` (static, via the existing `assets` build entry) |
| Loader | `provideTranslateHttpLoader({prefix: '/assets/i18n/', suffix: '.json'})` |
| Languages | `pl` (default), `en` |

One build serves every language; a new language is a new file (FR-013).

## 2. Key space

Keys are the catalogue's existing groups and dotted element names (`calendar.title`,
`bookings.columns.name`, `common.save`). A key names an **element**, never a value.

The full group list: `common`, `nav`, `footer`, `admin`, `calendar`, `bookingRequest`,
`bookings`, `clients`, `users`, `facilities`, `summary`, `signIn`, `contact`, `cookieNotice`,
`notFound`, `serverError`, `errors`, `validation`, `labels`.

## 3. Lookup and fallback

```text
translate('calendar.title')
  ├─ active language has the key?  → render it
  ├─ default language has it?      → render the default-language value
  └─ neither?                      → render the KEY (never '')
```

The order is ngx-translate's `fallbackLang` plus the default missing-translation handler. A spec
asserts a missing key renders the key, not an empty string (FR-005).

## 4. Interpolation

A parameterised string uses `{{name}}`, e.g.
`"footer.meta": "{{tenant}} — system rezerwacji · Wersja aplikacji {{version}}"`.

- A component passes the parameter: `{{ 'footer.meta' | translate: {tenant, version} }}`.
- A translation **must keep** every parameter the default language declares; dropping one is a
  spec failure (FR-006).
- A brand name is a **parameter** (`{{tenant}}`), never baked into a value.

## 5. Pluralisation

A count-bearing string uses the library's plural mechanism (`translate` with a `count` and a
`.plural` key space), not a `count === 1 ?` in a component. Polish has more plural forms than
English; the mechanism handles the per-language rule.

## 6. What a spec enforces

| Rule | Spec |
|------|------|
| Every default-language key exists in every other language | `translations.spec.ts` (FR-006, SC-003) |
| Every interpolation parameter is preserved | `translations.spec.ts` |
| A missing key renders the key, never `''` | `translate` spec |
| No user-facing literal in a component or template | the retargeted `no-hardcoded-copy.spec.ts` (FR-012) |
| The switch changes the rendered DOM and persists | the switch spec (FR-003, FR-004) |
| The built bundle has no `sisk`/`siechnice` | a bundle scan (SC-002) |

## 7. Naming rules (FR-011)

| Kind | Language |
|------|----------|
| Translation **keys** | English |
| Component/identifier names | English |
| File names | English |
| Environment variables | English (`TENANT_*`) |
| Route paths | English |
| Translation **values** | Polish or English — the content |

A Polish word in `pl.json` is correct. A Polish word in a `.ts` identifier, a key or an env var is
a defect.

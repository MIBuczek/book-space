# Data Model: Internationalisation and De-branding

This feature adds no domain entity. What it models is the **translation data** and the **tenant
configuration** that replaces the hardcoded brand.

## 1. Translation file

One JSON document per language, at `apps/ui/src/assets/i18n/<code>.json`. The key space is the
existing catalogue's groups, unchanged, so the migration is a rename of `COPY.a.b` to `"a.b"`.

```jsonc
{
  "common":   { "yes": "Tak", "no": "Nie", "save": "Zapisz", ... },
  "nav":      { "ariaLabel": "Nawigacja", "calendar": "Kalendarz", ... },
  "footer":   { "site": "{{tenant}}", "meta": "{{tenant}} — system rezerwacji · Wersja aplikacji {{version}}" },
  "admin":    { "tabs": { "calendar": "Kalendarz", ... } },
  "calendar": { ... },
  "bookingRequest": { ... },
  "bookings": { ... },
  "clients":  { ... },
  "users":    { ... },
  "facilities": { ... },
  "summary":  { ... },
  "signIn":   { ... },
  "contact":  { "office": { "address": "—", "phone": "—", "phoneHref": "tel:" }, ... },
  "cookieNotice": { ... },
  "notFound": { ... },
  "serverError": { ... },
  "errors":   { ... },
  "validation": { ... },
  "labels":   { ... }
}
```

Rules:

- **A key names an element, never a value** (the catalogue's existing rule), so the Polish text
  can change without the code changing.
- **Interpolation uses `{{param}}`**, not template literals. A key that had a parameter in
  `libs/copy` (the footer meta, the confirmation that names a facility) keeps it.
- **No key carries a brand.** `footer.site` is `{{tenant}}`, not "Strona SISK".

## 2. Language descriptor

Declared once, in `libs/i18n/src/lib/languages.ts`:

```ts
interface ILanguage {
  code: string;      // 'pl' | 'en'
  label: string;     // endonym: 'Polski' | 'English'
  default: boolean;  // exactly one true
}
```

The list is the single source of truth: the switch offers it, the store validates against it, and
the completeness spec iterates it. Adding a language is one entry plus one JSON file (FR-013).

## 3. Language preference

- **Storage**: `localStorage`, one key (e.g. `book-space.language`).
- **Value**: a language `code`; an unknown value is ignored and the default is used.
- **Lifecycle**: read at start-up (before the first render, in the app initializer); written on a
  switch.

## 4. Tenant configuration (replaces the hardcoded SISK values)

Server-side settings, validated in `env.validation.ts` like the existing ones. Each has a neutral
default so an unconfigured deployment renders (SC-005).

| Setting | Replaces | Default |
|---------|----------|---------|
| `TENANT_NAME` | "SISK"/"SISK Siechnice" (footer, meta, e-mail signature) | the product name (`Book Space`) |
| `TENANT_CONTACT_EMAIL` | `biuro@sisk-siechnice.pl` | unset → the field is hidden |
| `TENANT_WEBSITE_URL` | `www.sisk-siechnice.pl` | unset → the link is hidden |
| `TENANT_PRIVACY_URL` | the SISK privacy-policy URL | unset → the link is hidden |
| `TENANT_STAFF_EMAIL` (renamed from `SISK_CONTACT_EMAIL`) | the SISK inbox | required only for the staff path; no default |
| (removed) `SUMMARY_DENY_LIST` | `mkulakowski@umsiechnice.pl` | the whole deny-list is removed (#195) |

The facility seed is **sample data** and stays as it is (decision 5); it carries no SISK brand and
is not a tenant setting.

### The public subset

Only the values a visitor may see cross to the UI:

| Field | Where it appears |
|-------|------------------|
| `name` | the footer, the e-mail signature |
| `contactEmail` | the contact page and the server-error page |
| `websiteUrl`, `privacyUrl` | the footer links and the cookie notice's privacy link |

The staff inbox is **server-only** and never reaches the bundle (they are not
secrets, but they are not public either; keeping them server-side keeps the bundle clean and the
secret scan trivially green).

## 5. No change to the domain model

The booking, client, user and facility schemas, the DTOs and the HTTP contract are unchanged. The
facility **sample data** stays as it is (decision 5); the `IBuilding` shape does not change.

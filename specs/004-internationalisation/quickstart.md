# Quickstart: Internationalisation and De-branding

Two runbooks: **add a language** and **rebrand for a tenant**. Both are short because the design
makes them data changes, not code changes.

## A. Add a language

1. Copy `apps/ui/src/assets/i18n/pl.json` to `apps/ui/src/assets/i18n/<code>.json` and translate
   the values (keep every key and every `{{param}}`).
2. Add one entry to `libs/i18n/src/lib/languages.ts`:

   ```ts
   {code: 'de', label: 'Deutsch', default: false},
   ```

3. Run the specs:

   ```bash
   npx nx test ui --testPathPattern='translations'    # key completeness + interpolation
   npx nx test ui --testPathPattern='language'        # the switch offers the new language
   ```

   The completeness spec fails until every key is present — that is the point (FR-006).

No component, template or route changes (FR-013).

## B. Rebrand for a tenant

Set the server settings (App Service settings, or `apps/server/.env` locally):

```bash
TENANT_NAME="Acme Sports Halls"
TENANT_CONTACT_EMAIL="biuro@acme.example"
TENANT_WEBSITE_URL="https://acme.example"
TENANT_PRIVACY_URL="https://acme.example/privacy"
TENANT_STAFF_EMAIL="bookings@acme.example"
```

Then:

1. Reload the app — the footer, the contact page and the e-mail signature show the tenant.
2. With a value **unset**, confirm the element hides rather than rendering an empty link
   (SC-005).
3. Confirm the built bundle is unchanged: `npx nx build ui` then
   `grep -ri "sisk\|siechnice" dist/apps/ui` returns nothing (SC-002).

The facility seed is sample data and stays as it is (decision 5); a tenant may replace it through
the seed, which is an idempotent upsert.

## C. Local development

```bash
npx nx serve ui          # the app; switch the language from the shell
npx nx test ui           # includes the translations, guard and switch specs
npx nx lint ui
```

To watch the translation flow end to end:

1. Load the app (Polish by default).
2. Use the language switch → English. Every string changes with no reload.
3. Reload → still English (the preference persisted).
4. Open the admin tables and a validation error → English.
5. Switch back → Polish.

## D. Definition of done

- [ ] CI green (lint, unit tests, build, secret scan).
- [ ] Polish and English both render every screen; the switch works and persists (SC-001).
- [ ] `translations.spec.ts` proves key completeness and interpolation (SC-003).
- [ ] A third language added in the test renders (SC-004).
- [ ] `grep -ri "sisk\|siechnice" dist/apps/ui` returns nothing (SC-002).
- [ ] The retargeted guard fails on a user-facing literal (FR-012).
- [ ] With no tenant configuration, the app renders the product name and no municipal links
      (SC-005).
- [ ] `libs/copy` is gone and its spec is replaced by the completeness spec.

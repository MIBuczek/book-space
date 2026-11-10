/**
 * The defaults the migration supplies for fields the legacy records may not carry
 * (research.md R10, spec.md §5 Edge Cases "Legacy records missing newer fields").
 *
 * These are constants rather than literals at the call sites so a test can assert the
 * documented value without restating it, and so the one place the values are decided is
 * this file. The two audit defaults are the ones the legacy *read* mapper itself supplied
 * (`parseFirebaseBookingData` in `api-functions.ts`): a booking written before the audit
 * fields existed was shown as created by the SISK office account and modified by `Unknown`.
 */

/** `createdBy` for a booking whose legacy document carries none. */
const DEFAULT_CREATED_BY = 'michal.hoffman@sisk-siechnice.pl';

/** `modifiedBy` for a booking whose legacy document carries none. */
const DEFAULT_MODIFIED_BY = 'Unknown';

/**
 * The calendar label for a booking whose legacy document carries no `nick`.
 *
 * The legacy *read* mapper defaulted `nick` to the empty string, but the target schema
 * requires 3–100 characters, because the public calendar shows the label in place of the
 * personal fields it redacts — an empty label would render an anonymous caller a blank
 * entry. The legacy booking *form* used `selectedClient.nick || 'Rezerwacja'`, so the
 * written value was always non-empty; this default restores that for the records the
 * read-mapper would have shown blank.
 */
const DEFAULT_NICK = 'Rezerwacja';

/** The default discount when the legacy record carries none. */
const DEFAULT_DISCOUNT = '0%';

export {DEFAULT_CREATED_BY, DEFAULT_MODIFIED_BY, DEFAULT_NICK, DEFAULT_DISCOUNT};

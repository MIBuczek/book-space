/**
 * The Summary deny-list (FR-006, open question 3).
 *
 * The legacy restriction was a hardcoded account (`summaryUserRestriction` in
 * `credentials-function.ts` refused one municipal address). A hardcoded identity is a
 * privilege decision in the source, so it cannot be changed without a deploy and is invisible
 * to whoever operates the system. It is now configuration (`SUMMARY_DENY_LIST`).
 *
 * The default is **empty**: the legacy account was a real person at the previous tenant, and
 * shipping their address in the source of a generic product is both a privacy leak and a
 * meaningless restriction for any other deployment. An operator who wants the old behaviour
 * sets `SUMMARY_DENY_LIST` explicitly.
 */
const DEFAULT_SUMMARY_DENY_LIST = '';

/**
 * Parses the comma-separated deny-list. Addresses are trimmed and lower-cased, because the
 * comparison is case-insensitive (an e-mail address is), and empty entries are dropped so a
 * trailing comma does not add an empty address that would match an account with a blank
 * e-mail.
 *
 * An unset or blank value falls back to the default, which is empty: a missing variable denies
 * nobody rather than naming an account the product has no business knowing.
 */
const parseDenyList = (raw: string | undefined): string[] => {
  const source = raw === undefined || raw.trim() === '' ? DEFAULT_SUMMARY_DENY_LIST : raw;
  return source
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry !== '');
};

/** Whether the account is denied the Summary feature. An absent e-mail is not denied by list. */
const isSummaryDenied = (email: string | undefined, denyList: string[]): boolean => {
  if (email === undefined) {
    return false;
  }
  return denyList.includes(email.trim().toLowerCase());
};

export {parseDenyList, isSummaryDenied, DEFAULT_SUMMARY_DENY_LIST};

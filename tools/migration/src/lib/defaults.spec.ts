import {DEFAULT_CREATED_BY, DEFAULT_DISCOUNT, DEFAULT_MODIFIED_BY, DEFAULT_NICK} from './defaults';

/**
 * The documented defaults (T042). They are asserted here so the value research.md R10 names is
 * pinned in one place; `transforms.spec.ts` asserts that a record missing the field receives
 * the default, and this file pins what the default *is*.
 */
describe('migration defaults', () => {
  it('defaults createdBy to the SISK office account, as the legacy read mapper did', () => {
    expect(DEFAULT_CREATED_BY).toBe('michal.hoffman@sisk-siechnice.pl');
  });

  it('defaults modifiedBy to Unknown, as the legacy read mapper did', () => {
    expect(DEFAULT_MODIFIED_BY).toBe('Unknown');
  });

  it('defaults the calendar nick to the legacy form label, which the schema requires non-empty', () => {
    expect(DEFAULT_NICK).toBe('Rezerwacja');
  });

  it('defaults the discount to a valid percentage, which the schema validates', () => {
    expect(DEFAULT_DISCOUNT).toMatch(/^[0-9]{1,3}%$/);
  });
});

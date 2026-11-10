import {formatReport, isClean} from './report';
import {emptyReport} from './runner';

/**
 * The reconciliation report (T042, SC-003). SC-003 makes the counts the release gate, so the
 * report is asserted to reflect what the exit code is computed from — "it passed" and "the
 * numbers look right" must not be able to disagree.
 */
describe('migration report', () => {
  it('prints a per-collection line for every collection', () => {
    const text = formatReport(emptyReport(), false);
    for (const collection of ['bookings', 'clients', 'buildings', 'users']) {
      expect(text).toContain(collection);
    }
  });

  it('prints the three reference lines', () => {
    const text = formatReport(emptyReport(), false);
    expect(text).toContain('booking.clientId');
    expect(text).toContain('booking.place');
    expect(text).toContain('user.buildings');
  });

  it('says a dry run wrote nothing', () => {
    expect(formatReport(emptyReport(), true)).toContain('nothing was written');
  });

  it('reflects the counts it is given', () => {
    const report = emptyReport();
    report.collections.bookings = {read: 3, inserted: 2, updated: 1, failed: 0};
    const text = formatReport(report, false);
    expect(text).toContain('read=3 inserted=2 updated=1 failed=0');
  });

  describe('isClean', () => {
    it('is true when nothing failed and every reference resolved', () => {
      expect(isClean(emptyReport())).toBe(true);
    });

    it('is false when a record failed to write', () => {
      const report = emptyReport();
      report.collections.users.failed = 1;
      expect(isClean(report)).toBe(false);
    });

    it('is false when a reference dangled', () => {
      const report = emptyReport();
      report.references.bookingPlace.unresolved = 1;
      expect(isClean(report)).toBe(false);
    });
  });
});

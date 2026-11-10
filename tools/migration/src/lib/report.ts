import {COLLECTIONS, TCollection} from './legacy';
import {ICollectionReport, IReconciliationReport} from './runner';

/**
 * The reconciliation report the tool prints (SC-003).
 *
 * SC-003 makes reconciliation counts the release gate, so the report is a first-class output
 * rather than a log line: it prints the read/inserted/updated/failed counts per collection and
 * the reference resolution, and the process exits non-zero when anything failed or a reference
 * dangled. An operator reads the same numbers the exit code is computed from, so "it passed"
 * and "the numbers look right" cannot disagree.
 */

const formatCollection = (collection: TCollection, report: ICollectionReport): string =>
  `${collection.padEnd(10)} read=${report.read} inserted=${report.inserted} updated=${report.updated} failed=${report.failed}`;

const formatReport = (report: IReconciliationReport, dryRun: boolean): string => {
  const lines: string[] = [];
  lines.push(dryRun ? 'Migration dry run — nothing was written.' : 'Migration complete.');
  lines.push('');
  lines.push('Collections:');
  for (const collection of COLLECTIONS) {
    lines.push(`  ${formatCollection(collection, report.collections[collection])}`);
  }
  lines.push('');
  lines.push('References:');
  lines.push(
    `  booking.clientId  resolved=${report.references.bookingClient.resolved} unresolved=${report.references.bookingClient.unresolved}`
  );
  lines.push(
    `  booking.place     resolved=${report.references.bookingPlace.resolved} unresolved=${report.references.bookingPlace.unresolved}`
  );
  lines.push(
    `  user.buildings    resolved=${report.references.userBuildings.resolved} unresolved=${report.references.userBuildings.unresolved}`
  );
  return lines.join('\n');
};

/** Whether the report is a clean pass: every record written and every reference resolved. */
const isClean = (report: IReconciliationReport): boolean => {
  const anyFailed = COLLECTIONS.some((collection) => report.collections[collection].failed > 0);
  const anyDangling =
    report.references.bookingClient.unresolved > 0 ||
    report.references.bookingPlace.unresolved > 0 ||
    report.references.userBuildings.unresolved > 0;
  return !anyFailed && !anyDangling;
};

export {formatReport, formatCollection, isClean};

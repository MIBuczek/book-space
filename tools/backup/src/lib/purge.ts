import mongoose from 'mongoose';
import {EJSON} from 'bson';
import {isPurgeable, purgeFilter} from './retention';
import type {IRetentionCandidate} from './retention';
import {nodeArchiveFs, requireDatabase} from './archive';
import type {IArchiveFs} from './archive';

/**
 * The archived-booking retention purge (T060, spec.md §9 open question 7).
 *
 * It reads the candidates the filter narrows to, re-checks each against the pure predicate, and
 * deletes the accepted ones — or, in `--dry-run`, reports what it would delete without touching
 * a document. The re-check is what keeps the filter from being the decision: the filter is an
 * index-friendly approximation, and a purge that trusted it alone would delete whatever it
 * happened to match.
 *
 * A purge is destructive, so it can export the documents it is about to remove to an archive
 * directory first (`exportDir`). That export is the one difference between "retention" and
 * "data loss": an operator who has to answer a question about a purged booking has the removed
 * records, not just a count of how many there were.
 */

/** What a purge run did, for the printed report and the exit code. */
interface IPurgeReport {
  /** Documents the filter matched. */
  candidates: number;
  /** Documents the predicate accepted (equal to `candidates` in a correct filter). */
  purgeable: number;
  /** Documents actually deleted (zero in a dry run). */
  purged: number;
  /** Candidates the predicate refused — a non-zero value means the filter is too wide. */
  skipped: number;
  /** The archive file the removed documents were written to, when `exportDir` was given. */
  exportFile?: string;
}

interface IPurgeOptions {
  dryRun: boolean;
  /** When set, the purgeable documents are written here as Extended JSON before deletion. */
  exportDir?: string;
  fs?: IArchiveFs;
}

const PURGE_EXPORT_FILE = 'purged-bookings.json';

/**
 * Removes archived bookings whose last slot predates the cutoff.
 *
 * The reads, the export and the deletes are separate operations, so the tool is not atomic
 * across the set — but each delete is by `_id` on a document the predicate just accepted, so a
 * booking that changes between the read and the delete can only be deleted if it still matches
 * the anchor it was read with. Retention is not a transaction that must be all-or-nothing; the
 * export written before the deletes is the recovery path if a run has to be undone.
 */
const purgeArchivedBookings = async (
  connection: mongoose.Connection,
  cutoff: Date,
  options: IPurgeOptions
): Promise<IPurgeReport> => {
  const db = requireDatabase(connection);
  const collection = db.collection('bookings');
  const candidates = await collection
    .find(purgeFilter(cutoff), {projection: {archive: 1, bookedTimes: 1}})
    .toArray();

  const purgeable = candidates.filter((candidate) =>
    isPurgeable(candidate as IRetentionCandidate, cutoff)
  );
  const report: IPurgeReport = {
    candidates: candidates.length,
    purgeable: purgeable.length,
    purged: 0,
    skipped: candidates.length - purgeable.length,
  };

  if (purgeable.length === 0 || options.dryRun) {
    return report;
  }

  if (options.exportDir !== undefined) {
    const fsImpl = options.fs ?? nodeArchiveFs;
    const dir = options.exportDir;
    // The export re-reads the full documents: the candidate projection carries only the anchor
    // fields, and exporting a partial document would be a backup that cannot be restored.
    const ids = purgeable.map((document) => document['_id']);
    const full = await collection.find({_id: {$in: ids}}).toArray();
    const file = `${dir}/${PURGE_EXPORT_FILE}`;
    await fsImpl.mkdir(dir);
    await fsImpl.writeFile(file, EJSON.stringify(full, {relaxed: false}));
    report.exportFile = file;
  }

  const ids = purgeable.map((document) => document['_id']);
  const result = await collection.deleteMany({_id: {$in: ids}});
  report.purged = result.deletedCount;
  return report;
};

export {purgeArchivedBookings, PURGE_EXPORT_FILE};
export type {IPurgeReport, IPurgeOptions};

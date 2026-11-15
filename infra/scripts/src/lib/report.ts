/**
 * The report `ensure-collections` prints (003 T116, data-model.md § 2).
 *
 * The command's job is to make the deployment's collections and indexes match the server's
 * schemas, so the report is the evidence: per collection, the index keys that are present
 * afterwards. An operator reads the same index keys the assertions check, so "it ran" and "the
 * indexes are there" cannot disagree.
 */

/** The index keys on one collection, as `{field: direction}`. */
type TIndexKeys = Record<string, number | string>;

interface ICollectionResult {
  collection: string;
  /** The index keys present on the collection after the run, in the order MongoDB reports them. */
  indexes: TIndexKeys[];
}

interface IEnsureReport {
  collections: ICollectionResult[];
}

/**
 * Narrows a `listIndexes()` row to its `key` document.
 *
 * `listIndexes()` returns the driver's index information, which carries `v`, `key`, `name` and
 * (for the `_id` index) `ns`. Only `key` describes the index's shape, and it is the part two
 * runs can be compared on, so the report and the assertions read it rather than the whole row.
 * The `_id` index is kept: it is a real index the deployment creates, and its absence would mean
 * something is wrong with the collection.
 */
const toIndexKeys = (row: Record<string, unknown>): TIndexKeys => (row['key'] as TIndexKeys) ?? {};

const formatReport = (report: IEnsureReport, dryRun: boolean): string => {
  const lines: string[] = [];
  lines.push(dryRun ? 'Ensure-collections dry run — nothing was written.' : 'Collections ensured.');
  lines.push('');
  for (const {collection, indexes} of report.collections) {
    lines.push(`${collection}:`);
    for (const key of indexes) {
      lines.push(`  ${JSON.stringify(key)}`);
    }
  }
  return lines.join('\n');
};

export {toIndexKeys, formatReport};
export type {TIndexKeys, ICollectionResult, IEnsureReport};

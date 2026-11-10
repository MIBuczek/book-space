import type {IPurgeReport} from './purge';
import type {IArchiveManifest} from './archive';

/**
 * The human-readable output for each backup-tool command (T060).
 *
 * Kept separate from `cli.ts` so the wording is asserted on its own and the orchestration is
 * about control flow rather than string building — the same split `tools/migration`'s
 * `report.ts` uses.
 */

const formatManifest = (manifest: IArchiveManifest): string => {
  const lines = [`  ${manifest.createdAt}  ${manifest.sourceDatabase}`];
  for (const [collection, count] of Object.entries(manifest.counts)) {
    lines.push(`  ${collection.padEnd(10)} ${count}`);
  }
  return lines.join('\n');
};

const formatBackup = (manifest: IArchiveManifest, dir: string): string =>
  `Backup written to ${dir}.\n${formatManifest(manifest)}`;

const formatRestore = (manifest: IArchiveManifest, database: string): string =>
  `Restore complete into ${database}.\n${formatManifest(manifest)}`;

const formatPurge = (report: IPurgeReport, dryRun: boolean, cutoff: Date): string => {
  const lines = [
    dryRun
      ? `Retention dry run — nothing was deleted (cutoff ${cutoff.toISOString()}).`
      : `Retention purge complete (cutoff ${cutoff.toISOString()}).`,
    `  candidates ${report.candidates}`,
    `  purgeable  ${report.purgeable}`,
    `  skipped    ${report.skipped}`,
    `  purged     ${report.purged}`,
  ];
  if (report.exportFile !== undefined) {
    lines.push(`  export     ${report.exportFile}`);
  }
  return lines.join('\n');
};

export {formatBackup, formatRestore, formatPurge, formatManifest};

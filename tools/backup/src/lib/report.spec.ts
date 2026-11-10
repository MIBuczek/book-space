import {formatBackup, formatRestore, formatPurge, formatManifest} from './report';
import type {IArchiveManifest} from './archive';

/** The printed output of each subcommand (T060). */
describe('report formatting', () => {
  const manifest: IArchiveManifest = {
    createdAt: '2026-11-08T00:00:00.000Z',
    sourceDatabase: 'book_space',
    counts: {users: 2, clients: 3, buildings: 12, bookings: 40},
  };

  it('names every collection and its count in the manifest', () => {
    const text = formatManifest(manifest);
    expect(text).toContain('book_space');
    expect(text).toContain('buildings');
    expect(text).toContain('12');
  });

  it('names the archive directory in the backup line', () => {
    expect(formatBackup(manifest, '/tmp/archive')).toContain('Backup written to /tmp/archive.');
  });

  it('names the target database in the restore line', () => {
    expect(formatRestore(manifest, 'book_space_restore')).toContain('Restore complete into book_space_restore.');
  });

  it('reports the purge counters and the export path', () => {
    const text = formatPurge(
      {candidates: 5, purgeable: 4, purged: 4, skipped: 1, exportFile: '/tmp/purged.json'},
      false,
      new Date('2021-01-01T00:00:00.000Z')
    );
    expect(text).toContain('Retention purge complete');
    expect(text).toContain('purged     4');
    expect(text).toContain('/tmp/purged.json');
  });

  it('labels a dry run and omits the export line when there is none', () => {
    const text = formatPurge({candidates: 5, purgeable: 4, purged: 0, skipped: 1}, true, new Date('2021-01-01T00:00:00.000Z'));
    expect(text).toContain('dry run');
    expect(text).not.toContain('export');
  });
});

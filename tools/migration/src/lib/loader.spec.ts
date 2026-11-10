import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadExport} from './loader';
import {COLLECTIONS} from './legacy';

/**
 * The export reader (T042). It reads a *path* rather than a baked-in location, because the
 * export holds personal data and must not live in the repository (research.md R1). These cases
 * pin the two failure modes that would otherwise look like a successful import of an empty
 * database.
 */
describe('migration loader', () => {
  let directory: string;

  const write = (collection: string, contents: string): void => {
    writeFileSync(join(directory, `${collection}.json`), contents);
  };

  const writeAll = (): void => {
    for (const collection of COLLECTIONS) {
      write(collection, '[]');
    }
  };

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'migration-loader-'));
  });

  afterEach(() => {
    rmSync(directory, {recursive: true, force: true});
  });

  it('reads one array per collection', () => {
    writeAll();
    write('bookings', JSON.stringify([{_id: 'b1'}]));
    const source = loadExport(directory);
    expect(source.bookings).toEqual([{_id: 'b1'}]);
    expect(source.clients).toEqual([]);
  });

  it('fails when a collection file is missing rather than importing it as empty', () => {
    for (const collection of COLLECTIONS.filter((name) => name !== 'users')) {
      write(collection, '[]');
    }
    expect(() => loadExport(directory)).toThrow(/users\.json/);
  });

  it('fails when a file does not contain an array', () => {
    writeAll();
    write('clients', '{"not": "an array"}');
    expect(() => loadExport(directory)).toThrow(/must contain a JSON array of clients/);
  });
});

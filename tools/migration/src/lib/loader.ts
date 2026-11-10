import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {COLLECTIONS, ILegacyExport, TCollection} from './legacy';

/**
 * Reads the legacy export from a directory of JSON files.
 *
 * One file per collection, named after the collection (`bookings.json`, `clients.json`, …).
 * The export is produced once from Firestore and committed to the operator's machine, not to
 * this repository — it holds personal data and would be the same kind of leak the rewrite
 * removed (research.md R1). The tool therefore reads a *path*, never a baked-in location, and
 * a missing file is an error rather than an empty collection: silently importing zero
 * bookings would look like a successful migration of an empty database.
 */
const loadExport = (directory: string): ILegacyExport => {
  const read = <T>(collection: TCollection): T[] => {
    const file = join(directory, `${collection}.json`);
    const raw = readFileSync(file, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error(`${file} must contain a JSON array of ${collection}`);
    }
    return parsed as T[];
  };

  const source: Partial<ILegacyExport> = {};
  for (const collection of COLLECTIONS) {
    source[collection] = read(collection) as never;
  }
  return source as ILegacyExport;
};

export {loadExport};

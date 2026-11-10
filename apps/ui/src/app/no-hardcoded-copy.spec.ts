import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * NFR-005's guard rail: the UI renders Polish copy from the catalogue, not from literals
 * scattered through the templates.
 *
 * Centralising the copy is only real if nothing can quietly reintroduce a literal. This spec
 * walks the UI source, skips the catalogue itself and the specs (which assert against copy and
 * so legitimately quote it), and fails on a Polish character that is neither inside a comment
 * nor a template interpolation. It is deliberately a *Polish-character* check rather than a
 * "looks like a sentence" check: it is exact, it cannot be argued with, and every remaining
 * user-facing string in this app is Polish.
 *
 * English literals are not caught here — a stray `Previous` in a template is a copy defect but
 * not a localisation one, and the rendered-component specs cover the strings that matter. The
 * check is the one that would otherwise regress silently: a new Polish label typed into a
 * template instead of added to the catalogue.
 */
const UI_SRC = join(__dirname, '..');

const POLISH = /[ĄĆĘŁŃÓŚŹŻąćęłńóśźż]/;

/** The catalogue lives in `libs/copy`; a spec may quote copy freely. */
const isExempt = (path: string): boolean =>
  path.endsWith('.spec.ts') || path.includes(`${join('libs', 'copy')}`);

const filesUnder = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? filesUnder(full) : [full];
  });

const isComment = (line: string): boolean => {
  const trimmed = line.trim();
  return trimmed.startsWith('*') || trimmed.startsWith('/*') || trimmed.startsWith('//');
};

describe('hardcoded copy', () => {
  it('has no Polish literal outside the catalogue and the specs', () => {
    const offenders: string[] = [];

    for (const file of filesUnder(UI_SRC)) {
      if (!file.endsWith('.ts') || isExempt(file)) {
        continue;
      }
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, index) => {
          if (POLISH.test(line) && !isComment(line)) {
            offenders.push(`${file}:${index + 1}: ${line.trim()}`);
          }
        });
    }

    expect(offenders).toEqual([]);
  });
});

import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * FR-012's guard rail: a user-facing string comes from the catalogue, not from a literal
 * compiled into a component.
 *
 * The first version of this spec flagged Polish *characters*, which was the right check while
 * every string in the app was Polish and the catalogue was a TypeScript object. Both of those
 * have changed: the copy is in `assets/i18n/*.json` (T234) and the app is bilingual (T215), so a
 * character check no longer finds the defect it was written for — an English literal typed into
 * a template would pass it. The retargeted check is language-agnostic: it flags any static
 * user-facing text, in any alphabet, and it is therefore *stricter* than the rule it replaces.
 *
 * Two shapes are flagged:
 *
 *  - a static text node — `>Some text<` — that is not an interpolation or a control-flow block;
 *  - a static value for an attribute a user reads or hears (`aria-label`, `placeholder`,
 *    `title`, `alt`).
 *
 * A translated value (`{{ 'key' | translate }}`), a bound value (`[placeholder]="label()"`) and
 * a structural block (`@if`, `@for`) are all accepted, because none of them is a literal. The
 * check is line-based and reads only the `template: \`...\`` regions — a whole-file scan would
 * flag TypeScript (`): Observable<`, `Array<string>`) as text nodes.
 *
 * Specs are exempt — a spec asserts against copy and so legitimately quotes it.
 */
const UI_SRC = join(__dirname, '..');

/** The attributes whose value a user reads or hears, so a literal there is user-facing copy. */
const USER_FACING_ATTRIBUTES = ['aria-label', 'placeholder', 'title', 'alt'];

/** A static value for a user-facing attribute; a binding (`[attr]=`) does not match. */
const attributeLiteral = (line: string): string[] => [
  ...line.matchAll(
    new RegExp(`(?:${USER_FACING_ATTRIBUTES.join('|')})="([^"{}]*[A-Za-z][^"{}]*)"`, 'g')
  ),
].map((match) => match[1]);

/** A static text node: letters between `>` and `<`, excluding an interpolation or a block. */
const textLiteral = (line: string): string[] =>
  [...line.matchAll(/>\s*([^<>{}@]*[A-Za-z][^<>{}@]*?)\s*</g)].map((match) => match[1]);

/** Every user-facing literal on a single source line, for the walk and for the self-test. */
const literalsOn = (line: string): string[] => [...attributeLiteral(line), ...textLiteral(line)];

const isExempt = (path: string): boolean => path.endsWith('.spec.ts');

const filesUnder = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? filesUnder(full) : [full];
  });

/** The template regions of a source file: each `template: \`...\`` literal, line by line. */
const templateLines = (source: string): string[] => {
  const open = /template:\s*`/;
  const lines: string[] = [];
  let inside = false;
  for (const line of source.split('\n')) {
    if (!inside) {
      const match = line.match(open);
      if (!match) {
        continue;
      }
      inside = true;
      const rest = line.slice((match.index ?? 0) + match[0].length);
      const close = rest.indexOf('`');
      if (close === -1) {
        lines.push(rest);
        continue;
      }
      lines.push(rest.slice(0, close));
      inside = false;
      continue;
    }
    const close = line.indexOf('`');
    if (close === -1) {
      lines.push(line);
      continue;
    }
    lines.push(line.slice(0, close));
    inside = false;
  }
  return lines;
};

describe('hardcoded copy', () => {
  // The guard is only a guard if it fails on the defect, so these two cases pin the rule the
  // walk below applies. Without them a regex that matched nothing would look like a clean run.
  it('flags a user-facing literal in a template', () => {
    expect(literalsOn('<h1>Welcome</h1>')).toEqual(['Welcome']);
    expect(literalsOn('<h1>Witaj</h1>')).toEqual(['Witaj']);
    expect(literalsOn('<input placeholder="First name" />')).toEqual(['First name']);
    expect(literalsOn('<img alt="Site logo" src="logo.svg" />')).toEqual(['Site logo']);
  });

  it('accepts a translated, bound or structural value', () => {
    expect(literalsOn(`<h1>{{ 'home.title' | translate }}</h1>`)).toEqual([]);
    expect(literalsOn(`<input [placeholder]="label()" />`)).toEqual([]);
    expect(literalsOn('<th scope="col">{{ column.label }}</th>')).toEqual([]);
    expect(literalsOn(`@if (open()) { <span>{{ 'x' | translate }}</span> }`)).toEqual([]);
  });

  it('has no user-facing literal outside the specs', () => {
    const offenders: string[] = [];

    for (const file of filesUnder(UI_SRC)) {
      if (!file.endsWith('.ts') || isExempt(file)) {
        continue;
      }
      for (const line of templateLines(readFileSync(file, 'utf8'))) {
        for (const literal of literalsOn(line)) {
          offenders.push(`${file}: ${literal.trim()}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});

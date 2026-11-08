/**
 * The git commit count, stamped in by the build.
 *
 * Committed as `0` so a test run or a fresh checkout has a deterministic value
 * without running the generator. `tools/generate-version.js` writes the real
 * number to `libs/version/generated/build-number.ts`, and both apps' build
 * configurations swap this file for that one through `fileReplacements` — so the
 * committed value is never overwritten and a build leaves the tree clean.
 */
export const BUILD_NUMBER = '0';

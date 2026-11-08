/**
 * The application's base semantic version.
 *
 * The build number is appended as semver build metadata (`1.0.0+63`) rather than
 * folded into the major/minor/patch, because it is derived from the git history
 * and carries no compatibility meaning. The rewrite starts at `1.0.0`.
 */
export const VERSION_BASE = '1.0.0';

/**
 * Compose the display version from the base and a build number.
 *
 * Kept pure and separate from the injected value so both the frontend and the
 * backend render the version through one implementation, and so the composition
 * is unit-tested without a build.
 */
export const composeVersion = (base: string, buildNumber: string | number): string =>
  `${base}+${buildNumber}`;

import { APP_VERSION } from './lib/app-version';
import { composeVersion, VERSION_BASE } from './lib/version';

describe('version', () => {
  describe('composeVersion', () => {
    it('appends the build number as semver build metadata', () => {
      expect(composeVersion('1.0.0', 63)).toBe('1.0.0+63');
    });

    it('accepts a string build number, which is how the build injects it', () => {
      expect(composeVersion('1.0.0', '63')).toBe('1.0.0+63');
    });
  });

  describe('VERSION_BASE', () => {
    it('starts the rewrite at 1.0.0', () => {
      expect(VERSION_BASE).toBe('1.0.0');
    });
  });

  describe('APP_VERSION', () => {
    // A test run uses the committed fallback (`0`), because the stamped file is
    // swapped in only by a production build. Asserting the shape rather than the
    // number keeps this spec independent of how many commits the checkout has.
    it('is the base version plus a build number', () => {
      expect(APP_VERSION).toMatch(/^1\.0\.0\+\d+$/);
    });

    it('reads the injected build number', () => {
      expect(APP_VERSION).toBe(`1.0.0+0`);
    });
  });
});

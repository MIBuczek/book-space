import { BUILD_NUMBER } from './build-number';
import { composeVersion, VERSION_BASE } from './version';

/**
 * The version the running application reports, e.g. `1.0.0+63`.
 *
 * One value, read by the UI footer and by the server's `GET /api` banner, so the
 * two cannot disagree about which build is deployed.
 */
export const APP_VERSION = composeVersion(VERSION_BASE, BUILD_NUMBER);

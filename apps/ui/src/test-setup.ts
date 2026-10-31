// jest-preset-angular 15 removed the `setup-jest` entry point. The replacement
// initialises the zone test environment explicitly.
import { setupZoneTestEnv } from 'jest-preset-angular/setup-env/zone';

setupZoneTestEnv();

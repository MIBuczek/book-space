// Zoneless test environment. Zone.js is no longer a polyfill, so the tests must
// not install a zone either: `setupZoneTestEnv` would make a missing signal look
// like it works, which is the failure mode the zoneless migration exists to
// surface.
import { setupZonelessTestEnv } from 'jest-preset-angular/setup-env/zoneless';

setupZonelessTestEnv();

// jsdom does not implement HTMLDialogElement.showModal/close. The modal control
// is built on <dialog> for the focus trapping and inertness the browser gives
// free, so the gap is in the environment, not the component. This stands in for
// the two methods the component calls and keeps `open` honest.
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.open = false;
    this.dispatchEvent(new Event('close'));
  };
}

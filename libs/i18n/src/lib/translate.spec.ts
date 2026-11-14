import { TestBed } from '@angular/core/testing';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { injectTranslate } from './translate';

/**
 * The `TranslateFn` seam (T231).
 *
 * The pure feature modules cannot inject the service, so the component supplies this function.
 * It must delegate to the real `TranslateService`, so a spec drives the real one rather than a
 * stub — a function that returned the key unchanged would pass a naive test and ship keys as
 * text.
 */
describe('injectTranslate', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideTranslateService({ lang: 'pl', fallbackLang: 'pl' }),
      ],
    });
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('pl', {
      bookings: {conflict: 'Konflikt', conflicts: 'Liczba: {{count}}'},
    });
  });

  it('resolves a key through the active language', () => {
    const t = TestBed.runInInjectionContext(injectTranslate);

    expect(t('bookings.conflict')).toBe('Konflikt');
  });

  it('applies the interpolation parameters', () => {
    const t = TestBed.runInInjectionContext(injectTranslate);

    expect(t('bookings.conflicts', {count: 3})).toBe('Liczba: 3');
  });

  it('returns the key when no translation is registered', () => {
    const t = TestBed.runInInjectionContext(injectTranslate);

    expect(t('bookings.missing')).toBe('bookings.missing');
  });
});

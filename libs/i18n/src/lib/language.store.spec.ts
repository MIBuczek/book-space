import { TestBed } from '@angular/core/testing';
import {
  TranslateLoader,
  TranslateService,
  provideTranslateLoader,
  provideTranslateService,
} from '@ngx-translate/core';
import { Observable, of } from 'rxjs';
import { LanguageStore, applyDocumentLanguage } from './language.store';
import { DEFAULT_LANGUAGE, LANGUAGE_STORAGE_KEY } from './languages';

/**
 * An in-memory loader so the spec exercises the real `TranslateService` rather than a stub of
 * it. Each language resolves to one key, which is enough to prove `use` completes and that the
 * store awaits it.
 */
class MemoryLoader extends TranslateLoader {
  getTranslation(lang: string): Observable<Record<string, string>> {
    return of({ greeting: lang === 'en' ? 'Hello' : 'Cześć' });
  }
}

const configure = (): void => {
  TestBed.configureTestingModule({
    providers: [
      provideTranslateService({ loader: provideTranslateLoader(MemoryLoader), fallbackLang: DEFAULT_LANGUAGE, lang: DEFAULT_LANGUAGE }),
    ],
  });
};

describe('LanguageStore', () => {
  beforeEach(() => {
    localStorage.clear();
    configure();
  });
  afterEach(() => localStorage.clear());

  it('starts on the default language', () => {
    const store = TestBed.inject(LanguageStore);
    expect(store.language()).toBe(DEFAULT_LANGUAGE);
  });

  it('exposes the declared languages for the switch', () => {
    const store = TestBed.inject(LanguageStore);
    expect(store.available.map((language) => language.code)).toEqual(['pl', 'en']);
  });

  it('switches the active language, loads it and persists the choice', async () => {
    const store = TestBed.inject(LanguageStore);
    await store.set('en');

    expect(store.language()).toBe('en');
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('en');
    const translate = TestBed.inject(TranslateService);
    expect(translate.instant('greeting')).toBe('Hello');
  });

  it('falls back to the default for an unsupported code rather than loading a missing file', async () => {
    const store = TestBed.inject(LanguageStore);
    await store.set('de');

    expect(store.language()).toBe(DEFAULT_LANGUAGE);
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe(DEFAULT_LANGUAGE);
  });

  it('mirrors the active language onto the document, for screen readers', async () => {
    const store = TestBed.inject(LanguageStore);
    await store.set('en');
    expect(document.documentElement.lang).toBe('en');
  });

  it('initializes from the stored preference', async () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'en');
    const store = TestBed.inject(LanguageStore);
    await store.initialize();

    expect(store.language()).toBe('en');
    expect(TestBed.inject(TranslateService).instant('greeting')).toBe('Hello');
  });

  it('initializes to the default when storage holds an unknown code', async () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'de');
    const store = TestBed.inject(LanguageStore);
    await store.initialize();

    expect(store.language()).toBe(DEFAULT_LANGUAGE);
  });

  it('completes even when the language file fails to load', async () => {
    class FailingLoader extends TranslateLoader {
      getTranslation(): Observable<Record<string, string>> {
        return new Observable((subscriber) => subscriber.error(new Error('network down')));
      }
    }
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideTranslateService({ loader: provideTranslateLoader(FailingLoader), fallbackLang: DEFAULT_LANGUAGE })],
    });

    const store = TestBed.inject(LanguageStore);
    await expect(store.initialize()).resolves.toBeUndefined();
    expect(store.language()).toBe(DEFAULT_LANGUAGE);
  });

  it('does not touch the document when there is none, so a non-browser host still switches', () => {
    expect(() => applyDocumentLanguage(undefined, 'en')).not.toThrow();
  });

  it('mirrors the language onto a provided document', () => {
    const doc = { documentElement: { lang: '' } } as unknown as Document;
    applyDocumentLanguage(doc, 'en');
    expect(doc.documentElement.lang).toBe('en');
  });
});

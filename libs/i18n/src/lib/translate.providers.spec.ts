import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TranslateService } from '@ngx-translate/core';
import { LanguageStore } from './language.store';
import { provideAppI18n } from './translate.providers';
import { DEFAULT_LANGUAGE } from './languages';

/**
 * The provider wiring (T212, plan D1).
 *
 * It proves the loader points at the served asset path and that both languages are registered,
 * which is what makes "add a language is add a file" true. The `TranslateService` here is the
 * real one; the HTTP backend is the only thing stood in for.
 */
describe('provideAppI18n', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideAppI18n()],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    // The app initializer loads the stored/default language as soon as the store is injected,
    // so a test that does not consume that request still has it open. Drain it, then verify.
    httpMock.match(() => true).forEach((request) => request.flush({}));
    httpMock.verify();
    localStorage.clear();
  });

  it('registers every declared language', () => {
    const translate = TestBed.inject(TranslateService);
    expect([...translate.getLangs()].sort()).toEqual(['en', 'pl']);
  });

  it('loads a language from the served asset path', () => {
    const translate = TestBed.inject(TranslateService);
    let value: string | undefined;
    translate.use('en').subscribe((translations) => {
      value = (translations as Record<string, string>)['greeting'];
    });

    const request = httpMock.expectOne('/assets/i18n/en.json');
    expect(request.request.method).toBe('GET');
    request.flush({ greeting: 'Hello' });

    expect(value).toBe('Hello');
  });

  it('provides the store the initializer drives', () => {
    expect(TestBed.inject(LanguageStore).language()).toBe(DEFAULT_LANGUAGE);
  });
});

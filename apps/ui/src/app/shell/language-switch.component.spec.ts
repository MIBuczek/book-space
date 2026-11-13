import { TestBed } from '@angular/core/testing';
import { LanguageStore } from '@booking/i18n';
import { LanguageSwitchComponent } from './language-switch.component';
import { provideTestI18n } from '../../testing/i18n-testing';

/**
 * The language switch (T220, T222, FR-003, FR-004, SC-001).
 *
 * The spec drives the real `TranslateService` (both catalogues are registered by
 * `provideTestI18n`), so a change of language re-renders the translated label — the zoneless
 * constraint is only satisfied if the pipe actually reacts, and a stub would not prove it.
 */
describe('LanguageSwitchComponent', () => {
  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [LanguageSwitchComponent],
      providers: [provideTestI18n()],
    }).compileComponents();
  });

  afterEach(() => localStorage.clear());

  const render = () => {
    const fixture = TestBed.createComponent(LanguageSwitchComponent);
    fixture.detectChanges();
    return fixture;
  };

  it('offers every declared language, in order', () => {
    const select = render().nativeElement.querySelector('select') as HTMLSelectElement;

    expect(Array.from(select.options).map((option) => option.value)).toEqual(['pl', 'en']);
    expect(Array.from(select.options).map((option) => option.textContent?.trim())).toEqual([
      'Polski',
      'English',
    ]);
  });

  it('labels the control in the active language', () => {
    const select = render().nativeElement.querySelector('select') as HTMLSelectElement;

    expect(select.getAttribute('aria-label')).toBe('Język');
  });

  it('switches the language, persists it and relabels the control', async () => {
    const fixture = render();
    const store = TestBed.inject(LanguageStore);
    const select = fixture.nativeElement.querySelector('select') as HTMLSelectElement;

    select.value = 'en';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(store.language()).toBe('en');
    expect(localStorage.getItem('book-space.language')).toBe('en');
    // The pipe re-rendered: the label is now English, which is the switch's own text changing.
    expect(select.getAttribute('aria-label')).toBe('Language');
  });

  it('reflects the active language as the selected option', async () => {
    const store = TestBed.inject(LanguageStore);
    await store.set('en');
    const fixture = render();

    const select = fixture.nativeElement.querySelector('select') as HTMLSelectElement;
    expect(select.value).toBe('en');
  });
});

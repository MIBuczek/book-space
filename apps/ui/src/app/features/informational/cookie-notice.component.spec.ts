import { TestBed } from '@angular/core/testing';
import { CookieNoticeComponent } from './cookie-notice.component';
import { provideTestI18n } from '../../../testing/i18n-testing';
import { provideTestTenant } from '../../../testing/tenant-testing';

const KEY = 'book-space.cookies-acknowledged';

describe('CookieNoticeComponent', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [CookieNoticeComponent],
      providers: [provideTestI18n(), provideTestTenant()],
    });
  });

  const render = () => {
    const fixture = TestBed.createComponent(CookieNoticeComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };

  it('shows the notice when the visitor has not acknowledged it', () => {
    expect(render().textContent).toContain('Pliki Cookies');
  });

  it('links to the tenant privacy policy (FR-007)', () => {
    const link = render().querySelector('a');
    expect(link?.getAttribute('href')).toBe('https://example.com/privacy');
    expect(link?.getAttribute('target')).toBe('_blank');
  });

  it('hides the learn-more link when the tenant has no privacy policy (SC-005)', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [CookieNoticeComponent],
      providers: [provideTestI18n(), provideTestTenant(null)],
    });
    expect(render().querySelector('a')).toBeNull();
  });

  it('hides the notice and persists the acknowledgement when accepted', () => {
    const fixture = TestBed.createComponent(CookieNoticeComponent);
    fixture.detectChanges();

    const button = (fixture.nativeElement as HTMLElement).querySelector('button');
    button?.click();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Pliki Cookies');
    // The stored value is the acknowledgement itself, not the legacy `'false'`
    // that read back as truthy and brought the notice back on every reload.
    expect(localStorage.getItem(KEY)).toBe('true');
  });

  it('stays hidden on reload once acknowledged', () => {
    localStorage.setItem(KEY, 'true');
    expect(render().textContent).not.toContain('Pliki Cookies');
  });
});

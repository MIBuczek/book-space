import { TestBed } from '@angular/core/testing';
import { CookieNoticeComponent } from './cookie-notice.component';

const KEY = 'book-space.cookies-acknowledged';

describe('CookieNoticeComponent', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [CookieNoticeComponent] });
  });

  const render = () => {
    const fixture = TestBed.createComponent(CookieNoticeComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };

  it('shows the notice when the visitor has not acknowledged it', () => {
    expect(render().textContent).toContain('Pliki Cookies');
  });

  it('links to the privacy policy', () => {
    const link = render().querySelector('a');
    expect(link?.getAttribute('href')).toContain('polityka-prywatnosci');
    expect(link?.getAttribute('target')).toBe('_blank');
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

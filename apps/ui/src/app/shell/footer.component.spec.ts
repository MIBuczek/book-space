import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { APP_VERSION } from '@booking/version';
import { FooterComponent } from './footer.component';
import { provideTestI18n, testCatalogue } from '../../testing/i18n-testing';

const CONTACT = testCatalogue('pl')['contact'] as Record<string, string>;

describe('FooterComponent', () => {
  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [FooterComponent],
      providers: [provideRouter([]), provideTestI18n()],
    }).compileComponents();
  });

  const render = () => {
    const fixture = TestBed.createComponent(FooterComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };

  it('names the system', () => {
    expect(render().textContent).toContain('Book Space');
  });

  it('shows the Gecko Web Services copyright', () => {
    expect(render().textContent).toContain('© 2026 Gecko Web Services');
  });

  it('shows the application version the server also reports', () => {
    expect(render().textContent).toContain(APP_VERSION);
  });

  it('links to the privacy policy and the site', () => {
    const el = render();
    expect(el.querySelector(`a[href="${CONTACT['privacyPolicyUrl']}"]`)).not.toBeNull();
    expect(el.querySelector(`a[href="${CONTACT['websiteUrl']}"]`)).not.toBeNull();
  });
});

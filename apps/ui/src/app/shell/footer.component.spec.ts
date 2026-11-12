import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { APP_VERSION } from '@booking/version';
import { FooterComponent } from './footer.component';
import { COPY } from '@booking/copy';

const PRIVACY_POLICY_URL = COPY.contact.privacyPolicyUrl;
const WEBSITE_URL = COPY.contact.websiteUrl;

describe('FooterComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FooterComponent],
      providers: [provideRouter([])],
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
    expect(el.querySelector(`a[href="${PRIVACY_POLICY_URL}"]`)).not.toBeNull();
    expect(el.querySelector(`a[href="${WEBSITE_URL}"]`)).not.toBeNull();
  });
});

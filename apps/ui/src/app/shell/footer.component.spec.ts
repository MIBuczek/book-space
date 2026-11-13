import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { APP_VERSION } from '@booking/version';
import { DEFAULT_TENANT_NAME, ITenant } from '@models/tenant.model';
import { FooterComponent } from './footer.component';
import { provideTestI18n } from '../../testing/i18n-testing';
import { provideTestTenant, testTenant } from '../../testing/tenant-testing';

describe('FooterComponent', () => {
  const configure = (tenant: ITenant | null = testTenant()) => {
    TestBed.configureTestingModule({
      imports: [FooterComponent],
      providers: [provideRouter([]), provideTestI18n(), provideTestTenant(tenant)],
    });
  };

  beforeEach(async () => {
    localStorage.clear();
    configure();
    await TestBed.compileComponents();
  });

  const render = () => {
    const fixture = TestBed.createComponent(FooterComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };

  it('names the tenant the API reports (FR-007)', () => {
    expect(render().textContent).toContain('Example Sports');
  });

  it('falls back to the product name when no tenant is loaded', () => {
    TestBed.resetTestingModule();
    configure(null);
    expect(render().textContent).toContain(DEFAULT_TENANT_NAME);
  });

  it('shows the Gecko Web Services copyright', () => {
    expect(render().textContent).toContain('© 2026 Gecko Web Services');
  });

  it('shows the application version the server also reports', () => {
    expect(render().textContent).toContain(APP_VERSION);
  });

  it('links to the tenant privacy policy and site (FR-007)', () => {
    const el = render();
    expect(el.querySelector('a[href="https://example.com/privacy"]')).not.toBeNull();
    expect(el.querySelector('a[href="https://example.com"]')).not.toBeNull();
  });

  // An unset value hides its element rather than rendering a link with no destination (SC-005).
  it('hides the links when the tenant has no URL configured', () => {
    TestBed.resetTestingModule();
    configure(testTenant({ websiteUrl: null, privacyUrl: null }));
    const el = render();
    expect(el.querySelector('a[href]')).toBeNull();
    // The brand still renders, so the footer is not empty.
    expect(el.textContent).toContain('Example Sports');
  });
});

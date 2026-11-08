import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { APP_VERSION } from '@booking/version';
import { FooterComponent } from './footer.component';
import { PRIVACY_POLICY_URL, SISK_WEBSITE_URL } from '../features/informational/contact-details';

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
    expect(render().textContent).toContain('SISK Siechnice');
  });

  it('shows the application version the server also reports', () => {
    expect(render().textContent).toContain(APP_VERSION);
  });

  it('links to the privacy policy and the SISK site', () => {
    const el = render();
    expect(el.querySelector(`a[href="${PRIVACY_POLICY_URL}"]`)).not.toBeNull();
    expect(el.querySelector(`a[href="${SISK_WEBSITE_URL}"]`)).not.toBeNull();
  });
});

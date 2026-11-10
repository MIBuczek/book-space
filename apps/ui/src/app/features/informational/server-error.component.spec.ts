import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ServerErrorComponent } from './server-error.component';
import { ErrorStore } from '../../core/error.store';
import { COPY } from '@booking/copy';

const OFFICE_CONTACT = COPY.contact.office;

describe('ServerErrorComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ServerErrorComponent],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  const render = () => {
    const fixture = TestBed.createComponent(ServerErrorComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };

  it('shows the recorded failure', () => {
    TestBed.inject(ErrorStore).reportServerError('Baza danych jest niedostępna');
    expect(render().textContent).toContain('Baza danych jest niedostępna');
  });

  it('falls back to a default message when nothing was recorded', () => {
    expect(render().textContent).toContain('Serwer jest niedostępny.');
  });

  it('offers the office phone and e-mail, dialling the number it prints', () => {
    const el = render();
    expect(el.textContent).toContain(OFFICE_CONTACT.phone);
    expect(el.textContent).toContain(OFFICE_CONTACT.email);
    // The legacy labelled the `tel:` link with an envelope icon; here the link's
    // text is the number, so the label and the target agree.
    const phone = el.querySelector(`a[href="${OFFICE_CONTACT.phoneHref}"]`);
    expect(phone?.textContent).toContain(OFFICE_CONTACT.phone);
    expect(el.querySelector(`a[href="mailto:${OFFICE_CONTACT.email}"]`)).not.toBeNull();
  });

  it('offers a link back to the calendar', () => {
    const link = render().querySelector('a[href="/"]');
    expect(link).not.toBeNull();
  });
});

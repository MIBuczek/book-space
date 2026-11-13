import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import { ContactComponent } from './contact.component';
import { provideTestI18n, testCatalogue } from '../../../testing/i18n-testing';
import { provideTestTenant } from '../../../testing/tenant-testing';

/** The catalogue the app loads, so a key that moves in the JSON fails the spec (T235). */
const CONTACT = testCatalogue('pl')['contact'] as Record<string, never>;
const BOOKING_CONTACT = CONTACT['bookingContact'] as Record<string, string>;
const OFFICE_CONTACT = CONTACT['office'] as Record<string, string>;
const OFFICE_HOURS = CONTACT['hours'] as Array<{ day: string; hours: string }>;
const REGISTERED_OFFICE = CONTACT['registeredOffice'] as Record<string, string>;

describe('ContactComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ContactComponent],
      providers: [provideTestI18n(), provideTestTenant()],
    }).compileComponents();
  });

  const render = () => {
    const fixture = TestBed.createComponent(ContactComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };

  it('shows the registered office', () => {
    const text = render().textContent ?? '';
    expect(text).toContain(REGISTERED_OFFICE['name']);
    expect(text).toContain(REGISTERED_OFFICE['address']);
  });

  it('shows the office address and phone, dialling the number it prints', () => {
    const el = render();
    const text = el.textContent ?? '';
    expect(text).toContain(OFFICE_CONTACT['address']);
    expect(text).toContain(OFFICE_CONTACT['phone']);

    const phone = el.querySelector(`a[href="${OFFICE_CONTACT['phoneHref']}"]`);
    expect(phone?.textContent).toContain(OFFICE_CONTACT['phone']);
  });

  it('shows the tenant contact e-mail and website (FR-007)', () => {
    const el = render();
    expect(el.querySelector('a[href="mailto:office@example.com"]')).not.toBeNull();
    expect(el.querySelector('a[href="https://example.com"]')).not.toBeNull();
  });

  it('hides the contact e-mail and website when the tenant has none (SC-005)', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ContactComponent],
      providers: [
        provideTestI18n(),
        provideTestTenant(null),
      ],
    });
    const el = render();
    const office = el.querySelectorAll('.bs-contact__column')[1];
    expect(office.querySelector('a[href^="mailto:"]')).toBeNull();
    expect(office.querySelector('a[href^="https://example.com"]')).toBeNull();
  });

  it('shows every opening hour', () => {
    const text = render().textContent ?? '';
    for (const { day, hours } of OFFICE_HOURS) {
      expect(text).toContain(day);
      expect(text).toContain(hours);
    }
  });

  it('shows the booking contact with the number that dials', () => {
    const el = render();
    const text = el.textContent ?? '';
    expect(text).toContain(BOOKING_CONTACT['name']);
    expect(text).toContain(BOOKING_CONTACT['role']);
    expect(text).toContain(BOOKING_CONTACT['phone']);
    expect(text).toContain(BOOKING_CONTACT['email']);
    expect(el.querySelector(`a[href="${BOOKING_CONTACT['phoneHref']}"]`)).not.toBeNull();
    expect(el.querySelector(`a[href="mailto:${BOOKING_CONTACT['email']}"]`)).not.toBeNull();
  });

  it('re-renders the blocks in the other language when the language changes (FR-003)', async () => {
    const fixture = TestBed.createComponent(ContactComponent);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      REGISTERED_OFFICE['name']
    );

    await TestBed.inject(TranslateService).use('en').toPromise();
    fixture.detectChanges();

    const en = testCatalogue('en')['contact'] as Record<string, never>;
    const enOffice = en['registeredOffice'] as Record<string, string>;
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(enOffice['name']);
  });
});

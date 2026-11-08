import { TestBed } from '@angular/core/testing';
import { ContactComponent } from './contact.component';
import {
  BOOKING_CONTACT,
  OFFICE_CONTACT,
  OFFICE_HOURS,
  REGISTERED_OFFICE,
} from './contact-details';

describe('ContactComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ContactComponent] }).compileComponents();
  });

  const render = () => {
    const fixture = TestBed.createComponent(ContactComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };

  it('shows the registered office', () => {
    const text = render().textContent ?? '';
    expect(text).toContain(REGISTERED_OFFICE.name);
    expect(text).toContain(REGISTERED_OFFICE.address);
  });

  it('shows the office contact details, dialling the number it prints', () => {
    const el = render();
    const text = el.textContent ?? '';
    expect(text).toContain(OFFICE_CONTACT.address);
    expect(text).toContain(OFFICE_CONTACT.phone);
    expect(text).toContain(OFFICE_CONTACT.email);

    const phone = el.querySelector(`a[href="${OFFICE_CONTACT.phoneHref}"]`);
    expect(phone?.textContent).toContain(OFFICE_CONTACT.phone);
    const email = el.querySelector(`a[href="mailto:${OFFICE_CONTACT.email}"]`);
    expect(email).not.toBeNull();
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
    expect(text).toContain(BOOKING_CONTACT.name);
    expect(text).toContain(BOOKING_CONTACT.role);
    expect(text).toContain(BOOKING_CONTACT.phone);
    expect(text).toContain(BOOKING_CONTACT.email);
    expect(el.querySelector(`a[href="${BOOKING_CONTACT.phoneHref}"]`)).not.toBeNull();
    expect(el.querySelector(`a[href="mailto:${BOOKING_CONTACT.email}"]`)).not.toBeNull();
  });
});

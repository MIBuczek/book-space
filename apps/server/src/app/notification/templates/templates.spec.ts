import {NOTIFICATION_TEMPLATES, TEMPLATE_IDS} from './templates';
import {optionalVariables, renderTemplate, requiredVariables} from './render';
import {bookingVariables} from '../mail/booking-email';

/**
 * The four templates are the contract (contracts/notification-templates.md): the variable set
 * is what the legacy `email-services.ts` built, and the recipient is what the legacy dispatch
 * resolved. These tests pin the contract rather than the wording, so a re-worded body passes
 * and a dropped variable does not.
 */
describe('notification templates', () => {
  it('declares exactly the four legacy templates', () => {
    expect([...TEMPLATE_IDS].sort()).toEqual([
      'booking-facility',
      'booking-staff',
      'contact-message',
      'employee-message',
    ]);
  });

  it('keeps the legacy EmailJS template ids so the origin is traceable', () => {
    expect(NOTIFICATION_TEMPLATES['booking-facility'].legacyTemplateId).toBe('template_5l7nfa5');
    expect(NOTIFICATION_TEMPLATES['booking-staff'].legacyTemplateId).toBe('template_gsvb2al');
    expect(NOTIFICATION_TEMPLATES['contact-message'].legacyTemplateId).toBe('template_730331f');
    expect(NOTIFICATION_TEMPLATES['employee-message'].legacyTemplateId).toBe('template_izso2cm');
  });

  it('documents the recipient each template resolves to', () => {
    expect(NOTIFICATION_TEMPLATES['booking-facility'].recipient).toBe('FACILITY');
    expect(NOTIFICATION_TEMPLATES['booking-staff'].recipient).toBe('STAFF');
    expect(NOTIFICATION_TEMPLATES['contact-message'].recipient).toBe('CONTACT');
    expect(NOTIFICATION_TEMPLATES['employee-message'].recipient).toBe('EMPLOYEE');
  });

  it('separates the two booking variants: only the facility one carries buildingEmail', () => {
    expect(requiredVariables(NOTIFICATION_TEMPLATES['booking-facility'])).toContain('buildingEmail');
    expect(requiredVariables(NOTIFICATION_TEMPLATES['booking-staff'])).not.toContain('buildingEmail');
  });

  it('gives the two booking variants distinct subject lines', () => {
    expect(NOTIFICATION_TEMPLATES['booking-facility'].subject).not.toBe(
      NOTIFICATION_TEMPLATES['booking-staff'].subject
    );
  });
});

/**
 * The acceptance criterion that matters most: for a complete booking, every variable the
 * template declares is populated by the builder, so the render produces no unresolved
 * placeholder. This is the test that fails if a template gains a variable the builder does not
 * supply — the failure mode the legacy EmailJS setup hid behind an account.
 */
describe('every declared variable is populated for a complete booking', () => {
  const completeBooking = {
    _id: 'b1',
    place: {place: 'hala-sportowa', city: 'siechnice'},
    personName: 'Jan Kowalski',
    personCompany: 'Klub Sportowy',
    personEmail: 'jan@example.com',
    personPhone: '500100200',
    paymentMethod: 'TRANSFER',
    comments: 'Proszę o kontakt',
    bookedTimes: [
      {
        day: new Date('2026-03-04T10:00:00Z'),
        startHours: new Date('2026-03-04T10:00:00Z'),
        endHours: new Date('2026-03-04T11:00:00Z'),
        status: 'INITIAL' as const,
      },
    ],
  };

  it.each(['booking-facility', 'booking-staff'] as const)('%s', (templateId) => {
    const template = NOTIFICATION_TEMPLATES[templateId];
    const variables = bookingVariables(completeBooking, 'facility@example.com');

    for (const name of requiredVariables(template)) {
      expect(variables[name]).toBeDefined();
      expect(variables[name]).not.toBe('');
    }

    const {subject, text} = renderTemplate(template, variables);
    expect(subject).not.toContain('{{');
    expect(text).not.toContain('{{');
  });

  it.each(['contact-message', 'employee-message'] as const)('%s', (templateId) => {
    const template = NOTIFICATION_TEMPLATES[templateId];
    const variables = {
      person: 'Anna Nowak',
      email: 'anna@example.com',
      phone: '500100200',
      message: 'Pytanie',
    };

    for (const name of requiredVariables(template)) {
      expect(variables[name as keyof typeof variables]).toBeDefined();
    }

    const {subject, text} = renderTemplate(template, variables);
    expect(subject).not.toContain('{{');
    expect(text).not.toContain('{{');
  });

  it('names every optional block it declares', () => {
    expect(optionalVariables(NOTIFICATION_TEMPLATES['contact-message'])).toEqual(['phone']);
    expect(optionalVariables(NOTIFICATION_TEMPLATES['booking-facility'])).toEqual(['club', 'message']);
  });
});

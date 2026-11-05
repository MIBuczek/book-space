import {optionalVariables, render, renderTemplate, requiredVariables} from './render';
import {NOTIFICATION_TEMPLATES} from './templates';

describe('render', () => {
  it('substitutes a required placeholder', () => {
    expect(render('Cześć {{name}}', {name: 'Jan'})).toBe('Cześć Jan');
  });

  it('throws when a required placeholder is not supplied', () => {
    expect(() => render('Cześć {{name}}', {})).toThrow('{{name}}');
  });

  it('throws when a supplied required placeholder is the empty string', () => {
    // An empty value is treated as absent: a required field that rendered as blank would be a
    // silently incomplete e-mail, which is what the placeholder check exists to prevent.
    expect(() => render('Cześć {{name}}', {name: ''})).toThrow('{{name}}');
  });

  it('keeps an optional block when its value is present', () => {
    expect(render('{{#club}}Firma: {{club}}\n{{/club}}', {club: 'Klub'})).toBe('Firma: Klub\n');
  });

  it('drops an optional block when the value is absent', () => {
    expect(render('A\n{{#club}}Firma: {{club}}\n{{/club}}B', {})).toBe('A\nB');
  });

  it('drops an optional block when its value is an empty string', () => {
    expect(render('A\n{{#club}}Firma: {{club}}\n{{/club}}B', {club: ''})).toBe('A\nB');
  });

  it('does not let one optional block swallow the next', () => {
    const template =
      '{{#club}}Firma: {{club}}\n{{/club}}{{#message}}Wiadomość: {{message}}\n{{/message}}end';
    expect(render(template, {message: 'Cześć'})).toBe('Wiadomość: Cześć\nend');
  });

  it('throws when a placeholder survives rendering', () => {
    // `{{ weird }}` has spaces, so it is not a `\w+` placeholder the substituter matches; the
    // final scan is what catches a malformed tag rather than shipping it verbatim.
    expect(() => render('{{#club}}{{club}} {{ weird }}{{/club}}', {club: 'x'})).toThrow(
      'unresolved placeholder'
    );
  });
});

describe('renderTemplate', () => {
  it('renders the subject and body from one variable set', () => {
    const rendered = renderTemplate(NOTIFICATION_TEMPLATES['contact-message'], {
      person: 'Anna',
      email: 'anna@example.com',
      message: 'Pytanie',
    });
    expect(rendered.subject).toBe('Wiadomość od Anna');
    expect(rendered.text).toContain('anna@example.com');
    expect(rendered.text).toContain('Pytanie');
    expect(rendered.text).not.toContain('{{');
  });
});

describe('requiredVariables / optionalVariables', () => {
  it('reports the booking-facility required set without the optional ones', () => {
    const required = requiredVariables(NOTIFICATION_TEMPLATES['booking-facility']);
    expect(required).toEqual(
      expect.arrayContaining([
        'building',
        'city',
        'payment',
        'person',
        'email',
        'phone',
        'parsedBookingTime',
        'buildingEmail',
      ])
    );
    expect(required).not.toContain('club');
    expect(required).not.toContain('message');
  });

  it('reports the optional blocks a template declares', () => {
    expect(optionalVariables(NOTIFICATION_TEMPLATES['booking-staff'])).toEqual(['club', 'message']);
    expect(optionalVariables(NOTIFICATION_TEMPLATES['employee-message'])).toEqual([]);
  });
});

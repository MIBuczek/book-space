import {ILegacyExport} from '../lib/legacy';

/**
 * A representative legacy export.
 *
 * It is built to exercise every documented transformation at least once: a `QUIT` slot, an
 * `invoice` payment, a booking with `selectedOptions` (so `extraOptions` is derived true), a
 * booking with a missing `nick`/`discount`/audit stamp, a company and an individual client, a
 * facility whose `extra.lighting`/`extra.toilets` differ, and a user per role flag. The values
 * are deliberately *not* a copy of the production data: this is a fixture, and the production
 * export holds personal data that must never enter the repository (research.md R1).
 *
 * The date strings are legacy local wall-clock values (Europe/Warsaw). `2026-03-29` is the
 * spring-forward day and `2026-10-25` the fall-back day, so a slot on either proves the
 * migration goes through `instantFromLegacyLocal` rather than a fixed offset.
 */
const legacyExport: ILegacyExport = {
  buildings: [
    {
      _id: 'building-hala-siechnice',
      name: 'Hala Sportowa',
      city: 'siechnice',
      property: 'hala-sportowa',
      size: ['1/1', '1/2'],
      extra: {lighting: true, toilets: true},
      phone: '71 000 00 01',
      email: 'hala@example.com',
      employees: ['Anna Nowak', 'Piotr Zieliński'],
    },
    {
      _id: 'building-kort-radwanice',
      name: 'Korty',
      city: 'radwanice',
      property: 'kort_1',
      size: ['1/1'],
      extra: {lighting: false, toilets: true},
      phone: '71 000 00 02',
      email: 'korty@example.com',
      employees: [],
    },
  ],
  clients: [
    {
      _id: 'client-company',
      type: 'Firma',
      name: 'Przykładowa Sp. z o.o.',
      nick: 'Przykładowa',
      contactPerson: 'Jan Kowalski',
      phone: '600 100 200',
      email: 'biuro@example.com',
      street: 'ul. Przykładowa 1',
      city: 'Siechnice',
      zipCode: '55-010',
      nip: '8991234567',
    },
    {
      _id: 'client-individual',
      type: 'Indywidualny',
      name: 'Maria Wiśniewska',
      contactPerson: 'Maria Wiśniewska',
      phone: '600 300 400',
      email: 'maria@example.com',
      street: 'ul. Kwiatowa 5',
      city: 'Radwanice',
      zipCode: '55-011',
    },
  ],
  bookings: [
    {
      _id: 'booking-complete',
      type: 'Firma',
      city: 'siechnice',
      building: 'hala-sportowa',
      size: '1/1',
      clientId: 'client-company',
      nick: 'Przykładowa',
      person: 'Jan Kowalski',
      club: 'Przykładowa Sp. z o.o.',
      email: 'biuro@example.com',
      phone: '600 100 200',
      message: 'Turniej',
      payment: 'invoice',
      discount: '10%',
      accepted: true,
      archive: false,
      createdBy: 'office@example.com',
      createdAt: '2025-11-02T10:00:00.000Z',
      modifiedBy: 'admin@example.com',
      modifiedAt: '2025-11-03T11:00:00.000Z',
      bookingTime: [
        {
          day: '2026-03-29T00:01',
          startHour: '2026-03-29T08:00',
          endHour: '2026-03-29T10:00',
          comments: 'Rano',
          participants: '12',
          status: 'DONE',
        },
        {
          day: '2026-10-25T00:01',
          startHour: '2026-10-25T08:00',
          endHour: '2026-10-25T09:00',
          participants: '',
          status: 'QUIT',
        },
      ],
      selectedOptions: [
        {
          options: [{lights: true}, {toilets: true}],
          fromHour: '2026-03-29T07:00',
          toHour: '2026-03-29T08:00',
        },
      ],
    },
    {
      _id: 'booking-minimal',
      city: 'radwanice',
      building: 'kort_1',
      size: '1/1',
      // The three contact fields are required by the target schema, so the fixture supplies
      // them: this booking is the one missing every *newer* field (nick, discount, the audit
      // stamps, selectedOptions), not one that is invalid.
      person: 'Maria Wiśniewska',
      email: 'maria@example.com',
      phone: '600 300 400',
      bookingTime: [
        {
          day: '2026-06-01T00:01',
          startHour: '2026-06-01T18:00',
          endHour: '2026-06-01T20:00',
        },
      ],
    },
  ],
  users: [
    {
      _id: 'user-admin',
      email: 'Admin@Example.com',
      name: 'Michał Hoffman',
      isAdmin: true,
      isEmployee: false,
      isOffice: false,
    },
    {
      _id: 'user-office',
      email: 'office@example.com',
      name: 'Katarzyna Zielińska',
      isOffice: true,
      city: 'siechnice',
      building: ['hala-sportowa'],
    },
    {
      _id: 'user-employee',
      email: 'employee@example.com',
      name: 'Tomasz',
      city: 'radwanice',
      building: ['kort_1'],
    },
  ],
};

export {legacyExport};

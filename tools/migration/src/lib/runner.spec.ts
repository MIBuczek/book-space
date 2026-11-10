import mongoose from 'mongoose';
import {bindModels} from './models';
import {
  IWritePlan,
  countReferences,
  emptyReport,
  planWrites,
  toUpdate,
  validateDocument,
} from './runner';
import {objectIdFromLegacyId} from './identity';
import {legacyExport} from '../testing/fixtures';

/**
 * The runner's pure helpers (T042). The end-to-end path is covered by `cli.spec.ts`; these
 * cases pin the pieces that decide *what* is written, which is where a subtle error would be
 * hardest to see through a full run.
 */

const hashPassword = async (plaintext: string): Promise<string> => `hashed:${plaintext}`;

const bookingPlan = (): IWritePlan => ({
  collection: 'bookings',
  legacyId: 'x',
  document: {_id: objectIdFromLegacyId('x'), size: '1/1', createdAt: new Date('2020-01-01T00:00:00Z')},
  insertOnly: ['createdAt'],
});

describe('migration runner', () => {
  describe('toUpdate', () => {
    it('puts an insert-only key in $setOnInsert and everything else in $set', () => {
      const { $set, $setOnInsert } = toUpdate(bookingPlan());
      expect($set).toEqual({size: '1/1'});
      expect($setOnInsert).toEqual({createdAt: new Date('2020-01-01T00:00:00Z')});
    });

    it('never repeats _id in either operator, because it is the upsert filter', () => {
      const { $set, $setOnInsert } = toUpdate(bookingPlan());
      expect($set).not.toHaveProperty('_id');
      expect($setOnInsert).not.toHaveProperty('_id');
    });
  });

  describe('emptyReport', () => {
    it('starts every collection and reference counter at zero', () => {
      const report = emptyReport();
      expect(report.collections.bookings).toEqual({read: 0, inserted: 0, updated: 0, failed: 0});
      expect(report.references.bookingClient).toEqual({resolved: 0, unresolved: 0});
    });
  });

  describe('countReferences', () => {
    it('counts a booking client that resolves to a client in the export', () => {
      expect(countReferences(legacyExport).bookingClient).toEqual({resolved: 1, unresolved: 0});
    });

    it('counts a booking client that names a client the export does not contain', () => {
      const dangling = {...legacyExport, clients: []};
      expect(countReferences(dangling).bookingClient).toEqual({resolved: 0, unresolved: 1});
    });

    it('does not count a booking with no clientId, because absent is not a broken reference', () => {
      const report = countReferences(legacyExport);
      // Two bookings, only one names a client; the reference total is one, not two.
      expect(report.bookingClient.resolved + report.bookingClient.unresolved).toBe(1);
    });

    it('counts a facility reference by the city+property pair, so a same-key facility in another city resolves', () => {
      const report = countReferences(legacyExport);
      expect(report.bookingPlace).toEqual({resolved: 2, unresolved: 0});
    });

    it('counts a dangling facility reference', () => {
      const dangling = {...legacyExport, buildings: []};
      expect(countReferences(dangling).bookingPlace).toEqual({resolved: 0, unresolved: 2});
    });

    it('treats a missing city or facility on either side as the empty string, so they match', () => {
      // A facility with no city/property and a booking with neither resolve against each other:
      // both normalise to the `|` key. This is the arm the fixtures never reach, because every
      // fixture supplies both.
      const sparse = {
        ...legacyExport,
        buildings: [{_id: 'b'}],
        bookings: [{_id: 'b1'}],
        users: [],
      };
      expect(countReferences(sparse).bookingPlace).toEqual({resolved: 1, unresolved: 0});
    });

    it('counts a user facility reference per property, resolving and dangling', () => {
      // The office user names `hala-sportowa` (present); the employee names `kort_1` (present).
      expect(countReferences(legacyExport).userBuildings).toEqual({resolved: 2, unresolved: 0});
    });

    it('counts a user facility reference the export does not contain', () => {
      const dangling = {
        ...legacyExport,
        users: [{...legacyExport.users[1], building: ['hala-sportowa', 'brakujący-kort']}],
      };
      expect(countReferences(dangling).userBuildings).toEqual({resolved: 1, unresolved: 1});
    });
  });

  describe('planWrites', () => {
    it('validates every transformed record against the real schema and reports no failures for a clean export', async () => {
      const models = bindModels(mongoose.connection);
      const {plans, failures} = await planWrites(legacyExport, models, hashPassword);
      expect(failures).toEqual([]);
      expect(plans).toHaveLength(
        legacyExport.bookings.length + legacyExport.clients.length + legacyExport.buildings.length + legacyExport.users.length
      );
    });

    it('hashes the user password, and only the user documents carry one', async () => {
      const models = bindModels(mongoose.connection);
      const {plans} = await planWrites(legacyExport, models, hashPassword);
      const users = plans.filter((plan) => plan.collection === 'users');
      expect(users.every((plan) => typeof plan.document['password'] === 'string')).toBe(true);
      const bookings = plans.filter((plan) => plan.collection === 'bookings');
      expect(bookings.every((plan) => !('password' in plan.document))).toBe(true);
    });

    it('marks createdAt and password insert-only for a user, and createdAt for a booking', async () => {
      const models = bindModels(mongoose.connection);
      const {plans} = await planWrites(legacyExport, models, hashPassword);
      expect(plans.find((plan) => plan.collection === 'bookings')?.insertOnly).toEqual(['createdAt']);
      expect(plans.find((plan) => plan.collection === 'users')?.insertOnly).toEqual(['createdAt', 'password']);
    });

    it('names the collection, the legacy id and the failing field when a record does not validate', async () => {
      const models = bindModels(mongoose.connection);
      const broken = {
        ...legacyExport,
        bookings: [
          {
            _id: 'booking-broken',
            city: 'siechnice',
            building: 'hala-sportowa',
            size: '1/1',
            nick: 'Zepsuta',
            person: 'Jan',
            email: 'a@b.com',
            phone: '1',
            bookingTime: [
              {day: '2026-06-01T00:01', startHour: '2026-06-01T10:00', endHour: '2026-06-01T09:00'},
            ],
          },
        ],
      };
      const {failures} = await planWrites(broken, models, hashPassword);
      expect(failures).toHaveLength(1);
      expect(failures[0]).toContain('bookings booking-broken');
      expect(failures[0]).toContain('bookedTimes.0.endHours');
    });
  });

  describe('validateDocument', () => {
    it('returns the failing field paths for an invalid document', async () => {
      const models = bindModels(mongoose.connection);
      // A booking with only its type: every required scalar is named, which is what makes the
      // failure message useful. `bookedTimes` is absent from the list because Mongoose's
      // `required` on an array rejects only `undefined` — the default `[]` passes it.
      const errors = await validateDocument(models.Booking, {type: 'INDIVIDUAL'});
      expect(errors).toEqual(
        expect.arrayContaining(['paymentMethod', 'month', 'nick', 'size', 'place', 'personName', 'personEmail', 'personPhone'])
      );
    });

    it('returns an empty list for a valid document', async () => {
      const models = bindModels(mongoose.connection);
      const errors = await validateDocument(models.Building, {
        name: 'Hala',
        property: 'hala-sportowa',
        city: 'siechnice',
        sizes: ['1/1'],
        email: 'a@b.com',
        phone: '1',
      });
      expect(errors).toEqual([]);
    });

    it('treats a rejection that is not a validation error as a failure, not as a pass', async () => {
      // A model whose `validate` rejected without an `errors` map — a validator that threw,
      // rather than a `ValidationError`. The document must be reported as failed rather than
      // silently counted as valid, which is the one outcome a migration must never produce.
      const throwing = function Throwing() {
        return {validate: () => Promise.reject(new Error('boom'))};
      } as unknown as Parameters<typeof validateDocument>[0];
      expect(await validateDocument(throwing, {})).toEqual(['boom']);

      // A rejection that carries neither an `errors` map nor a message still names a failure.
      const silent = function Silent() {
        return {validate: () => Promise.reject({})};
      } as unknown as Parameters<typeof validateDocument>[0];
      expect(await validateDocument(silent, {})).toEqual(['unknown validation error']);
    });
  });
});

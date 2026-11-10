import {ILegacyExport, TCollection} from './legacy';
import {transformBooking, transformBuilding, transformClient, transformUser} from './transforms';
import {objectIdFromLegacyId} from './identity';
import {IDbModel, IMigrationModels} from './models';

/**
 * The orchestration around the pure transforms: validate each transformed document against
 * the real target schema, and describe the write so the caller can apply it.
 *
 * The transforms themselves live in `transforms.ts` and do no I/O, so they can be tested one
 * behaviour at a time. This module is the part that needs a database connection, and it is
 * deliberately thin: the only decisions it makes are *what to validate* and *what to count*.
 */

/** A document ready to be written, with the keys that must not be overwritten on a re-run. */
interface IWritePlan {
  collection: TCollection;
  /** The legacy id, kept for error messages. */
  legacyId: string;
  /** The full target document, including `_id`. */
  document: Record<string, unknown>;
  /**
   * Keys written only when the record is inserted. `createdAt` is immutable on the booking and
   * user schemas, and a user's `password` must not be reset by a second run, so both belong in
   * `$setOnInsert` rather than `$set`.
   */
  insertOnly: string[];
}

interface ICollectionReport {
  read: number;
  inserted: number;
  updated: number;
  failed: number;
}

/** A reference that could not be resolved to a record in the same export. */
interface IReferenceReport {
  resolved: number;
  unresolved: number;
}

interface IReconciliationReport {
  collections: Record<TCollection, ICollectionReport>;
  references: {
    bookingClient: IReferenceReport;
    bookingPlace: IReferenceReport;
    userBuildings: IReferenceReport;
  };
}

const emptyReport = (): IReconciliationReport => ({
  collections: {
    bookings: {read: 0, inserted: 0, updated: 0, failed: 0},
    clients: {read: 0, inserted: 0, updated: 0, failed: 0},
    buildings: {read: 0, inserted: 0, updated: 0, failed: 0},
    users: {read: 0, inserted: 0, updated: 0, failed: 0},
  },
  references: {
    bookingClient: {resolved: 0, unresolved: 0},
    bookingPlace: {resolved: 0, unresolved: 0},
    userBuildings: {resolved: 0, unresolved: 0},
  },
});

/**
 * The password written for a migrated user whose export carries none.
 *
 * Firebase Auth owns the legacy password hashes and they cannot be exported, so there is no
 * plaintext to carry over. A generated password would be one nobody knows, and a placeholder
 * that is not a valid bcrypt input would make the account unusable in a way that looks like a
 * data error. The tool therefore writes this literal marker, hashed like any other password,
 * and the operator forces a reset before cut-over (T043). It is not a value anyone would type,
 * so it cannot be guessed into an account.
 *
 * It is a constant, not a random value: a random one would differ on every run and turn a
 * repeatable import into one that changes data each time.
 */
const UNUSABLE_PASSWORD = 'MIGRATION-RESET-REQUIRED';

/**
 * Builds the write plan for every record in an export, validating each transformed document
 * against the real schema.
 *
 * Validation happens here, in memory, rather than through `runValidators` on the write: update
 * validators do not run a required-field check on an upsert the way document validation does,
 * so a transform that dropped a required field would pass the write and store a record the API
 * cannot read. A failure names the legacy id and the field paths, which is what makes a bad
 * record fixable rather than a mystery.
 *
 * `hashPassword` is injected rather than imported so this module has no `bcrypt` dependency and
 * a test can supply a deterministic stand-in; the real caller passes `bcrypt.hash`.
 */
const planWrites = async (
  source: ILegacyExport,
  models: IMigrationModels,
  hashPassword: (plaintext: string) => Promise<string>
): Promise<{plans: IWritePlan[]; failures: string[]}> => {
  const plans: IWritePlan[] = [];

  for (const legacy of source.buildings) {
    plans.push({
      collection: 'buildings',
      legacyId: legacy._id,
      document: transformBuilding(legacy) as unknown as Record<string, unknown>,
      insertOnly: [],
    });
  }
  for (const legacy of source.clients) {
    plans.push({
      collection: 'clients',
      legacyId: legacy._id,
      document: transformClient(legacy) as unknown as Record<string, unknown>,
      insertOnly: [],
    });
  }
  for (const legacy of source.bookings) {
    plans.push({
      collection: 'bookings',
      legacyId: legacy._id,
      document: transformBooking(legacy) as unknown as Record<string, unknown>,
      insertOnly: ['createdAt'],
    });
  }
  for (const legacy of source.users) {
    const base = transformUser(legacy);
    const password = await hashPassword(legacy.password || UNUSABLE_PASSWORD);
    plans.push({
      collection: 'users',
      legacyId: legacy._id,
      document: {...base, password} as unknown as Record<string, unknown>,
      insertOnly: ['createdAt', 'password'],
    });
  }

  const validators: Record<TCollection, IDbModel> = {
    bookings: models.Booking,
    clients: models.Client,
    buildings: models.Building,
    users: models.User,
  };

  const failures: string[] = [];
  for (const plan of plans) {
    const errors = await validateDocument(validators[plan.collection], plan.document);
    if (errors.length > 0) {
      failures.push(`${plan.collection} ${plan.legacyId}: ${errors.join(', ')}`);
    }
  }

  return {plans, failures};
};

/**
 * The field paths a document fails validation on, or an empty list when it is valid.
 *
 * `document.validate()` (not `validateSync`) is the non-deprecated API in Mongoose 9, and it
 * runs the async custom validators — the booking slot's `endHours > startHours` rule is one,
 * so a synchronous check would miss the defect it exists to catch.
 */
const validateDocument = async (model: IDbModel, document: Record<string, unknown>): Promise<string[]> => {
  const instance = new model(document);
  try {
    await instance.validate();
    return [];
  } catch (error) {
    const validation = error as {errors?: Record<string, unknown>; message?: string};
    const paths = Object.keys(validation.errors ?? {});
    // A rejection without an `errors` map is not a `ValidationError` — a validator that threw,
    // say — so it is reported as a failure rather than swallowed. Returning `[]` here would
    // treat a document the schema could not even check as valid, which is the one outcome a
    // migration must never produce.
    return paths.length > 0 ? paths : [validation.message ?? 'unknown validation error'];
  }
};

/**
 * Splits a write plan into the `$set` and `$setOnInsert` halves of an upsert.
 *
 * `_id` is the upsert filter, so it is not repeated in either operator.
 */
const toUpdate = (plan: IWritePlan): {$set: Record<string, unknown>; $setOnInsert: Record<string, unknown>} => {
  const set: Record<string, unknown> = {};
  const setOnInsert: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(plan.document)) {
    if (key === '_id') {
      continue;
    }
    if (plan.insertOnly.includes(key)) {
      setOnInsert[key] = value;
    } else {
      set[key] = value;
    }
  }
  return {$set: set, $setOnInsert: setOnInsert};
};

/**
 * Counts the references a document set makes to another, and how many resolve.
 *
 * SC-003 requires "zero broken references". A count of unresolved references is what makes
 * that measurable: a booking whose `clientId` names a client the export does not contain, or
 * whose `place` names a facility that is not there, is a dangling reference the API answers
 * `404` (or `422`) for, and it must be visible before cut-over rather than after.
 *
 * A booking that names no client is not counted: `clientId` is optional in the target, and
 * "absent" is not the same failure as "names a record that is not there".
 */
const countReferences = (source: ILegacyExport): IReconciliationReport['references'] => {
  const clientIds = new Set(source.clients.map((client) => objectIdFromLegacyId(client._id).toHexString()));
  const places = new Set(source.buildings.map((building) => `${building.city ?? ''}|${building.property ?? ''}`));
  const properties = new Set(source.buildings.map((building) => building.property ?? ''));

  const references: IReconciliationReport['references'] = {
    bookingClient: {resolved: 0, unresolved: 0},
    bookingPlace: {resolved: 0, unresolved: 0},
    userBuildings: {resolved: 0, unresolved: 0},
  };

  for (const booking of source.bookings) {
    if (booking.clientId) {
      const key = objectIdFromLegacyId(booking.clientId).toHexString();
      if (clientIds.has(key)) {
        references.bookingClient.resolved += 1;
      } else {
        references.bookingClient.unresolved += 1;
      }
    }
    const place = `${booking.city ?? ''}|${booking.building ?? ''}`;
    if (places.has(place)) {
      references.bookingPlace.resolved += 1;
    } else {
      references.bookingPlace.unresolved += 1;
    }
  }

  for (const user of source.users) {
    for (const property of user.building ?? []) {
      if (properties.has(property)) {
        references.userBuildings.resolved += 1;
      } else {
        references.userBuildings.unresolved += 1;
      }
    }
  }

  return references;
};

export {planWrites, toUpdate, countReferences, emptyReport, validateDocument, UNUSABLE_PASSWORD};
export type {IWritePlan, ICollectionReport, IReconciliationReport, IReferenceReport};

import mongoose from 'mongoose';
import {BookingSchema} from '@server/bookings/schemas/booking.schema';
import {UserSchema} from '@server/users/schemas/user.schema';
import {ClientSchema} from '@server/clients/schemas/client.schema';
import {BuildingSchema} from '@server/buildings/schemas/building.schema';

/**
 * The slice of the Mongoose `Model` API the migration uses.
 *
 * The tool deliberately does not type its models as `Model<SomeDocument>`. Mongoose's generic
 * `Model<T>` is heavily recursive, and instantiating it for the booking schema (which embeds a
 * `bookedTimes` array of subdocuments) makes `tsc` exhaust its heap rather than report an error
 * — a cost the whole workspace's `nx build` would inherit. A structural interface naming only
 * the four methods the tool calls is both sufficient and cheap to check, and it is the same
 * technique `booking-indexes.integration.spec.ts` uses to talk to the raw driver.
 */
interface IDbModel {
  schema: mongoose.Schema;
  /** A constructor that can validate a document, which is how a transformed record is checked. */
  new (document: Record<string, unknown>): {validate(): Promise<void>};
  exists(filter: Record<string, unknown>): Promise<unknown>;
  findOne(filter: Record<string, unknown>): Promise<unknown>;
  updateOne(
    filter: Record<string, unknown>,
    update: Record<string, unknown>,
    options: Record<string, unknown>
  ): Promise<unknown>;
  createIndexes(): Promise<unknown>;
}

/**
 * The four target collections, built from the server's own schema objects.
 *
 * The migration registers the *real* schemas (`SchemaFactory.createForClass(...)` from
 * `apps/server`) rather than a second, hand-written copy. That is what makes the tool's
 * validation meaningful: a transform that produces a value the server would reject fails the
 * migration here, at import time, instead of silently writing a document the API cannot read
 * back. A copy of the schemas would drift the moment either side changed, and the drift would
 * surface only as a corrupt record after cut-over.
 *
 * The schemas are imported directly rather than through `@nestjs/mongoose`: a migration tool
 * has no Nest container, and a schema is a plain `mongoose.Schema` value. Registering it with
 * `mongoose.model` is the whole wiring the tool needs. The four aliases are declared in
 * `tsconfig.base.json`; importing them is the one place this project reaches into `apps/server`,
 * and the boundary exception that permits it is documented in `tools/migration/eslint.config.mjs`.
 */
interface IMigrationModels {
  Booking: IDbModel;
  Client: IDbModel;
  Building: IDbModel;
  User: IDbModel;
}

/**
 * Binds the four models to a connection.
 *
 * `connection.model(name, schema)` throws `OverwriteModelError` when the name is already
 * registered on that connection, which happens when a Jest module registry is reused between
 * test files. The `connection.models` lookup makes the factory idempotent so a spec that calls
 * it in `beforeAll` and another that imports the module do not collide.
 *
 * The connection is a parameter rather than a captured default so the same factory serves the
 * validation pass (which does not touch the database and uses the process-global connection)
 * and the write pass (which must use the connection the operator named on the command line).
 */
const bindModels = (connection: mongoose.Connection): IMigrationModels => {
  const model = (name: string, schema: mongoose.Schema): IDbModel =>
    (connection.models[name] as unknown as IDbModel | undefined) ??
    (connection.model(name, schema) as unknown as IDbModel);

  return {
    Booking: model('Booking', BookingSchema),
    Client: model('Client', ClientSchema),
    Building: model('Building', BuildingSchema),
    User: model('User', UserSchema),
  };
};

export {bindModels};
export type {IDbModel, IMigrationModels};

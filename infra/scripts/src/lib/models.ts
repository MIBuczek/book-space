import mongoose from 'mongoose';
import {BookingSchema} from '@server/bookings/schemas/booking.schema';
import {ClientSchema} from '@server/clients/schemas/client.schema';
import {BuildingSchema} from '@server/buildings/schemas/building.schema';
import {UserSchema} from '@server/users/schemas/user.schema';

/**
 * The collections the deployment creates, bound to the server's own schemas (003 T116).
 *
 * The tool registers the **real** `SchemaFactory.createForClass(...)` schemas from
 * `apps/server` rather than a second, hand-written description of the collections and their
 * indexes. That is the whole point of the tool: `createIndexes()` on these models is what
 * creates every index the API's query planner relies on, so a new index added to a schema
 * reaches the deployment with no second edit, and the deployment cannot quietly omit an index
 * the API assumes is present — the collection-scan defect the `explain('queryPlanner')` specs
 * catch. The one place this project reaches into `apps/server` is documented in
 * `infra/scripts/eslint.config.mjs`.
 */

/**
 * The slice of the Mongoose `Model` API the tool uses.
 *
 * The models are deliberately not typed as `Model<SomeDocument>`: Mongoose's generic `Model<T>`
 * is heavily recursive, and instantiating it for the booking schema (which embeds a
 * `bookedTimes` array of subdocuments) makes `tsc` exhaust its heap rather than report an error.
 * A structural interface naming only the methods the tool calls is both sufficient and cheap to
 * check — the same technique `tools/migration/src/lib/models.ts` uses.
 */
interface IDbModel {
  schema: mongoose.Schema;
  createCollection(options?: Record<string, unknown>): Promise<unknown>;
  createIndexes(): Promise<unknown>;
  listIndexes(): Promise<Array<Record<string, unknown>>>;
}

/** A collection name paired with the model that carries its schema. */
interface IBoundModel {
  collection: string;
  model: IDbModel;
}

/**
 * Opens the connection the tool (and its tests) work against.
 *
 * `autoCreate` and `autoIndex` are **off** deliberately. Mongoose otherwise builds a model's
 * indexes in the background as a side effect of compiling it, and building an index on a missing
 * collection *creates the collection* — so merely connecting would write, and `--dry-run` would
 * not be read-only. Both have to be off: `autoIndex` alone still leaves `autoCreate` to create the
 * collection, and `autoCreate` alone still lets the index build create it. The tool creates every
 * collection and index explicitly (`ensureOne`), so the implicit build is redundant as well as
 * nondeterministic — it races the explicit `createIndexes()` and the report's `readIndexes()`,
 * which is what made the dry-run assertion flake.
 *
 * The options are set here, on the connection, rather than at each call site: a connection built
 * anywhere else would reintroduce the write. `extra` is required (a caller passes `{}` when it has
 * nothing to add) so this file has no untaken default branch — the project's coverage floor is
 * 100 %, and a defaulted parameter would sit at 0 % the moment one caller always supplied it.
 */
const openConnection = (
  uri: string,
  extra: mongoose.ConnectOptions,
): Promise<mongoose.Connection> =>
  mongoose.createConnection(uri, {...extra, autoCreate: false, autoIndex: false}).asPromise();

/**
 * Binds the four models to a connection, in the order the report prints them.
 *
 * `connection.model(name, schema)` throws `OverwriteModelError` when the name is already
 * registered on that connection, which happens when a Jest module registry is reused between
 * test files; the `connection.models` lookup makes the factory idempotent. The connection is a
 * parameter rather than a captured default so a test can point it at an ephemeral `mongod`.
 *
 * The collection name is given explicitly rather than read back from the model: Mongoose would
 * pluralise `User` to `users`, but the deployment contract (`data-model.md`) names the four
 * collections and the API queries them by that name, so the value the tool creates is the one
 * the contract states, not a pluralisation rule that could change under a Mongoose upgrade.
 */
const bindModels = (connection: mongoose.Connection): IBoundModel[] => {
  const model = (name: string, schema: mongoose.Schema): IDbModel =>
    (connection.models[name] as unknown as IDbModel | undefined) ??
    (connection.model(name, schema) as unknown as IDbModel);

  return [
    {collection: 'users', model: model('User', UserSchema)},
    {collection: 'clients', model: model('Client', ClientSchema)},
    {collection: 'buildings', model: model('Building', BuildingSchema)},
    {collection: 'bookings', model: model('Booking', BookingSchema)},
  ];
};

export {bindModels, openConnection};
export type {IDbModel, IBoundModel};

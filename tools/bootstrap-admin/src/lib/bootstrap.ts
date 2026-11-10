import mongoose from 'mongoose';
import {UserSchema} from '@server/users/schemas/user.schema';

/**
 * The first-administrator bootstrap (FR-046, SC-009).
 *
 * A fresh database has no account, and the only way to create one through the application is to
 * sign in as an administrator — which is circular. This tool is the documented out-of-band path:
 * it connects to the target database, refuses to run when an active administrator already
 * exists, and otherwise creates exactly one.
 *
 * It deliberately does **not** live inside the API. A seed that shipped in the server bundle
 * would run against production on every boot, and it would have no independent test surface —
 * the same reasoning that keeps the migration in `tools/migration` (plan.md Complexity Tracking).
 *
 * The refusal is the important half. An idempotent "create if missing" would let an operator
 * re-run the command on a populated database and mint a second administrator with a password
 * typed on a shell, which is exactly the account nobody audits. Refusing when an active
 * administrator exists makes the tool safe to run by accident.
 */

/** The administrator the tool will create. */
interface IAdministrator {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

/** The slice of the Mongoose `Model` API the tool uses, named structurally for the same reason
 * `tools/migration/src/lib/models.ts` does: `Model<TUser>`'s recursive generics are expensive to
 * check and this tool touches three methods. */
interface IUserModel {
  countDocuments(filter: Record<string, unknown>): Promise<number>;
  create(document: Record<string, unknown>): Promise<unknown>;
  createIndexes(): Promise<unknown>;
}

interface IBootstrapDependencies {
  connect: (uri: string) => Promise<mongoose.Connection>;
}

/** Raised when the database already has an active administrator. */
class AdministratorExistsError extends Error {
  constructor() {
    super('An active administrator already exists; the bootstrap tool will not create a second one.');
    this.name = 'AdministratorExistsError';
  }
}

/** Raised when a required field is missing or empty. */
class MissingFieldError extends Error {
  constructor(field: string) {
    super(`--${field} is required`);
    this.name = 'MissingFieldError';
  }
}

const USER_MODEL_NAME = 'User';

/** The model on the tool's own connection, registered with the server's real schema. */
const bindUserModel = (connection: mongoose.Connection): IUserModel =>
  (connection.models[USER_MODEL_NAME] as unknown as IUserModel | undefined) ??
  (connection.model(USER_MODEL_NAME, UserSchema) as unknown as IUserModel);

/** Rejects a blank or absent value, so an empty flag is a clear error rather than a blank account. */
const requireField = (value: string | undefined, field: string): string => {
  if (value === undefined || value.trim() === '') {
    throw new MissingFieldError(field);
  }
  return value;
};

/**
 * Creates the first administrator, or refuses when one already exists.
 *
 * The password is stored through the server's real `User` schema, so the `pre('save')` hook
 * hashes it exactly as the API does — this tool does not hash it itself, because `create()` runs
 * the hook and pre-hashing would hash the hash. That is also why the tool imports the schema
 * rather than writing the document with a raw driver call: the hook is the single place the
 * hashing rule lives, and a second copy would drift from the sign-in comparison.
 */
const bootstrapAdministrator = async (
  uri: string,
  administrator: IAdministrator,
  dependencies: IBootstrapDependencies
): Promise<{email: string}> => {
  const connection = await dependencies.connect(uri);
  try {
    const userModel = bindUserModel(connection);

    const existing = await userModel.countDocuments({role: 'ADMIN', active: true});
    if (existing > 0) {
      throw new AdministratorExistsError();
    }

    const {email, firstName, lastName, password} = administrator;
    await userModel.create({
      firstName: requireField(firstName, 'first-name'),
      lastName: requireField(lastName, 'last-name'),
      email: requireField(email, 'email'),
      password: requireField(password, 'password'),
      role: 'ADMIN',
      active: true,
    });

    // The email is unique and indexed on the schema; building the index here means the first
    // sign-in against a freshly bootstrapped database does not pay for a collection scan.
    await userModel.createIndexes();

    return {email};
  } finally {
    await connection.close();
  }
};

export {bootstrapAdministrator, AdministratorExistsError, MissingFieldError, requireField};
export type {IAdministrator, IBootstrapDependencies, IUserModel};

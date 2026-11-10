import {createHash} from 'node:crypto';
import {Types} from 'mongoose';

/**
 * A stable `_id` for a migrated record, derived from its legacy id.
 *
 * FR-042 requires the migration to preserve identifiers, and SC-003 requires a repeatable
 * reconciliation. Both are satisfied by making the target `_id` a *pure function of the
 * legacy id* rather than by adding a `legacyId` field:
 *
 * - **Preservation.** A booking's `clientId` is a reference to a client `_id`, and the
 *   legacy export carries the client's *Firebase* id there. Deriving the target `_id` from
 *   the same source string is what keeps that reference resolvable after the move, with no
 *   second lookup table to keep in step.
 * - **Idempotency.** A second run of the tool writes the same `_id`, so an upsert updates
 *   the record instead of creating a duplicate. A random `ObjectId` would make the tool
 *   append a fresh copy of every document on each run, which is the failure that makes a
 *   "one-off" import unrepeatable.
 *
 * The id is the first 24 hex characters of `sha256(legacyId)`. That is not a claim of
 * collision-resistance across the whole of SHA-256 — 96 bits is plenty for a dataset of
 * thousands of records — it is a way to spread the Firestore auto-ids (which share a long
 * common prefix) across the ObjectId space so they do not sort into blocks. Deriving it
 * from the legacy id alone, rather than hashing it with a run-specific salt, is what makes
 * the value stable across runs and machines.
 *
 * `Types.ObjectId` accepts exactly 24 hex characters; a shorter hash would not construct.
 */
const objectIdFromLegacyId = (legacyId: string): Types.ObjectId =>
  new Types.ObjectId(createHash('sha256').update(legacyId).digest('hex').slice(0, 24));

export {objectIdFromLegacyId};

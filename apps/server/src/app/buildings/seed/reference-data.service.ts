import {Injectable, OnApplicationBootstrap} from '@nestjs/common';
import {InjectModel} from '@nestjs/mongoose';
import {Model} from 'mongoose';
import {Building} from '../schemas/building.schema';
import {StructuredLogger} from '../../logging/structured-logger';
import {FACILITY_SEED} from './facility-seed';

export interface SeedResult {
  inserted: number;
  updated: number;
  total: number;
}

/**
 * Writes the reference facilities from `spec.md` §4 into MongoDB (FR-007, research.md R6).
 *
 * **Idempotent by upsert, not by "insert if empty".** Each facility is matched on
 * `{city, property}` — the compound unique index the schema already declares — so running
 * the seed twice leaves twelve documents, not twenty-four. Matching on the key rather than
 * counting the collection is what makes that true even when an administrator has already
 * created some of the facilities by hand: an "is the collection empty?" guard would skip
 * the whole seed and leave the missing ones missing.
 *
 * **The constant is authoritative**, so the seed `$set`s every field. Running it after an
 * administrator has edited a facility reverts that edit — which is the point of reference
 * data, and why the bootstrap hook below is off unless `SEED_REFERENCE_DATA=true`. It is
 * never run implicitly, so a production database is only ever seeded deliberately.
 */
@Injectable()
export class ReferenceDataService implements OnApplicationBootstrap {
  constructor(
    @InjectModel('Building') private buildingModel: Model<Building>,
    private readonly logger: StructuredLogger
  ) {}

  /**
   * Seeds on startup only when explicitly asked. `process.env` is read directly rather than
   * through `validateEnv`: a boolean there would go through `enableImplicitConversion`,
   * which coerces with `Boolean(value)` — and `Boolean('false')` is `true`, so the flag
   * would be on whenever it was present at all (see AGENTS.md).
   */
  async onApplicationBootstrap(): Promise<void> {
    if (process.env.SEED_REFERENCE_DATA !== 'true') {
      return;
    }

    const result = await this.seedFacilities();
    this.logger.log('reference_data.seeded', {...result});
  }

  /** Upserts every facility in the seed. Returns what changed, for logging and tests. */
  async seedFacilities(): Promise<SeedResult> {
    const operations = FACILITY_SEED.map((facility) => ({
      updateOne: {
        filter: {city: facility.city, property: facility.property},
        update: {$set: {...facility}},
        upsert: true,
      },
    }));

    const result = await this.buildingModel.bulkWrite(operations);

    return {
      inserted: result.upsertedCount,
      updated: result.modifiedCount,
      total: FACILITY_SEED.length,
    };
  }
}

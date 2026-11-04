import {HydratedDocument} from 'mongoose';
import {Prop, Schema, SchemaFactory} from '@nestjs/mongoose';
import validator from 'validator';
import {CITIES, SIZES, TCity, TSize} from '@models/building.model';

export type TBuilding = HydratedDocument<Building>;

/**
 * A rentable facility (FR-007, FR-008, FR-009, data-model.md buildings, research.md R6).
 *
 * `property` is the facility key a booking references, and it is unique **per city**, not
 * globally: `hala-sportowa` is a real facility in all four cities. The `{city, property}`
 * index below is what enforces that, so two facilities may share a `property` as long as
 * their `city` differs.
 *
 * `employees` holds display names, matching the legacy `building-data-const.ts`, which
 * stored plain names rather than user records. A reference would resolve to nothing for
 * every employee the seed carries, and the Facilities tab (FR-009) would then show an empty
 * list. Staff user management (T051) does not exist yet, so names are the only value the
 * data can supply; the decision is recorded in research.md R6.
 */
@Schema()
export class Building {
  @Prop({
    type: String,
    required: [true, 'Please add company name']
  })
  name!: string;

  /** Facility key, unique per city. */
  @Prop({
    type: String,
    required: [true, 'Please add the facility property key']
  })
  property!: string;

  @Prop({
    type: String,
    required: [true, 'Please add contact person email address'],
    lowercase: true,
    validate: [validator.isEmail, 'Please enter a valid email']
  })
  email!: string;

  @Prop({
    type: String,
    required: [true, 'Please add contact phone number']
  })
  phone!: string;

  @Prop({
    type: String,
    required: [true, 'Please add client name'],
    enum: {
      values: [...CITIES],
      message: 'City must be one of siechnice, radwanice, swieta-katarzyna, zerniki-wroclawskie'
    }
  })
  city!: TCity;

  /**
   * The facility's postal address. Optional, not required: neither spec.md §4, FR-009 nor
   * the legacy `building-data-const.ts` carries an address, and the legacy admin form shows
   * only phone and e-mail. A `required` field would force the seed to invent twelve
   * municipal addresses, so the field is optional and the seed supplies none.
   */
  @Prop({
    type: String
  })
  street?: string;

  @Prop({
    type: String,
    validate: [(val: string) => validator.matches(val, /^[\d./-]+$/)]
  })
  zipCode?: string;

  /**
   * The areas that can be rented at this facility, as fractions of a hall.
   *
   * Non-empty and drawn from `SIZES`: a facility with no rentable size cannot be booked,
   * and a size outside the set is one the booking form can never offer. The validator is
   * explicit rather than a Mongoose `enum`, because an empty array is a valid `[String]`
   * for `enum` to check item-wise and "at least one" is the rule the seed and the booking
   * path both depend on.
   */
  @Prop({
    type: [String],
    required: [true, 'Please add at least one rentable size'],
    validate: {
      validator: (sizes: unknown) =>
        Array.isArray(sizes) &&
        sizes.length > 0 &&
        sizes.every((size) => (SIZES as readonly string[]).includes(size as string)),
      message: 'Sizes must be a non-empty subset of 1/1, 1/2, 1/3, 2/3, 1/4, 3/4'
    }
  })
  sizes!: TSize[];

  @Prop({
    type: Boolean,
    default: () => false
  })
  lighting!: boolean;

  @Prop({
    type: Boolean,
    default: () => false
  })
  toilets!: boolean;

  @Prop({
    type: [String],
    default: () => []
  })
  employees!: string[];
}

export const BuildingSchema = SchemaFactory.createForClass(Building);

/**
 * `property` is unique per city, not globally (spec.md §4: `hala-sportowa` exists in every
 * city). A single-field unique index on `property` would reject the second city's facility;
 * the compound key is what makes "unique per city" true rather than merely intended.
 */
BuildingSchema.index({city: 1, property: 1}, {unique: true});

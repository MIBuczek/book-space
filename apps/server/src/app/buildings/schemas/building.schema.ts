import {HydratedDocument} from 'mongoose';
import {Prop, Schema, SchemaFactory} from '@nestjs/mongoose';
import validator from 'validator';
import {SIZES, TSize} from '@models/building.model';

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

  /**
   * The city the facility sits in, as free text (spec.md §9 open question 1, FR-007).
   *
   * There is no `enum`: cities are data, so an administrator adds one by adding a facility that
   * names it. The length bound is the only constraint — the DTO enforces the same range at the
   * boundary (`422`), and this is what stops a migration or a direct driver write storing an
   * unbounded value. The `{city, property}` index below still makes the facility key unique per
   * city.
   */
  @Prop({
    type: String,
    required: [true, 'Please add the city the facility sits in'],
    trim: true,
    minlength: 2,
    maxlength: 125
  })
  city!: string;

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

  /**
   * Whether the facility is still rentable (T059, FR-010).
   *
   * A hard delete is refused with `409` while a booking references the facility or a staff
   * user is assigned to it, so the supported way to retire one is a deactivation:
   * `PUT /buildings/{_id} {active: false}`. An inactive facility is withheld from the public
   * `GET /buildings` read, so the calendar and booking form stop offering it — the
   * referential-integrity fix for the legacy `deleteBuilding`, which removed the document and
   * left every booking that referenced it orphaned.
   *
   * `default: true` so a document written before this field reads as active; the reads treat
   * an absent value as active too (`active !== false`).
   */
  @Prop({
    type: Boolean,
    default: true
  })
  active!: boolean;
}

export const BuildingSchema = SchemaFactory.createForClass(Building);

/**
 * `property` is unique per city, not globally (spec.md §4: `hala-sportowa` exists in every
 * city). A single-field unique index on `property` would reject the second city's facility;
 * the compound key is what makes "unique per city" true rather than merely intended.
 */
BuildingSchema.index({city: 1, property: 1}, {unique: true});

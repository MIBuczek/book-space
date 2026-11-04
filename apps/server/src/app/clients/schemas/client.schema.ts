import {Prop, Schema, SchemaFactory} from '@nestjs/mongoose';
import {HydratedDocument} from 'mongoose';
import validator from 'validator';
import {TClientType} from '@models/booking.model';

export type TClient = HydratedDocument<Client>;

@Schema()
export class Client {
  @Prop({
    type: String,
    required: [true, 'Please pick client type'],
    uppercase: true
  })
  type!: TClientType;

  @Prop({
    type: String,
    required: [true, 'Please add company name']
  })
  name!: string;

  @Prop({
    type: String,
    required: [true, 'Please add contact person name']
  })
  contactPerson!: string;

  @Prop({
    type: String,
    required: [true, 'Please add contact phone number']
  })
  phone!: string;

  @Prop({
    type: String,
    required: [true, 'Please add contact person email address'],
    lowercase: true,
    validate: [validator.isEmail, 'Please enter a valid email']
  })
  email!: string;

  @Prop({
    type: String,
    required: [true, 'Please add client street']
  })
  street!: string;

  @Prop({
    type: String,
    required: [true, 'Please add client name']
  })
  city!: string;

  @Prop({
    type: String,
    required: [true, 'Please add client zip code'],
    validate: [(val: string) => validator.matches(val, /^[\d./-]+$/)]
  })
  zipCode!: string;

  @Prop({
    type: String
  })
  nip?: string;

  /**
   * The display label the legacy client form carried (T008, `models/store/client-models.ts`).
   * Optional: not every legacy record has one.
   */
  @Prop({
    type: String
  })
  nick?: string;

  /**
   * Audit fields (T008, FR-025). Immutable creation time and a mutable update time,
   * matching the `users` and `bookings` schemas rather than the `timestamps` schema
   * option, so the shape is explicit and a projection returns the same names everywhere.
   *
   * The update time is written by the service on the update path — `updateOne` bypasses
   * document middleware, so a hook here would not run for the route that changes a client.
   */
  @Prop({
    type: Date,
    immutable: true,
    default: () => new Date()
  })
  createdAt!: Date;

  @Prop({
    type: Date,
    default: () => new Date()
  })
  updatedAt!: Date;
}

export const ClientSchema = SchemaFactory.createForClass(Client);

/**
 * The NIP rule: required for a company, refused for an individual (T008, FR-025,
 * FR-026).
 *
 * It is a document-level validator rather than `required: true` on the property because
 * the requirement depends on `type`, which a per-field validator cannot see. The legacy
 * `ClientForm` hid the field for an individual and required it for a firm; enforcing it
 * here means a direct write cannot store a company with no NIP.
 *
 * `updateOne` does not run document validators, so the DTO carries the same rule at the
 * boundary — the schema is what stops a raw write, the DTO is what answers `422`.
 */
ClientSchema.pre('validate', function () {
  if (this.type === 'COMPANY' && !this.nip) {
    this.invalidate('nip', 'NIP is required for a company');
  }
  if (this.type === 'INDIVIDUAL' && this.nip) {
    this.invalidate('nip', 'NIP must not be set for an individual');
  }
});

/**
 * Supports the search by name the Clients tab runs (T008). The search is
 * case-insensitive and anchored, so a plain `name` index is what serves it — an index on
 * `nick` would not, because `nick` is a display label rather than the search key.
 */
ClientSchema.index({name: 1});

import {Prop, Schema, SchemaFactory} from '@nestjs/mongoose';
import {HydratedDocument} from 'mongoose';
import validator from 'validator';
import {TClientType} from '@models/booking.model';
import {isNipRequired, isNipValid, NIP_MAX_LENGTH, NIP_MIN_LENGTH} from '../models/client-nip.validator';

export type TClient = HydratedDocument<Client>;

@Schema({timestamps: true})
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
    type: String
  })
  nick?: string;

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
    minlength: [6, 'Zip code needs to be exactly 6 characters'],
    maxlength: [6, 'Zip code needs to be exactly 6 characters'],
    validate: [(val: string) => validator.matches(val, /^[\d./-]+$/), 'Please add a valid zip code']
  })
  zipCode!: string;

  /**
   * Required for a company, refused for an individual (`isNipValid`, legacy
   * `ClientForm`). The validator is what stops a direct write from storing a company
   * with no tax id; the DTO is what answers `422` at the boundary.
   *
   * Two halves, because Mongoose does not run a custom validator on an absent value:
   * `required` is the only validator it runs when `nip` is missing, so it carries the
   * "a company must supply one" case; the custom validator runs only when a value is
   * present, which is where the format and the "not for an individual" rules live.
   *
   * A regular function, not an arrow: Mongoose calls a custom validator with `this`
   * bound to the document, and an arrow function would capture the module's `this`
   * instead, so `this.type` would be `undefined` and every individual would be refused.
   */
  @Prop({
    type: String,
    required: [
      function (this: Client) {
        return isNipRequired(this.type);
      },
      `NIP is required for a company (${NIP_MIN_LENGTH}–${NIP_MAX_LENGTH} characters, digits, dots, slashes and dashes).`
    ],
    validate: {
      validator: function (this: Client, val: string) {
        return isNipValid(this.type, val);
      },
      message: 'NIP does not apply to an individual client, and must be 10–15 digits, dots, slashes and dashes.'
    }
  })
  nip?: string;

  /**
   * Whether the client is still in use (T059, FR-024).
   *
   * A hard delete is refused with `409` while a booking references the client, so the
   * supported way to retire one is a deactivation: `PUT /clients/{_id} {active: false}`.
   * The record survives for the bookings and reports that point at it, which is what the
   * legacy `deleteClient` broke — it removed the document and left every booking's
   * `clientId` dangling, and because the summary is built from `clientId` those bookings
   * vanished from reports.
   *
   * `default: true` so an existing document written before this field reads as active; the
   * reads treat an absent value as active too (`active !== false`), so a document written
   * by a direct driver call is not silently retired.
   */
  @Prop({
    type: Boolean,
    default: true
  })
  active!: boolean;

  createdAt?: Date;
  updatedAt?: Date;
}

export const ClientSchema = SchemaFactory.createForClass(Client);

/**
 * Supports the Clients tab search by `name` (legacy `searchSelectedContent(clients,
 * 'name', …)`). The legacy list filtered in the browser; a server-side filter needs an
 * index or it is a collection scan once the client count grows.
 */
ClientSchema.index({name: 1});

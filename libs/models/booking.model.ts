import {IBookedTime} from './booked-time.model';
import {ISelectedExtraOption} from './selected-extra-option.model';

/**
 * The runtime list and the type are the same declaration, so a DTO that
 * validates with `IsEnum(PAYMENTS)` cannot drift from `TPayment`. They had
 * already drifted once: the DTO and the type said `CARD`, while the data model
 * and the legacy application use `FREE`.
 */
const CLIENT_TYPES = ['INDIVIDUAL', 'COMPANY'] as const;
type TClientType = (typeof CLIENT_TYPES)[number];

const PAYMENTS = ['CASH', 'TRANSFER', 'FREE'] as const;
type TPayment = (typeof PAYMENTS)[number];

interface IPlace {
  place: string;
  city: string;
}

/**
 * The body of `POST /bookings` (`contracts/openapi.yaml` `BookingDto`).
 *
 * The request shape and the stored document are deliberately different: the server owns the
 * audit stamps (`createdBy`/`createdAt`/…), derives `extraOptions` and decides
 * `accepted`/`archive`. A caller that could set any of those would be able to attribute a
 * booking to someone else, approve its own request or claim add-ons it did not select. So the
 * request type omits them, and the server's `whitelist`/`forbidNonWhitelisted` rejects a body
 * that tries to supply one.
 *
 * `rodoAcknowledgement` is optional here and required by the service for an anonymous
 * submission (FR-011): the rule needs to know whether the caller is public, which the body
 * cannot say. `month` is the legacy month index (0–11) derived from the first slot; it is
 * carried because the reporting and the migration read it, not because the form decides it.
 */
interface IBookingRequest {
  type: TClientType;
  place: IPlace;
  size: string;
  clientId?: string;
  nick: string;
  personName: string;
  personCompany?: string;
  personEmail: string;
  personPhone: string;
  month: number;
  bookedTimes: IBookedTime[];
  rodoAcknowledgement?: boolean;
  comments?: string;
  paymentMethod: TPayment;
  discount?: string;
  selectedOptions?: ISelectedExtraOption[];
  /**
   * The bot-mitigation decoy (FR-049). The real form renders it off-screen and always sends
   * it empty; a script that fills every input sends a value, which the server refuses. Named
   * `website` to match `HONEYPOT_FIELD` on the server.
   */
  website?: string;
}

interface IBooking {
  _id: string;
  type: TClientType;
  place: IPlace;
  size: string;
  clientId?: string;
  /** Calendar label. */
  nick: string;
  personName: string;
  personCompany?: string;
  personEmail: string;
  personPhone: string;
  /** Legacy month index, 0–11. */
  month: number;
  bookedTimes: IBookedTime[];
  accepted: boolean;
  archive: boolean;
  /** Whether the submitter acknowledged the RODO clause (FR-011). Required for a public submission. */
  rodoAcknowledgement?: boolean;
  comments?: string;
  paymentMethod: TPayment;
  /** Percentage string such as `10%`. */
  discount?: string;
  /** Derived: true when `selectedOptions` is non-empty. */
  extraOptions: boolean;
  selectedOptions: ISelectedExtraOption[];
  /** Ids of the unaccepted bookings this one conflicts with (FR-015). Derived on read. */
  conflicts?: string[];
  createdBy?: string;
  createdAt?: Date;
  modifiedBy?: string;
  modifiedAt?: Date;
}

export {CLIENT_TYPES, TClientType, PAYMENTS, TPayment, IPlace, IBookingRequest, IBooking};

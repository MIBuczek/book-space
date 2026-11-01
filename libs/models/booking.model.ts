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
  comments?: string;
  paymentMethod: TPayment;
  /** Percentage string such as `10%`. */
  discount?: string;
  /** Derived: true when `selectedOptions` is non-empty. */
  extraOptions: boolean;
  selectedOptions: ISelectedExtraOption[];
  createdBy?: string;
  createdAt?: Date;
  modifiedBy?: string;
  modifiedAt?: Date;
}

export {CLIENT_TYPES, TClientType, PAYMENTS, TPayment, IPlace, IBooking};

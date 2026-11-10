/**
 * The shape of a legacy Firebase export, as the migration tool reads it.
 *
 * There is no way to reach the legacy Firebase project from this repository (its credentials
 * are the thing the rewrite removes), so the tool reads a *directory of JSON exports*, one
 * file per collection, produced by exporting the Firestore collections. Each record keeps the
 * legacy field names and carries an `_id` — the Firestore document id, a 20-character
 * auto-id.
 *
 * The one place the export is not a verbatim copy is time. The legacy application stored slot
 * times as **local wall-clock values**, not instants: `overwriteDate` concatenated a local date
 * and a time and parsed the result in the *viewer's browser zone*, while `day` was anchored at
 * `T00:01:00.000Z`. Neither is a true instant (research.md R4). The export therefore carries
 * those fields as the wall-clock strings the legacy UI displayed — `YYYY-MM-DDTHH:MM` — which is
 * exactly the input `instantFromLegacyLocal` (`@booking/date-time`) is defined to reinterpret.
 * Reading the stored ISO instant instead would move every slot by one or two hours, and by a
 * different amount either side of a DST transition (T055).
 *
 * Audit stamps (`createdAt`/`modifiedAt`) *are* real instants: the legacy write path produced
 * them with `new Date().toISOString()`, so they are parsed with `new Date(...)`, not
 * reinterpreted as wall clocks.
 */

/** A legacy slot time, as `bookingTime[]` carried it. All three are local wall-clock strings. */
interface ILegacyBookingTime {
  /** `YYYY-MM-DDTHH:MM`; the time component is the legacy `T00:01` anchor and is discarded. */
  day: string;
  /** `YYYY-MM-DDTHH:MM` facility-local. */
  startHour: string;
  /** `YYYY-MM-DDTHH:MM` facility-local. */
  endHour: string;
  comments?: string;
  /** The legacy UI collected this as a string, so it arrives as `'12'`, `''` or absent. */
  participants?: string | number;
  /** `INITIAL` | `DONE` | `QUIT`. */
  status?: string;
}

interface ILegacySelectedOption {
  options: Array<{lights?: true; toilets?: true}>;
  /** `YYYY-MM-DDTHH:MM` facility-local. */
  fromHour: string;
  /** `YYYY-MM-DDTHH:MM` facility-local. */
  toHour: string;
}

/** A legacy `bookings` document (`models/store/booking-models.ts`). */
interface ILegacyBooking {
  _id: string;
  /** `'Indywidualny'` | `'Firma'`. */
  type?: string;
  city?: string;
  /** The facility `property` key, e.g. `hala-sportowa`. */
  building?: string;
  size?: string;
  clientId?: string;
  nick?: string;
  person?: string;
  club?: string;
  email?: string;
  phone?: string;
  month?: number;
  bookingTime?: ILegacyBookingTime[];
  accepted?: boolean;
  archive?: boolean;
  message?: string;
  extraOptions?: boolean;
  selectedOptions?: ILegacySelectedOption[];
  /** `transfer` | `cash` | `free` | `invoice`. */
  payment?: string;
  discount?: string;
  createdBy?: string;
  createdAt?: string;
  modifiedBy?: string;
  modifiedAt?: string;
}

/** A legacy `clients` document (`models/store/client-models.ts`). */
interface ILegacyClient {
  _id: string;
  type?: string;
  nick?: string;
  name?: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  street?: string;
  city?: string;
  zipCode?: string;
  nip?: string;
}

/** A legacy `buildings` document (`models/store/building-models.ts`). */
interface ILegacyBuilding {
  _id: string;
  name?: string;
  city?: string;
  property?: string;
  /** The rentable sizes; renamed to `sizes` in the target. */
  size?: string[];
  extra?: {lighting?: boolean; toilets?: boolean};
  phone?: string;
  email?: string;
  employees?: string[];
}

/** A legacy `users` document (`models/store/user-models.ts`). */
interface ILegacyUser {
  _id: string;
  email?: string;
  /** A single display name; the target requires `firstName` + `lastName`. */
  name?: string;
  isAdmin?: boolean;
  isEmployee?: boolean;
  isOffice?: boolean;
  city?: string;
  /** Assigned facility property keys; renamed to `buildings` in the target. */
  building?: string[];
  /**
   * A plaintext password, when the export happens to carry one. The legacy application kept
   * credentials in Firebase Auth, which cannot be exported, so this is usually absent and the
   * tool generates an unknowable password (see `transforms.ts`).
   */
  password?: string;
}

/** The four collections the migration reads, and the file each is read from. */
const COLLECTIONS = ['bookings', 'clients', 'buildings', 'users'] as const;
type TCollection = (typeof COLLECTIONS)[number];

interface ILegacyExport {
  bookings: ILegacyBooking[];
  clients: ILegacyClient[];
  buildings: ILegacyBuilding[];
  users: ILegacyUser[];
}

export {COLLECTIONS};
export type {
  TCollection,
  ILegacyBookingTime,
  ILegacySelectedOption,
  ILegacyBooking,
  ILegacyClient,
  ILegacyBuilding,
  ILegacyUser,
  ILegacyExport,
};

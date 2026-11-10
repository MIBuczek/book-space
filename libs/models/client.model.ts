import {TClientType} from './booking.model';

interface IClient {
  _id: string;
  type: TClientType;
  name: string;
  /** Optional display label carried over from the legacy data. */
  nick?: string;
  contactPerson: string;
  phone: string;
  email: string;
  street: string;
  city: string;
  zipCode: string;
  /** Required when `type` is `COMPANY`; enforced in the DTO. */
  nip?: string;
  /**
   * Whether the client is still in use (T059, FR-024). A hard delete is refused with
   * `409` while a booking references the client, so retiring one is a deactivation
   * (`PUT /clients/{_id} {active: false}`) that keeps the record for the bookings and
   * reports that point at it. Absent on a legacy document, which reads as active.
   */
  active?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * The client create/update payload (FR-025).
 *
 * Deliberately not `IClient`: the stored document carries the server-owned audit
 * timestamps and the `_id`, and the request body does not. `nick` and `nip` are optional
 * here because a request omits them rather than sending an empty value; the server
 * refuses a `nip` on an individual and requires one on a company.
 */
interface IClientRequest {
  type: TClientType;
  name: string;
  nick?: string;
  contactPerson: string;
  phone: string;
  email: string;
  street: string;
  city: string;
  zipCode: string;
  nip?: string;
  /** Deactivates (`false`) or reactivates (`true`) a client (T059). */
  active?: boolean;
}

export {IClient, IClientRequest};

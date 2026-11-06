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
}

export {IClient, IClientRequest};

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

export {IClient};

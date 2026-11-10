import {HttpException, HttpStatus, Injectable, NotFoundException} from '@nestjs/common';
import {InjectModel} from '@nestjs/mongoose';
import {Model} from 'mongoose';
import {Client, TClient} from '../schemas/client.schema';
import {Booking} from '../../bookings/schemas/booking.schema';
import {ClientDto, UpdateClientDto} from '../models/client.dto';
import {ClientQueryDto} from '../models/client-query.dto';
import {isNipValid} from '../models/client-nip.validator';
import {buildClientQuery, resolveClientListRequest} from '../list/client-list';
import {errorMessage, errorStatus} from '../../utility/http-error';

/** The fields a caller may change. `createdAt`/`updatedAt` are server-owned. */
const UPDATABLE_FIELDS = [
  'type',
  'name',
  'nick',
  'contactPerson',
  'phone',
  'email',
  'street',
  'city',
  'zipCode',
  'nip',
  'active'
] as const;

/**
 * The message a refused client delete carries (T059, FR-024).
 *
 * A client referenced by a booking is not deleted: the legacy `deleteClient` removed the
 * document and left every booking's `clientId` dangling, and because the summary is built
 * from `clientId` those bookings then vanished from reports. Deactivation
 * (`PUT /clients/{_id} {active: false}`) is the supported way to retire a client.
 */
const CLIENT_IN_USE_MESSAGE =
  'This client is referenced by a booking and cannot be deleted. Deactivate it instead (active: false).';

@Injectable()
export class ClientService {
  constructor(
    @InjectModel('Client') private clientModel: Model<Client>,
    @InjectModel('Booking') private bookingModel: Model<Booking>
  ) {}

  async createClient(client: ClientDto) {
    try {
      return await this.clientModel.create(client);
    } catch (e) {
      throw new HttpException(errorMessage(e), errorStatus(e));
    }
  }

  /**
   * Updates a client.
   *
   * The NIP rule is re-checked here on the *merged* record, not in `UpdateClientDto`. A
   * partial body may carry `nip` without `type`, or `type` without `nip`, so a DTO
   * constraint cannot see both halves — and `updateOne` does not run the schema
   * validator. Merging is the only point where the resulting record is visible, so it is
   * the only place that can refuse a company left without a tax id (or an individual
   * given one).
   *
   * The update is built from an allow-list rather than spread from the body: a spread
   * would let an unexpected key reach the driver, and `forbidNonWhitelisted` only guards
   * the DTO, not this call.
   */
  async updateClient(_id: string, client: UpdateClientDto) {
    let current: TClient | null;
    try {
      current = await this.clientModel.findOne({_id});
    } catch (e) {
      throw new HttpException(errorMessage(e), errorStatus(e));
    }
    if (!current) {
      throw new NotFoundException('Client not found');
    }

    const merged = {...current.toObject(), ...client};
    if (!isNipValid(merged.type, merged.nip)) {
      throw new HttpException(
        merged.type === 'COMPANY'
          ? 'NIP is required for a company (10–15 characters, digits, dots, slashes and dashes).'
          : 'NIP does not apply to an individual client.',
        HttpStatus.UNPROCESSABLE_ENTITY
      );
    }

    const update: Record<string, unknown> = {};
    for (const field of UPDATABLE_FIELDS) {
      if (client[field] !== undefined) {
        update[field] = client[field];
      }
    }

    try {
      return await this.clientModel.updateOne({_id}, update);
    } catch (e) {
      throw new HttpException(errorMessage(e), errorStatus(e));
    }
  }

  /**
   * Deletes a client, refusing when a booking still references it (T059, FR-024).
   *
   * The rule is restrict, not cascade: a booking is a historical record and a client is a
   * party to it, so removing the client would orphan the booking and — because the summary
   * is built from `clientId` — silently drop it from every report. A `409` names the
   * situation and points at the supported alternative, deactivation. The reference test is
   * one `countDocuments` on `clientId`, which the `{clientId: 1, accepted: 1}` index
   * already serves.
   */
  async deleteClient(_id: string) {
    try {
      const references = await this.bookingModel.countDocuments({clientId: _id});
      if (references > 0) {
        throw new HttpException(CLIENT_IN_USE_MESSAGE, HttpStatus.CONFLICT);
      }
      return await this.clientModel.deleteOne({_id});
    } catch (e) {
      if (e instanceof HttpException) {
        throw e;
      }
      throw new HttpException(errorMessage(e), errorStatus(e));
    }
  }

  async findClient(_id: string) {
    try {
      return await this.clientModel.findOne({_id});
    } catch (e) {
      throw new HttpException(errorMessage(e), errorStatus(e));
    }
  }

  /**
   * Lists clients, paged and searchable (FR-022, FR-024, FR-043).
   *
   * The read used to return the whole collection; the search and the page are resolved by
   * `resolveClientListRequest` and the query built by `buildClientQuery`, both pure, so the
   * service stays a thin wrapper. `total` is a `countDocuments` on the same filter, so it is
   * the pre-pagination count and a client can page without a second request — the same
   * envelope `GET /bookings` answers. The sort is `{name: 1, _id: 1}`: `name` is the column
   * the list shows and the index the search uses, and `_id` breaks a tie so two clients with
   * the same name do not swap between pages.
   */
  async findAllClients(query: ClientQueryDto = {}) {
    const {filter, pagination} = resolveClientListRequest(query);
    const criteria = buildClientQuery(filter);
    try {
      const [items, total] = await Promise.all([
        this.clientModel.find(criteria, null, {
          sort: {name: 1, _id: 1},
          skip: pagination.skip,
          limit: pagination.limit,
          lean: true
        }),
        this.clientModel.countDocuments(criteria)
      ]);
      return {items, total, page: pagination.page, limit: pagination.limit};
    } catch (e) {
      throw new HttpException(errorMessage(e), errorStatus(e));
    }
  }
}

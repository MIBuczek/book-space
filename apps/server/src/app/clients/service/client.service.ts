import {HttpException, HttpStatus, Injectable, NotFoundException} from '@nestjs/common';
import {InjectModel} from '@nestjs/mongoose';
import {Model} from 'mongoose';
import {Client, TClient} from '../schemas/client.schema';
import {ClientDto, UpdateClientDto} from '../models/client.dto';
import {isNipValid} from '../models/client-nip.validator';
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
  'nip'
] as const;

@Injectable()
export class ClientService {
  constructor(@InjectModel('Client') private clientModel: Model<Client>) {}

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

  async deleteClient(_id: string) {
    try {
      return await this.clientModel.deleteOne({_id});
    } catch (e) {
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

  async findAllClients() {
    try {
      return await this.clientModel.find({});
    } catch (e) {
      throw new HttpException(errorMessage(e), errorStatus(e));
    }
  }
}

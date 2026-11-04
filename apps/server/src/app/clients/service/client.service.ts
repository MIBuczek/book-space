import {HttpException, HttpStatus, Injectable} from '@nestjs/common';
import {InjectModel} from '@nestjs/mongoose';
import {Model} from 'mongoose';
import {Client} from '../schemas/client.schema';
import {ClientDto, UpdateClientDto} from '../models/client.dto';
import {errorMessage, errorStatus} from '../../utility/http-error';

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
   * `updateOne` bypasses document middleware, so the `pre('validate')` NIP hook does not
   * run here (T008). Two things follow: the update time is stamped explicitly, and the
   * NIP rule is re-checked against the *stored* type when the update changes `nip` —
   * `forbidNonWhitelisted` cannot help, because `nip` is a declared field.
   */
  async updateClient(_id: string, client: UpdateClientDto) {
    try {
      if (client.nip !== undefined) {
        const stored = await this.clientModel.findOne({_id});
        const type = client.type ?? stored?.type;
        if (type === 'INDIVIDUAL') {
          throw new HttpException('NIP must not be set for an individual', HttpStatus.UNPROCESSABLE_ENTITY);
        }
        if (type === 'COMPANY' && client.nip === '') {
          throw new HttpException('NIP is required for a company', HttpStatus.UNPROCESSABLE_ENTITY);
        }
      }
      return await this.clientModel.updateOne({_id}, {...client, updatedAt: new Date()});
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

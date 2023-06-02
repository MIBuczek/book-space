import {HttpException, Injectable} from '@nestjs/common';
import {InjectModel} from '@nestjs/mongoose';
import {Model} from 'mongoose';
import {Client} from '../schemas/client.schema';

@Injectable()
export class ClientService {
  constructor(@InjectModel('Client') private clientModel: Model<Client>) {}

  async createClient(client: Client) {
    try {
      return await this.clientModel.create(client);
    } catch (e) {
      throw new HttpException(e.message, e.status);
    }
  }

  async updateClient(_id: string, client: Partial<Client>) {
    try {
      return await this.clientModel.updateOne({_id}, client);
    } catch (e) {
      throw new HttpException(e.message, e.status);
    }
  }

  async deleteClient(_id: string) {
    try {
      return await this.clientModel.deleteOne({_id});
    } catch (e) {
      throw new HttpException(e.message, e.status);
    }
  }

  async findClient(_id: string) {
    try {
      return await this.clientModel.findOne({_id});
    } catch (e) {
      throw new HttpException(e.message, e.status);
    }
  }

  async findAllClients() {
    try {
      return await this.clientModel.find({});
    } catch (e) {
      throw new HttpException(e.message, e.status);
    }
  }
}

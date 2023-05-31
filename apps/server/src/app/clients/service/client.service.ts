import {Injectable} from '@nestjs/common';
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
      return new Error(e.message);
    }
  }

  async updateClient(_id: string, client: Partial<Client>) {
    try {
      return await this.clientModel.updateOne({_id}, client);
    } catch (e) {
      return new Error(e.message);
    }
  }

  async deleteClient(_id: string) {
    try {
      return await this.clientModel.deleteOne({_id});
    } catch (e) {
      return new Error(e.message);
    }
  }

  async findClient(_id: string) {
    try {
      return await this.clientModel.findOne({_id});
    } catch (e) {
      return new Error(e.message);
    }
  }

  async findAllClients() {
    try {
      return await this.clientModel.find({});
    } catch (e) {
      return new Error(e.message);
    }
  }
}

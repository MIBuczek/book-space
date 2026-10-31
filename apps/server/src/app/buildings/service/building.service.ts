import {HttpException, Injectable} from '@nestjs/common';
import {InjectModel} from '@nestjs/mongoose';
import {Model} from 'mongoose';
import {Building} from '../schemas/building.schema';
import {errorMessage, errorStatus} from '../../utility/http-error';

@Injectable()
export class BuildingService {
  constructor(@InjectModel('Building') private buildingModel: Model<Building>) {}

  async createBuilding(building: Building) {
    try {
      return await this.buildingModel.create(building);
    } catch (e) {
      throw new HttpException(errorMessage(e), errorStatus(e));
    }
  }

  async updateBuilding(_id: string, building: Partial<Building>) {
    try {
      return await this.buildingModel.updateOne({_id}, building);
    } catch (e) {
      throw new HttpException(errorMessage(e), errorStatus(e));
    }
  }

  async deleteBuilding(_id: string) {
    try {
      return await this.buildingModel.deleteOne({_id});
    } catch (e) {
      throw new HttpException(errorMessage(e), errorStatus(e));
    }
  }

  async findBuilding(_id: string) {
    try {
      return await this.buildingModel.findOne({_id});
    } catch (e) {
      throw new HttpException(errorMessage(e), errorStatus(e));
    }
  }

  async findAllBuildings() {
    try {
      return await this.buildingModel.find({});
    } catch (e) {
      throw new HttpException(errorMessage(e), errorStatus(e));
    }
  }
}

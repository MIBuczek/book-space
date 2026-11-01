import {HttpException, Injectable} from '@nestjs/common';
import {handleAuthErrors} from '../../utility/validation-error.fun';
import {User} from '../schemas/user.schema';
import {InjectModel} from '@nestjs/mongoose';
import {Model} from 'mongoose';
import {UserDto} from '../models/user.dto';
import {errorMessage, errorStatus} from '../../utility/http-error';

@Injectable()
export class UserService {
  constructor(@InjectModel('User') private userModel: Model<User>) {}

  async createUser(user: UserDto) {
    try {
      return await this.userModel.create(user);
    } catch (e) {
      throw new HttpException(handleAuthErrors(e), errorStatus(e));
    }
  }

  async findUser(_id: string) {
    try {
      return this.userModel.findOne({_id});
    } catch (e) {
      throw new HttpException(errorMessage(e), errorStatus(e));
    }
  }

  async updateUser(_id: string, user: Partial<UserDto>) {
    try {
      return await this.userModel.updateOne({_id}, user);
    } catch (e) {
      throw new HttpException(errorMessage(e), errorStatus(e));
    }
  }

  deleteUser(_id: string) {
    try {
      return this.userModel.deleteOne({_id});
    } catch (e) {
      throw new HttpException(errorMessage(e), errorStatus(e));
    }
  }

  async findAllUser(): Promise<User[]> {
    try {
      return this.userModel.find({});
    } catch (e) {
      throw new HttpException(errorMessage(e), errorStatus(e));
    }
  }
}

import {HttpException, Injectable} from '@nestjs/common';
import {handleAuthErrors} from '@server/utils/validation-error.fun';
import {User} from '@server/users/schemas/user.schema';
import {InjectModel} from '@nestjs/mongoose';
import {Model} from 'mongoose';
import {UserDto} from '@server/users/models/user.dto';

@Injectable()
export class UserService {
  constructor(@InjectModel('User') private userModel: Model<User>) {}

  async createUser(user: UserDto) {
    try {
      return await this.userModel.create(user);
    } catch (e) {
      throw new HttpException(handleAuthErrors(e), e.status);
    }
  }

  async findUser(_id: string) {
    try {
      return this.userModel.findOne({_id});
    } catch (e) {
      throw new HttpException(e.message, e.status);
    }
  }

  async updateUser(_id: string, user: Partial<UserDto>) {
    try {
      return await this.userModel.updateOne({_id}, user);
    } catch (e) {
      throw new HttpException(e.message, e.status);
    }
  }

  deleteUser(_id: string) {
    try {
      return this.userModel.deleteOne({_id});
    } catch (e) {
      throw new HttpException(e.message, e.status);
    }
  }

  async findAllUser(): Promise<User[]> {
    try {
      return this.userModel.find({});
    } catch (e) {
      throw new HttpException(e.message, e.status);
    }
  }
}

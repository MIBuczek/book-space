import {Injectable} from '@nestjs/common';
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
      return handleAuthErrors(e);
    }
  }

  async findUser(_id: string) {
    try {
      return this.userModel.findOne({_id});
    } catch (e) {
      return new Error(e.message);
    }
  }

  async updateUser(_id: string, user: Partial<UserDto>) {
    try {
      return await this.userModel.updateOne({_id}, user);
    } catch (e) {
      return new Error(e.message);
    }
  }

  deleteUser(_id: string) {
    try {
      return this.userModel.deleteOne({_id});
    } catch (e) {
      return new Error(e.message);
    }
  }

  async findAllUser(): Promise<User[]> {
    return this.userModel.find({});
  }
}

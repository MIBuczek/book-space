import {HttpException, HttpStatus, Injectable} from '@nestjs/common';
import {handleAuthErrors} from '../../utility/validation-error.fun';
import {User} from '../schemas/user.schema';
import {InjectModel} from '@nestjs/mongoose';
import {Model} from 'mongoose';
import {UserDto} from '../models/user.dto';
import {errorMessage, errorStatus} from '../../utility/http-error';
import {serializeUser, serializeUsers} from '../models/user.serializer';
import bcrypt from 'bcrypt';

/** The fields a caller may change. `password` is hashed separately; `recheckPassword` is never stored. */
const UPDATABLE_FIELDS = ['firstName', 'lastName', 'email', 'role', 'city', 'buildings', 'active'] as const;

@Injectable()
export class UserService {
  constructor(@InjectModel('User') private userModel: Model<User>) {}

  async createUser(user: UserDto) {
    try {
      const created = await this.userModel.create(user);
      return serializeUser(created);
    } catch (e) {
      throw new HttpException(handleAuthErrors(e), errorStatus(e));
    }
  }

  async findUser(_id: string) {
    try {
      const user = await this.userModel.findOne({_id});
      return serializeUser(user);
    } catch (e) {
      throw new HttpException(errorMessage(e), errorStatus(e));
    }
  }

  /**
   * Updates a user.
   *
   * `updateOne` does not run the `pre('save')` hook, so a password passed through it
   * was stored in plaintext (CHK017). The hash is produced here with the same
   * `bcrypt` call the hook makes, before the update reaches the driver.
   *
   * The update is built from an allow-list rather than spread from the body: the
   * parameter is typed `Partial<UserDto>`, but a type is erased at runtime, so a
   * spread would let an unexpected key reach the driver.
   */
  async updateUser(_id: string, user: Partial<UserDto>) {
    const {password, recheckPassword, ...rest} = user;

    if (password !== undefined && password !== recheckPassword) {
      throw new HttpException(handleAuthErrors(new Error('Incorrect recheck_password')), HttpStatus.UNPROCESSABLE_ENTITY);
    }

    try {
      const update: Record<string, unknown> = {};
      for (const field of UPDATABLE_FIELDS) {
        if (rest[field] !== undefined) {
          update[field] = rest[field];
        }
      }

      if (password !== undefined) {
        update.password = await bcrypt.hash(password, await bcrypt.genSalt());
      }

      return await this.userModel.updateOne({_id}, update);
    } catch (e) {
      throw new HttpException(handleAuthErrors(e), errorStatus(e));
    }
  }

  async deleteUser(_id: string) {
    try {
      return await this.userModel.deleteOne({_id});
    } catch (e) {
      throw new HttpException(errorMessage(e), errorStatus(e));
    }
  }

  async findAllUser() {
    try {
      const users = await this.userModel.find({});
      return serializeUsers(users);
    } catch (e) {
      throw new HttpException(errorMessage(e), errorStatus(e));
    }
  }
}

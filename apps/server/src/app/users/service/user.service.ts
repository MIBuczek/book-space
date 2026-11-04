import {HttpException, HttpStatus, Injectable} from '@nestjs/common';
import {handleUserWriteError} from '../../utility/user-write-error.fun';
import {User} from '../schemas/user.schema';
import {InjectModel} from '@nestjs/mongoose';
import {Model} from 'mongoose';
import {UserDto} from '../models/user.dto';
import {errorMessage, errorStatus} from '../../utility/http-error';
import {serializeUser, serializeUsers} from '../models/user.serializer';
import bcrypt from 'bcrypt';

/** The fields a caller may change. `password` is hashed separately; `recheckPassword` is never stored. */
const UPDATABLE_FIELDS = ['firstName', 'lastName', 'email', 'role', 'city', 'buildings', 'active'] as const;

/** The message the last-administrator rule answers with (T015). */
const LAST_ADMIN_MESSAGE = 'The last active administrator cannot be removed';

@Injectable()
export class UserService {
  constructor(@InjectModel('User') private userModel: Model<User>) {}

  async createUser(user: UserDto) {
    try {
      const created = await this.userModel.create(user);
      return serializeUser(created);
    } catch (e) {
      throw new HttpException(handleUserWriteError(e), errorStatus(e));
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
   *
   * A change that would remove the last active administrator — a demotion or a
   * deactivation — is refused (T015, acceptance criterion 3). An ordinary edit to the
   * same account, such as a rename, is allowed.
   */
  async updateUser(_id: string, user: Partial<UserDto>) {
    const {password, recheckPassword, ...rest} = user;

    if (password !== undefined && password !== recheckPassword) {
      throw new HttpException(handleUserWriteError(new Error('Incorrect recheck_password')), HttpStatus.UNPROCESSABLE_ENTITY);
    }

    const update: Record<string, unknown> = {};
    for (const field of UPDATABLE_FIELDS) {
      if (rest[field] !== undefined) {
        update[field] = rest[field];
      }
    }

    try {
      if (await this.removesLastAdministrator(_id, update)) {
        throw new HttpException(LAST_ADMIN_MESSAGE, HttpStatus.CONFLICT);
      }

      if (password !== undefined) {
        update.password = await bcrypt.hash(password, await bcrypt.genSalt());
      }

      return await this.userModel.updateOne({_id}, update);
    } catch (e) {
      if (e instanceof HttpException) {
        throw e;
      }
      throw new HttpException(handleUserWriteError(e), errorStatus(e));
    }
  }

  async deleteUser(_id: string) {
    try {
      if (await this.removesLastAdministrator(_id, {active: false})) {
        throw new HttpException(LAST_ADMIN_MESSAGE, HttpStatus.CONFLICT);
      }

      return await this.userModel.deleteOne({_id});
    } catch (e) {
      if (e instanceof HttpException) {
        throw e;
      }
      throw new HttpException(errorMessage(e), errorStatus(e));
    }
  }

  /**
   * True when `_id` is the only active administrator and `changes` would take it out of
   * that state — by deactivating it or by moving it off the `ADMIN` role (T015).
   *
   * The current role is read from the stored document rather than from the request: a
   * caller-supplied role would let the rule be skipped by claiming the target is not an
   * administrator. The count excludes the target itself, so "another active
   * administrator remains" is one query and cannot be fooled by a concurrent count.
   */
  private async removesLastAdministrator(_id: string, changes: Record<string, unknown>): Promise<boolean> {
    const removingRole = changes.role !== undefined && changes.role !== 'ADMIN';
    const deactivating = changes.active === false;
    if (!removingRole && !deactivating) {
      return false;
    }

    const target = await this.userModel.findOne({_id});
    if (!target || target.role !== 'ADMIN' || target.active === false) {
      return false;
    }

    const remaining = await this.userModel.countDocuments({role: 'ADMIN', active: true, _id: {$ne: _id}});
    return remaining === 0;
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

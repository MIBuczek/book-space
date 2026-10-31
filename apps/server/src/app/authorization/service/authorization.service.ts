import {HttpException, HttpStatus, Injectable} from '@nestjs/common';
import bcrypt from 'bcrypt';
import {LoginUserDto} from '../models/login-user-dto';
import {User} from '../../users/schemas/user.schema';
import {InjectModel} from '@nestjs/mongoose';
import {Model} from 'mongoose';
import {handleAuthErrors} from '../../utility/validation-error.fun';
import {JwtPayload} from '@models/jwt-payload.model';
import {errorMessage, errorStatus} from '../../utility/http-error';

@Injectable()
export class AuthorizationService {
  constructor(@InjectModel('User') private userModel: Model<User>) {}

  /**
   *
   * @param loginUserDto
   */
  async signIn(loginUserDto: LoginUserDto): Promise<User> {
    try {
      const {email, password} = loginUserDto;

      const currentUser = await this.userModel.findOne({email});

      if (!currentUser) {
        throw new HttpException('Incorrect email', HttpStatus.UNAUTHORIZED);
      }

      const pass_auth = await bcrypt.compare(password, currentUser.password);

      if (!pass_auth) {
        throw new HttpException('Incorrect password', HttpStatus.UNAUTHORIZED);
      }

      currentUser.lastLogin = new Date();

      await this.userModel.updateOne({_id: currentUser._id}, {lastLogin: currentUser.lastLogin});

      return currentUser;
    } catch (e) {
      throw new HttpException(handleAuthErrors(e), HttpStatus.UNAUTHORIZED);
    }
  }

  /**
   * Validate user by given JWT token.
   *
   * @param {JwtPayload} payload
   */
  async validateUser(payload: JwtPayload) {
    try {
      const {_id, email} = payload;
      const user = await this.userModel.findOne({_id});
      if (user.email !== email) {
        throw new HttpException('Invalid token', HttpStatus.UNAUTHORIZED);
      }
      return user;
    } catch (e) {
      throw new HttpException(errorMessage(e), errorStatus(e));
    }
  }
}

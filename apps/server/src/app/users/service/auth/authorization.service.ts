import { Injectable } from '@nestjs/common';
import bcrypt from 'bcrypt';
import { LoginUserDto } from '../../models/login-user-dto';
import { User } from '../../schemas/user.schema';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { IValidationError } from '@models/validation-error.model';
import { handleAuthErrors } from '@server/utils/validation-error.fun';
import { ValidationError } from 'class-validator';

@Injectable()
export class AuthorizationService {
  constructor(@InjectModel('User') private userModel: Model<User>) {}

  /**
   *
   * @param loginUserDto
   */
  async signIn(loginUserDto: LoginUserDto): Promise<User | ValidationError> {
    try {
      const { email, password } = loginUserDto;

      let currentUser = await this.userModel.findOne({ email });

      if (!currentUser) {
        throw new Error('Incorrect email');
      }

      const pass_auth = await bcrypt.compare(password, currentUser.password);

      if (!pass_auth) {
        throw new Error('Incorrect password');
      }

      currentUser.lastLogin = new Date()

      await this.userModel.updateOne(
        { _id: currentUser._id },
        { lastLogin : currentUser.lastLogin}
      );

      return currentUser;
    } catch (e) {
      return handleAuthErrors(e);
    }
  }

  async validateUser(cred : any){

  }
}

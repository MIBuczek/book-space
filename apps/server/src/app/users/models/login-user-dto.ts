import { MinLength, IsEmail } from 'class-validator';
import { User } from '../schemas/user.schema';

export class LoginUserDto implements Pick<User, 'email' | 'password'> {
  @MinLength(3)
  @IsEmail()
  email: string;

  @MinLength(6)
  password: string;
}

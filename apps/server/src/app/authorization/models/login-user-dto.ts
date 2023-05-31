import {MinLength, IsEmail} from 'class-validator';
import {User} from '@server/users/schemas/user.schema';
import * as Validator from 'class-validator';

export class LoginUserDto implements Pick<User, 'email' | 'password'> {
  @Validator.IsEmail(undefined, {
    message: 'E-mail address need to contains correct pattern.'
  })
  @Validator.Length(3, 125, {
    message: 'Number of characters need to be between 3 and 125.'
  })
  email: string;

  @Validator.MinLength(6, {
    message: 'Minimal number of characters is 6.'
  })
  @Validator.MaxLength(30, {
    message: 'Maximal number of characters is 30.'
  })
  password: string;
}

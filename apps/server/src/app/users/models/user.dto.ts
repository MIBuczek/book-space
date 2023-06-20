import {User} from '../schemas/user.schema';
import * as Validator from 'class-validator';

export class UserDto implements Pick<User, 'firstName' | 'lastName' | 'password' | 'email'> {
  @Validator.MinLength(3, {
    message: 'Minimal number of characters is 3.'
  })
  @Validator.MaxLength(125, {
    message: 'Maximal number of characters is 125.'
  })
  firstName: string;

  @Validator.MinLength(3, {
    message: 'Minimal number of characters is 3.'
  })
  @Validator.MaxLength(125, {
    message: 'Maximal number of characters is 125.'
  })
  lastName: string;

  @Validator.MinLength(6, {
    message: 'Minimal number of characters is 6.'
  })
  @Validator.MaxLength(30, {
    message: 'Maximal number of characters is 30.'
  })
  password: string;

  @Validator.MinLength(6, {
    message: 'Minimal number of characters is 6.'
  })
  @Validator.MaxLength(30, {
    message: 'Maximal number of characters is 30.'
  })
  recheckPassword: string;

  @Validator.IsEmail(undefined, {
    message: 'E-mail address need to contains correct pattern.'
  })
  @Validator.Length(3, 125, {
    message: 'Number of characters need to be between 3 and 125.'
  })
  email: string;
}

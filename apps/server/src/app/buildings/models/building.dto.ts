import {Building} from '../schemas/building.schema';
import {TUser} from '@server/users/schemas/user.schema';
import * as Validator from 'class-validator';

export class BuildingDto implements Building {
  @Validator.Length(3, 125, {
    message: 'Number of characters need to be between 3 and 125'
  })
  name: string;

  @Validator.IsEmail(undefined, {
    message: 'E-mail address need to contains correct pattern'
  })
  @Validator.Length(3, 125, {
    message: 'Number of characters need to be between 3 and 125'
  })
  email: string;

  @Validator.Length(3, 15, {
    message: 'Number of characters need to be between 3 and 15'
  })
  phone: string;

  @Validator.ArrayMinSize(1, {
    message: 'At least one employee need to be added'
  })
  employees: Array<TUser>;

  @Validator.Length(3, 125, {
    message: 'Number of characters need to be between 3 and 125'
  })
  city: string;

  @Validator.Length(3, 125, {
    message: 'Number of characters need to be between 3 and 125'
  })
  street: string;

  @Validator.Length(6, 6, {
    message: 'Number of characters need to be exactly 6'
  })
  zipCode: string;
}

import { User } from "../schemas/user.schema";
import * as Validator from 'class-validator';

export class UserDto implements Pick<User , 'firstName'| 'lastName' | 'password' | 'email'>{
    @Validator.MinLength(3)
    @Validator.MaxLength(3)
    firstName: string;

    @Validator.MinLength(3)
    @Validator.MaxLength(3)
    lastName: string;

    @Validator.MinLength(6)
    @Validator.MaxLength(30)
    password: string;

    @Validator.MinLength(6)
    @Validator.MaxLength(30)
    recheckPassword : string;

    @Validator.MinLength(3)
    @Validator.IsEmail()
    email: string;    
}
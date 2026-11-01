import {TUserRole} from './user.model';

interface JwtPayload {
  email: string;
  _id: string;
  role: TUserRole;
  iat?: number;
  exp?: number;
}

export {JwtPayload};

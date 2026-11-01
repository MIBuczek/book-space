const USER_ROLES = ['ADMIN', 'OFFICE', 'EMPLOYEE'] as const;
type TUserRole = (typeof USER_ROLES)[number];

interface IUser {
  _id: string;
  email: string;
  /** bcrypt hash. Never returned by the API. */
  password?: string;
  firstName: string;
  lastName: string;
  role: TUserRole;
  /** Required unless the role is `ADMIN`. */
  city?: string;
  /** Assigned facility property keys. */
  buildings?: string[];
  active: boolean;
  createdAt?: Date;
  lastLogin?: Date;
}

export {USER_ROLES, TUserRole, IUser};

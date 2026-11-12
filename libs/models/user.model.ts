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

/**
 * What the signed-in account may do, resolved by the API (FR-004, SC-001).
 *
 * The client drives its navigation and its action buttons from this rather than from the
 * role, so a server-side rule reaches the UI without being duplicated there, and a rule the
 * server changes cannot leave the menu advertising a tab the API will refuse. It is a
 * presentation aid only: every one of these is also enforced on the endpoint it names (FR-003),
 * so a client that ignores this object gains nothing but a `403`.
 *
 * The tab flags follow the legacy navigation (`SideNav.tsx`), which is why
 * `canSeeFacilitiesTab` is office/administrator even though an employee may read the
 * facilities endpoint for the booking form (authorization matrix). The tab gate is the
 * stricter of the two on purpose.
 */
interface IUserCapabilities {
  /** Any authenticated role: the Calendar and Bookings tabs. */
  staff: boolean;
  /** Office or administrator: the Clients tab. */
  canSeeClientsTab: boolean;
  /** Office or administrator: the Facilities tab (legacy `adminSeeContentCredentials`). */
  canSeeFacilitiesTab: boolean;
  /** Office or administrator. */
  canSeeSummaryTab: boolean;
  canApproveBookings: boolean;
  canArchiveBookings: boolean;
  /** The "show bookings awaiting approval" filter. */
  canFilterUnapproved: boolean;
  canSeeConflicts: boolean;
  canManageUsers: boolean;
  canWriteClients: boolean;
  canWriteFacilities: boolean;
  /** Send a message to a facility employee (`Building.tsx`). */
  canSendFacilityMessages: boolean;
}

/**
 * The user as the client receives it: the stored fields plus the capabilities the API
 * resolved for this request. `capabilities` is deliberately not on `IUser`, which is the
 * stored shape — it is computed per request, never persisted.
 */
interface IAuthenticatedUser extends IUser {
  capabilities: IUserCapabilities;
}

/**
 * The body for creating a staff account, mirroring the server's `UserDto` (FR-045).
 *
 * `recheckPassword` is part of the request and is never stored, which is why it is not on
 * `IUser`: the request body and the stored document are deliberately different shapes.
 */
interface IUserRequest {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  recheckPassword: string;
  role: TUserRole;
  city?: string;
  buildings?: string[];
  active?: boolean;
}

/**
 * The body for updating a staff account, mirroring the server's `UpdateUserDto`.
 *
 * Every field is optional: a `PUT` carries only what changed. A blank `password` is omitted by
 * the caller rather than sent empty, so the server leaves the stored hash alone.
 */
interface IUserUpdateRequest {
  firstName?: string;
  lastName?: string;
  email?: string;
  password?: string;
  recheckPassword?: string;
  role?: TUserRole;
  city?: string;
  buildings?: string[];
  active?: boolean;
}

export {
  USER_ROLES,
  TUserRole,
  IUser,
  IUserCapabilities,
  IAuthenticatedUser,
  IUserRequest,
  IUserUpdateRequest,
};

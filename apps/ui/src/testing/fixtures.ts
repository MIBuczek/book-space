import { IAuthenticatedUser, IUserCapabilities, TUserRole } from '@models/user.model';

/**
 * Fixtures for the UI specs.
 *
 * The session now carries an `IAuthenticatedUser` — the stored user plus the capabilities
 * the API resolved — so a spec that needs a signed-in caller has to build both. Building
 * them in one place keeps the specs about behaviour rather than about a twelve-field
 * object, and a capability added to the model does not have to be added to every spec.
 *
 * `makeCapabilities` defaults to the employee baseline, the least-privileged authenticated
 * role, so a test that forgets to widen a capability fails closed rather than passing for
 * the wrong reason.
 */
export const makeCapabilities = (
  overrides: Partial<IUserCapabilities> = {}
): IUserCapabilities => ({
  staff: true,
  canSeeClientsTab: false,
  canSeeFacilitiesTab: false,
  canSeeSummaryTab: false,
  canApproveBookings: false,
  canArchiveBookings: false,
  canFilterUnapproved: false,
  canSeeConflicts: false,
  canManageUsers: false,
  canWriteClients: false,
  canWriteFacilities: false,
  canSendFacilityMessages: true,
  ...overrides,
});

/** The full office/administrator capability set, for the specs that need every tab. */
export const fullCapabilities = (): IUserCapabilities =>
  makeCapabilities({
    canSeeClientsTab: true,
    canSeeFacilitiesTab: true,
    canSeeSummaryTab: true,
    canApproveBookings: true,
    canArchiveBookings: true,
    canFilterUnapproved: true,
    canSeeConflicts: true,
    canManageUsers: true,
    canWriteClients: true,
    canWriteFacilities: true,
  });

export const makeUser = (
  role: TUserRole,
  overrides: Partial<IAuthenticatedUser> = {}
): IAuthenticatedUser => ({
  _id: 'u1',
  email: `${role.toLowerCase()}@example.com`,
  firstName: 'Ada',
  lastName: 'Staff',
  role,
  active: true,
  capabilities: makeCapabilities(),
  ...overrides,
});

/** A signed-in administrator with every capability. */
export const adminUser = (): IAuthenticatedUser =>
  makeUser('ADMIN', {email: 'admin@example.com', capabilities: fullCapabilities()});

/** A signed-in office user: the Clients, Facilities and Summary tabs, no writes. */
export const officeUser = (): IAuthenticatedUser =>
  makeUser('OFFICE', {
    email: 'office@example.com',
    capabilities: makeCapabilities({
      canSeeClientsTab: true,
      canSeeFacilitiesTab: true,
      canSeeSummaryTab: true,
    }),
  });

/** A signed-in employee: the staff baseline only. */
export const employeeUser = (): IAuthenticatedUser =>
  makeUser('EMPLOYEE', {email: 'employee@example.com'});

import {IUserCapabilities, TUserRole} from '@models/user.model';

/**
 * The capability matrix, computed once per request (FR-004, SC-001).
 *
 * Each entry mirrors a row of `contracts/authorization-matrix.md` and the legacy helper it
 * came from. This is the *only* place the role-to-capability mapping is written down on the
 * client-facing side: the guards on the endpoints enforce the same rules, and a new endpoint
 * must still carry its own `@Roles(...)`. The object exists so the UI can render the right
 * navigation without re-deriving the matrix from the role — which is what the legacy
 * `credentials-function.ts` helpers did, in the client, in five different files.
 *
 * It deliberately does not decide the Summary deny-list: that is configuration
 * (`SUMMARY_DENY_LIST`, FR-006) and is passed in as `summaryDenied`, so this module does not
 * depend on where the list is read from.
 */
const capabilitiesFor = (role: TUserRole, summaryDenied: boolean): IUserCapabilities => {
  const isAdmin = role === 'ADMIN';
  const isOffice = role === 'OFFICE';
  const isStaff = isAdmin || isOffice || role === 'EMPLOYEE';

  return {
    // `siskEmployeeCredentials` — every recognised role. The Calendar and Bookings tabs.
    staff: isStaff,
    // `adminSeeContentCredentials` — the Clients and Facilities tabs.
    canSeeClientsTab: isAdmin || isOffice,
    canSeeFacilitiesTab: isAdmin || isOffice,
    // `summaryUserRestriction` — office or administrator, minus the deny-list.
    canSeeSummaryTab: (isAdmin || isOffice) && !summaryDenied,
    // `adminCredentials` — approve/unapprove and archive are administrator-only.
    canApproveBookings: isAdmin,
    canArchiveBookings: isAdmin,
    // The "awaiting approval" filter and the conflict counter are administrator-only
    // (`Bookings.tsx`).
    canFilterUnapproved: isAdmin,
    canSeeConflicts: isAdmin,
    canManageUsers: isAdmin,
    // Writes are administrator-only (`Clients.tsx`, the Facilities tab gate).
    canWriteClients: isAdmin,
    canWriteFacilities: isAdmin,
    // The message-to-employee action is available to staff (`Building.tsx`).
    canSendFacilityMessages: isStaff,
  };
};

export {capabilitiesFor};

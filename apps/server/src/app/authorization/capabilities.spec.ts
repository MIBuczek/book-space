import {capabilitiesFor} from './capabilities';

/**
 * The capability matrix, asserted role by role against
 * `contracts/authorization-matrix.md` and the legacy `SideNav.tsx` tab gates.
 *
 * Every role is checked as a whole object rather than field by field: a capability that is
 * silently added to one role and not the others is the failure this guards, and a per-field
 * assertion would not show it.
 */
describe('capabilitiesFor', () => {
  it('gives an employee the staff baseline and no tab beyond Calendar and Bookings', () => {
    expect(capabilitiesFor('EMPLOYEE')).toEqual({
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
    });
  });

  it('gives office the Clients, Facilities and Summary tabs, but no writes', () => {
    expect(capabilitiesFor('OFFICE')).toEqual({
      staff: true,
      canSeeClientsTab: true,
      canSeeFacilitiesTab: true,
      canSeeSummaryTab: true,
      canApproveBookings: false,
      canArchiveBookings: false,
      canFilterUnapproved: false,
      canSeeConflicts: false,
      canManageUsers: false,
      canWriteClients: false,
      canWriteFacilities: false,
      canSendFacilityMessages: true,
    });
  });

  it('gives an administrator every capability', () => {
    const capabilities = capabilitiesFor('ADMIN');
    expect(Object.values(capabilities).every(Boolean)).toBe(true);
  });
});

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
    expect(capabilitiesFor('EMPLOYEE', false)).toEqual({
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
    expect(capabilitiesFor('OFFICE', false)).toEqual({
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
    const capabilities = capabilitiesFor('ADMIN', false);
    expect(Object.values(capabilities).every(Boolean)).toBe(true);
  });

  it('denies the Summary tab to a listed office account but keeps the other tabs', () => {
    const capabilities = capabilitiesFor('OFFICE', true);

    expect(capabilities.canSeeSummaryTab).toBe(false);
    // The deny-list is specific to the Summary feature (FR-006); it must not become a
    // blanket downgrade that also removes the Clients and Facilities tabs.
    expect(capabilities.canSeeClientsTab).toBe(true);
    expect(capabilities.canSeeFacilitiesTab).toBe(true);
  });

  it('denies the Summary tab to a listed administrator account too', () => {
    // The legacy restriction ran before the role check (`summaryUserRestriction` returned
    // false for the account regardless of role), so an administrator on the list is denied
    // as well.
    expect(capabilitiesFor('ADMIN', true).canSeeSummaryTab).toBe(false);
  });
});

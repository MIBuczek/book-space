import { ADMIN_TABS, visibleAdminTabs } from './navigation';
import { adminUser, employeeUser, makeCapabilities, officeUser } from '../../testing/fixtures';

/**
 * The tab derivation, which is the "role-based navigation" of T033 (FR-004).
 *
 * It is a pure function so the navigation rule is testable without rendering a component:
 * the acceptance criterion "an employee sees only Calendar and Bookings" is a property of
 * this function, and the shell is only a view of it.
 */
describe('visibleAdminTabs', () => {
  const labels = (capabilities: Parameters<typeof visibleAdminTabs>[0]) =>
    visibleAdminTabs(capabilities).map((tab) => tab.label);

  it('shows an employee only Calendar and Bookings', () => {
    expect(labels(employeeUser().capabilities)).toEqual(['Calendar', 'Bookings']);
  });

  it('shows office Calendar, Bookings, Clients, Facilities and Summary', () => {
    expect(labels(officeUser().capabilities)).toEqual([
      'Calendar',
      'Bookings',
      'Clients',
      'Facilities',
      'Summary',
    ]);
  });

  it('shows an administrator all five tabs', () => {
    expect(labels(adminUser().capabilities)).toEqual([
      'Calendar',
      'Bookings',
      'Clients',
      'Facilities',
      'Summary',
    ]);
  });

  it('drops Summary for a deny-listed office account but keeps the other tabs', () => {
    const capabilities = makeCapabilities({
      canSeeClientsTab: true,
      canSeeFacilitiesTab: true,
      canSeeSummaryTab: false,
    });

    expect(labels(capabilities)).toEqual(['Calendar', 'Bookings', 'Clients', 'Facilities']);
  });

  it('shows nothing when the capabilities are absent', () => {
    // An anonymous or not-yet-restored caller. Failing closed means the menu does not
    // flash the full set before `/auth/me` answers.
    expect(visibleAdminTabs(null)).toEqual([]);
  });

  it('keeps the declared tab order', () => {
    expect(ADMIN_TABS.map((tab) => tab.path)).toEqual([
      'calendar',
      'bookings',
      'clients',
      'facilities',
      'summary',
    ]);
  });
});

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
    expect(labels(employeeUser().capabilities)).toEqual(['Kalendarz', 'Rezerwacje']);
  });

  it('shows office Calendar, Bookings, Clients, Facilities and Summary', () => {
    expect(labels(officeUser().capabilities)).toEqual([
      'Kalendarz',
      'Rezerwacje',
      'Najemcy',
      'Obiekty',
      'Podsumowanie',
    ]);
  });

  it('shows an administrator all six tabs, including Users', () => {
    expect(labels(adminUser().capabilities)).toEqual([
      'Kalendarz',
      'Rezerwacje',
      'Najemcy',
      'Obiekty',
      'Podsumowanie',
      'Użytkownicy',
    ]);
  });

  it('shows office the tabs but not Users, which is administrator-only (FR-045)', () => {
    expect(labels(officeUser().capabilities)).not.toContain('Użytkownicy');
  });

  it('drops Summary for an office account without the capability but keeps the other tabs', () => {
    const capabilities = makeCapabilities({
      canSeeClientsTab: true,
      canSeeFacilitiesTab: true,
      canSeeSummaryTab: false,
    });

    expect(labels(capabilities)).toEqual(['Kalendarz', 'Rezerwacje', 'Najemcy', 'Obiekty']);
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
      'users',
    ]);
  });
});

import { IUserCapabilities } from '@models/user.model';

/**
 * The admin area's tabs and the capability each one needs.
 *
 * The legacy `SideNav.tsx` showed Calendar and Bookings to every staff member and the
 * Clients, Facilities and Summary tabs to office and administrators (`adminSeeContentCredentials`),
 * with Summary additionally subject to the deny-list. Those gates are the capability flags the
 * API resolves, so the tab list is derived from the capabilities rather than from the role —
 * a deny-listed office account loses Summary here without the client knowing why.
 */
export interface IAdminTab {
  /** The child route path, relative to `/admin`. */
  path: string;
  label: string;
  capability: keyof IUserCapabilities;
}

/**
 * Every admin tab, in the order the legacy panel showed them.
 *
 * Exported for the routes table, which attaches the same capability as a guard, so a tab
 * that is hidden and the route behind it cannot disagree.
 */
export const ADMIN_TABS: readonly IAdminTab[] = [
  { path: 'calendar', label: 'Calendar', capability: 'staff' },
  { path: 'bookings', label: 'Bookings', capability: 'staff' },
  { path: 'clients', label: 'Clients', capability: 'canSeeClientsTab' },
  { path: 'facilities', label: 'Facilities', capability: 'canSeeFacilitiesTab' },
  { path: 'summary', label: 'Summary', capability: 'canSeeSummaryTab' },
];

/**
 * The tabs the account may see, in order.
 *
 * A missing capability set — an anonymous or not-yet-restored caller — yields no tabs, so
 * the navigation fails closed rather than flashing the full menu before the session loads.
 */
export const visibleAdminTabs = (
  capabilities: IUserCapabilities | null
): readonly IAdminTab[] =>
  capabilities === null
    ? []
    : ADMIN_TABS.filter((tab) => capabilities[tab.capability] === true);

import { IUserCapabilities } from '@models/user.model';
import { COPY } from '@booking/copy';

/**
 * The admin area's tabs and the capability each one needs.
 *
 * The legacy `SideNav.tsx` showed Calendar and Bookings to every staff member and the
 * Clients, Facilities and Summary tabs to office and administrators (`adminSeeContentCredentials`).
 * Those gates are the capability flags the API resolves, so the tab list is derived from the
 * capabilities rather than from the role — an office account without the Summary capability
 * loses it here without the client knowing why.
 *
 * The labels are read from the shared copy catalogue (NFR-005, T061): the tab list is the
 * single declaration of a tab's path and capability, and its label comes from the catalogue
 * rather than a literal here.
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
  { path: 'calendar', label: COPY.admin.tabs.calendar, capability: 'staff' },
  { path: 'bookings', label: COPY.admin.tabs.bookings, capability: 'staff' },
  { path: 'clients', label: COPY.admin.tabs.clients, capability: 'canSeeClientsTab' },
  { path: 'facilities', label: COPY.admin.tabs.facilities, capability: 'canSeeFacilitiesTab' },
  { path: 'summary', label: COPY.admin.tabs.summary, capability: 'canSeeSummaryTab' },
  { path: 'users', label: COPY.admin.tabs.users, capability: 'canManageUsers' },
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

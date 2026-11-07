import { Route, Routes } from '@angular/router';
import { capabilityGuard } from '../../core/capability.guard';
import { AdminShellComponent } from './admin-shell.component';
import { ADMIN_TABS } from '../../shell/navigation';

/**
 * The tab that has a real body, keyed by its route path.
 *
 * The tab list (`ADMIN_TABS`) and the routes come from one place, so a tab cannot be
 * hidden while its route stays reachable — but the *body* of a tab is a separate decision,
 * because T036–T039 land one tab at a time. A tab absent from this map still gets a route
 * and still renders the placeholder, so adding a tab to `ADMIN_TABS` never produces a
 * dangling link, and moving a tab here is the whole change that gives it a body.
 */
const TAB_COMPONENTS: Record<string, Route['loadComponent']> = {
  bookings: () =>
    import('./bookings/bookings-table.component').then((m) => m.BookingsTableComponent),
  clients: () => import('./clients/clients-table.component').then((m) => m.ClientsTableComponent),
  facilities: () =>
    import('./facilities/facilities-tab.component').then((m) => m.FacilitiesTabComponent),
};

/**
 * The admin area's routes, loaded as one chunk behind `capabilityGuard('staff')`.
 *
 * The shell is the parent route and each tab is a child, so the tab bar and the routed
 * content are one layout and switching tabs does not re-render the frame. The children are
 * generated from `ADMIN_TABS`, which is the same list the shell renders: the guard on a
 * tab's route and the capability that shows its link come from one entry, so they cannot
 * disagree. A caller who is not allowed a tab is redirected to the calendar by the guard
 * even if they type its URL.
 *
 * `''` redirects to `calendar`, which every staff member has, so landing on `/admin` always
 * shows a tab the caller may use. The child `**` catches an unknown tab path for the same
 * reason: it must not fall through to the application-level wildcard and render a 404 inside
 * a signed-in panel.
 */
export const adminRoutes: Routes = [
  {
    path: '',
    component: AdminShellComponent,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'calendar' },
      ...ADMIN_TABS.map((tab) => ({
        path: tab.path,
        canMatch: [capabilityGuard(tab.capability)],
        loadComponent:
          TAB_COMPONENTS[tab.path] ??
          (() =>
            import('./admin-tab-placeholder.component').then((m) => m.AdminTabPlaceholderComponent)),
        data: { title: tab.label },
      })),
      { path: '**', redirectTo: 'calendar' },
    ],
  },
];

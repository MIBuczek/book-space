import { Routes } from '@angular/router';

/**
 * The admin area's routes, loaded as one chunk behind `adminGuard`.
 *
 * Lazy `loadChildren` means an anonymous or non-admin caller never fetches this
 * bundle. The tab routes are placeholders for T036–T039; each will replace its
 * component without changing the path, so the guard and the shell stay put.
 */
export const adminRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./admin-dashboard.component').then((m) => m.AdminDashboardComponent),
  },
];

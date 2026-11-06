import { Route } from '@angular/router';
import { appRoutes } from './app.routes';
import { adminRoutes } from './features/admin/admin.routes';
import { ADMIN_TABS } from './shell/navigation';

// The route table's behaviour is the loaders: a route that resolves to the
// wrong component, or a missing admin chunk, is a broken navigation. Invoking
// each loader is the only way to exercise them without a full router harness.
describe('appRoutes', () => {
  const route = (path: string) => {
    const found = appRoutes.find((r) => r.path === path);
    if (!found) {
      throw new Error(`No route for path "${path}"`);
    }
    return found;
  };

  it('declares the public calendar at the root', async () => {
    const component = await route('').loadComponent?.();
    expect((component as { name: string }).name).toBe('PublicCalendarComponent');
  });

  it('declares the sign-in route behind the guest guard', async () => {
    const signIn = route('sign-in');
    expect(signIn.canMatch).toHaveLength(1);

    const component = await signIn.loadComponent?.();
    expect((component as { name: string }).name).toBe('SignInComponent');
  });

  it('declares the public booking request route', async () => {
    const component = await route('booking-request').loadComponent?.();
    expect((component as { name: string }).name).toBe('BookingRequestComponent');
  });

  it('declares the contact route', async () => {
    const component = await route('contact').loadComponent?.();
    expect((component as { name: string }).name).toBe('ContactComponent');
  });

  it('declares the server-error route', async () => {
    const component = await route('server-error').loadComponent?.();
    expect((component as { name: string }).name).toBe('ServerErrorComponent');
  });

  it('declares the wildcard as the last route', async () => {
    expect(appRoutes[appRoutes.length - 1].path).toBe('**');
    const component = await route('**').loadComponent?.();
    expect((component as { name: string }).name).toBe('NotFoundComponent');
  });

  it('guards the admin area by session and the staff capability and loads it lazily', async () => {
    const admin = route('admin');
    expect(admin.canMatch).toHaveLength(2);

    const children = await admin.loadChildren?.();
    expect(children).toBe(adminRoutes);
  });
});

describe('adminRoutes', () => {
  const shell = adminRoutes[0];
  const child = (path: string) => {
    const found = shell.children?.find((r: Route) => r.path === path);
    if (!found) {
      throw new Error(`No admin child route for path "${path}"`);
    }
    return found;
  };

  it('renders the shell as the parent route', () => {
    expect((shell.component as { name: string }).name).toBe('AdminShellComponent');
  });

  it('redirects the bare path to the calendar tab', () => {
    const empty = child('');
    expect(empty.redirectTo).toBe('calendar');
    expect(empty.pathMatch).toBe('full');
  });

  it('declares one guarded, lazily loaded route per tab', async () => {
    for (const tab of ADMIN_TABS) {
      const tabRoute = child(tab.path);
      expect(tabRoute.canMatch).toHaveLength(1);
      expect(tabRoute.data).toEqual({ title: tab.label });

      const component = await tabRoute.loadComponent?.();
      expect((component as { name: string }).name).toBe('AdminTabPlaceholderComponent');
    }
  });

  it('catches an unknown tab path so it does not fall through to the app 404', () => {
    const wildcard = shell.children?.find((r: Route) => r.path === '**');
    expect(wildcard?.redirectTo).toBe('calendar');
  });
});

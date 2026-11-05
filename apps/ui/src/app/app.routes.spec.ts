import { appRoutes } from './app.routes';
import { adminRoutes } from './features/admin/admin.routes';

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

  it('declares the sign-in route', async () => {
    const component = await route('sign-in').loadComponent?.();
    expect((component as { name: string }).name).toBe('SignInComponent');
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

  it('guards the admin area and loads it lazily', async () => {
    const admin = route('admin');
    expect(admin.canMatch).toHaveLength(2);

    const children = await admin.loadChildren?.();
    expect(children).toBe(adminRoutes);
  });

  it('loads the admin dashboard from the admin chunk', async () => {
    const component = await adminRoutes[0].loadComponent?.();
    expect((component as { name: string }).name).toBe('AdminDashboardComponent');
  });
});

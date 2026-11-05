import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AdminDashboardComponent } from './admin/admin-dashboard.component';
import { ContactComponent } from './informational/contact.component';
import { NotFoundComponent } from './informational/not-found.component';
import { ServerErrorComponent } from './informational/server-error.component';
import { PublicCalendarComponent } from './public-calendar/public-calendar.component';
import { ErrorStore } from '../core/error.store';

// The T032 placeholders. Each asserts it renders its heading, which is the only
// behaviour they have; T034–T040 replace the bodies and their own specs.
describe('T032 placeholder pages', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        AdminDashboardComponent,
        ContactComponent,
        NotFoundComponent,
        ServerErrorComponent,
        PublicCalendarComponent,
      ],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  const text = (component: new (...args: never[]) => unknown): string => {
    const fixture = TestBed.createComponent(component);
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).textContent ?? '';
  };

  it('renders the public calendar heading', () => {
    expect(text(PublicCalendarComponent)).toContain('Reservation calendar');
  });

  it('renders the admin heading', () => {
    expect(text(AdminDashboardComponent)).toContain('Administration');
  });

  it('renders the contact heading', () => {
    expect(text(ContactComponent)).toContain('Contact');
  });

  it('renders the 404 page with a link home', () => {
    expect(text(NotFoundComponent)).toContain('Page not found');
  });

  it('renders the server-error page with the recorded message', () => {
    TestBed.inject(ErrorStore).reportServerError('Database is down');
    expect(text(ServerErrorComponent)).toContain('Database is down');
  });

  it('falls back to a default message when no error was recorded', () => {
    expect(text(ServerErrorComponent)).toContain('The server is unavailable.');
  });
});

import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AppComponent } from './app.component';

// Guards the harness and the shell layout. The starter's HttpClient wiring is
// gone: the shell no longer talks to the API, so the spec asserts the four
// layout slots render rather than a hard-coded message.
describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('creates the shell', () => {
    const fixture = TestBed.createComponent(AppComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders the navigation, the routed outlet, the footer and the cookie notice', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('book-space-nav')).not.toBeNull();
    expect(element.querySelector('router-outlet')).not.toBeNull();
    expect(element.querySelector('book-space-footer')).not.toBeNull();
    expect(element.querySelector('book-space-cookie-notice')).not.toBeNull();
  });
});

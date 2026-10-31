import { TestBed } from '@angular/core/testing';
import { AppComponent } from './app.component';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

// Guards the jest-preset-angular 15 migration: the harness must be able to
// bootstrap the Angular testing environment at all. If `setupZoneTestEnv` is
// missing or mis-wired, this fails rather than silently reporting no tests.
describe('AppComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('creates the component', () => {
    const fixture = TestBed.createComponent(AppComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  // Covers the Stage 3b change from constructor injection to inject() and the
  // HttpClientModule to provideHttpClient() swap: the component must still be
  // able to issue the request and project the response onto `ocean`.
  it('loads the api message on init', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    httpMock.expectOne('http://localhost:3000/api').flush({ message: 'hello' });

    expect(fixture.componentInstance.ocean).toBe('hello');
  });
});

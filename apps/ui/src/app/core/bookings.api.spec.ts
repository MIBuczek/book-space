import {TestBed} from '@angular/core/testing';
import {provideHttpClient} from '@angular/common/http';
import {HttpTestingController, provideHttpClientTesting} from '@angular/common/http/testing';
import {BookingsApi} from './bookings.api';

describe('BookingsApi', () => {
  let api: BookingsApi;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(BookingsApi);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('sends the facility and the period as query parameters', () => {
    const from = new Date('2026-03-09T23:00:00.000Z');
    const to = new Date('2026-03-10T22:59:59.999Z');

    api.list({city: 'siechnice', building: 'hala-sportowa', from, to}).subscribe();
    const request = httpMock.expectOne((candidate) => candidate.url === '/api/bookings');
    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('city')).toBe('siechnice');
    expect(request.request.params.get('building')).toBe('hala-sportowa');
    expect(request.request.params.get('from')).toBe(from.toISOString());
    expect(request.request.params.get('to')).toBe(to.toISOString());
    request.flush({items: [], total: 0, page: 1, limit: 50});
  });
});

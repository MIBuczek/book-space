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

  it('omits the optional admin filters that are not set', () => {
    api.listAdmin({city: 'siechnice', building: 'hala-sportowa'}).subscribe();
    const request = httpMock.expectOne((candidate) => candidate.url === '/api/bookings');
    expect(request.request.params.get('city')).toBe('siechnice');
    expect(request.request.params.has('accepted')).toBe(false);
    expect(request.request.params.has('search')).toBe(false);
    expect(request.request.params.has('all')).toBe(false);
    request.flush({items: [], total: 0, page: 1, limit: 20});
  });

  it('serialises the admin booleans, dates and numbers as the server reads them', () => {
    const from = new Date('2025-07-31T22:00:00.000Z');
    const to = new Date('2026-08-31T21:59:59.999Z');

    api
      .listAdmin({from, to, accepted: false, archive: true, search: 'Kowalski', page: 2, limit: 50, all: true})
      .subscribe();
    const request = httpMock.expectOne((candidate) => candidate.url === '/api/bookings');
    expect(request.request.params.get('accepted')).toBe('false');
    expect(request.request.params.get('archive')).toBe('true');
    expect(request.request.params.get('search')).toBe('Kowalski');
    expect(request.request.params.get('page')).toBe('2');
    expect(request.request.params.get('limit')).toBe('50');
    expect(request.request.params.get('all')).toBe('true');
    expect(request.request.params.get('from')).toBe(from.toISOString());
    expect(request.request.params.get('to')).toBe(to.toISOString());
    request.flush({items: [], total: 0, page: 1, limit: 50});
  });

  it('reads the conflict ids for a facility and period', () => {
    const from = new Date('2026-08-01T00:00:00.000Z');
    const to = new Date('2026-08-31T23:59:59.999Z');

    let ids: string[] = [];
    api.conflicts({city: 'siechnice', building: 'hala-sportowa', from, to}).subscribe((result) => {
      ids = result;
    });
    const request = httpMock.expectOne(
      (candidate) => candidate.url === '/api/bookings/conflicts'
    );
    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('city')).toBe('siechnice');
    expect(request.request.params.get('building')).toBe('hala-sportowa');
    request.flush(['b1', 'b2']);

    expect(ids).toEqual(['b1', 'b2']);
  });

  it('approves a booking with the acceptance flag and the force option', () => {
    api.approve('b1', true, true).subscribe();
    const request = httpMock.expectOne('/api/bookings/b1/approve');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({accepted: true, force: true});
    request.flush({booking: {}, conflicts: []});
  });

  it('defaults force to false on an approval', () => {
    api.approve('b1', true).subscribe();
    const request = httpMock.expectOne('/api/bookings/b1/approve');
    expect(request.request.body).toEqual({accepted: true, force: false});
    request.flush({booking: {}, conflicts: []});
  });

  it('archives a booking', () => {
    api.archive('b1', true).subscribe();
    const request = httpMock.expectOne('/api/bookings/b1/archive');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({archive: true});
    request.flush({});
  });

  it('updates a booking through the generic route', () => {
    api.update('b1', {nick: 'Nowa'}).subscribe();
    const request = httpMock.expectOne('/api/bookings/b1');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({nick: 'Nowa'});
    request.flush({});
  });

  it('replaces the whole slot list', () => {
    const slots = [
      {
        day: new Date('2026-08-03T22:00:00.000Z'),
        startHours: new Date('2026-08-03T23:00:00.000Z'),
        endHours: new Date('2026-08-04T00:00:00.000Z'),
        status: 'DONE' as const,
      },
    ];

    api.replaceSlots('b1', slots).subscribe();
    const request = httpMock.expectOne('/api/bookings/b1/booked-times');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual(slots);
    request.flush({});
  });

  it('deletes a booking', () => {
    api.remove('b1').subscribe();
    const request = httpMock.expectOne('/api/bookings/b1');
    expect(request.request.method).toBe('DELETE');
    request.flush({});
  });
});

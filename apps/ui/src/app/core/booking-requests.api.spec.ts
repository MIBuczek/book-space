import {TestBed} from '@angular/core/testing';
import {provideHttpClient} from '@angular/common/http';
import {HttpTestingController, provideHttpClientTesting} from '@angular/common/http/testing';
import {IBookingRequest} from '@models/booking.model';
import {BookingRequestsApi} from './booking-requests.api';

const request: IBookingRequest = {
  type: 'INDIVIDUAL',
  place: {place: 'hala-sportowa', city: 'siechnice'},
  size: '1/1',
  nick: 'Klub Pływacki',
  personName: 'Jan Kowalski',
  personEmail: 'jan@example.com',
  personPhone: '600100200',
  month: 5,
  bookedTimes: [],
  rodoAcknowledgement: true,
  paymentMethod: 'TRANSFER',
};

describe('BookingRequestsApi', () => {
  let api: BookingRequestsApi;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(BookingRequestsApi);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('posts the request body to the public bookings route', () => {
    let received: unknown;
    api.create(request).subscribe((value) => (received = value));

    const http = httpMock.expectOne('/api/bookings');
    expect(http.request.method).toBe('POST');
    expect(http.request.body).toBe(request);
    http.flush({_id: 'b1'});

    expect(received).toEqual({_id: 'b1'});
  });
});

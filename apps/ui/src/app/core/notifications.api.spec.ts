import {TestBed} from '@angular/core/testing';
import {provideHttpClient} from '@angular/common/http';
import {HttpTestingController, provideHttpClientTesting} from '@angular/common/http/testing';
import {NotificationsApi} from './notifications.api';

describe('NotificationsApi', () => {
  let api: NotificationsApi;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(NotificationsApi);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('posts the employee message to the notification route (FR-041)', () => {
    let received: unknown;
    const body = {
      person: 'Beata Hasiuk',
      email: 'siechnice.hala@gmail.com',
      message: 'Dzień dobry',
      recipient: 'beata@example.com',
    };

    api.sendMessage(body).subscribe((value) => (received = value));

    const request = httpMock.expectOne('/api/notifications/message');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(body);
    request.flush({status: 'sent'});

    expect(received).toEqual({status: 'sent'});
  });
});

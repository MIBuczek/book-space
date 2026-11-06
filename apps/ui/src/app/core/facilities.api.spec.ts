import {TestBed} from '@angular/core/testing';
import {provideHttpClient} from '@angular/common/http';
import {HttpTestingController, provideHttpClientTesting} from '@angular/common/http/testing';
import {FacilitiesApi} from './facilities.api';

describe('FacilitiesApi', () => {
  let api: FacilitiesApi;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(FacilitiesApi);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('reads the public facility list', () => {
    let received: unknown;
    api.list().subscribe((value) => (received = value));

    const request = httpMock.expectOne('/api/buildings');
    expect(request.request.method).toBe('GET');
    request.flush([{_id: 'a', name: 'Hala', property: 'hala', city: 'siechnice'}]);

    expect(received).toEqual([{_id: 'a', name: 'Hala', property: 'hala', city: 'siechnice'}]);
  });
});

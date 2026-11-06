import {TestBed} from '@angular/core/testing';
import {provideHttpClient} from '@angular/common/http';
import {HttpTestingController, provideHttpClientTesting} from '@angular/common/http/testing';
import {ClientsApi} from './clients.api';

describe('ClientsApi', () => {
  let api: ClientsApi;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(ClientsApi);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('lists clients with no parameters by default', () => {
    api.list().subscribe();
    const request = httpMock.expectOne((candidate) => candidate.url === '/api/clients');
    expect(request.request.method).toBe('GET');
    expect(request.request.params.keys()).toEqual([]);
    request.flush({items: [], total: 0, page: 1, limit: 50});
  });

  it('sends the search, page and limit as query parameters', () => {
    api.list({search: 'Kowalski', page: 2, limit: 50}).subscribe();
    const request = httpMock.expectOne((candidate) => candidate.url === '/api/clients');
    expect(request.request.params.get('search')).toBe('Kowalski');
    expect(request.request.params.get('page')).toBe('2');
    expect(request.request.params.get('limit')).toBe('50');
    request.flush({items: [], total: 0, page: 2, limit: 50});
  });

  it('omits an absent filter rather than sending undefined', () => {
    api.list({search: undefined, page: 1}).subscribe();
    const request = httpMock.expectOne((candidate) => candidate.url === '/api/clients');
    expect(request.request.params.has('search')).toBe(false);
    expect(request.request.params.get('page')).toBe('1');
    request.flush({items: [], total: 0, page: 1, limit: 50});
  });

  it('posts a create body', () => {
    const body = {type: 'COMPANY', name: 'Firma'} as never;
    api.create(body).subscribe();
    const request = httpMock.expectOne((candidate) => candidate.url === '/api/clients');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(body);
    request.flush({_id: 'c1'});
  });

  it('puts an update to the client route', () => {
    api.update('c1', {name: 'Nowa'}).subscribe();
    const request = httpMock.expectOne((candidate) => candidate.url === '/api/clients/c1');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({name: 'Nowa'});
    request.flush({});
  });

  it('deletes a client by id', () => {
    api.remove('c1').subscribe();
    const request = httpMock.expectOne((candidate) => candidate.url === '/api/clients/c1');
    expect(request.request.method).toBe('DELETE');
    request.flush({});
  });
});

import {TestBed} from '@angular/core/testing';
import {provideHttpClient} from '@angular/common/http';
import {HttpTestingController, provideHttpClientTesting} from '@angular/common/http/testing';
import {ReportingApi} from './reporting.api';

describe('ReportingApi', () => {
  let api: ReportingApi;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(ReportingApi);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('reads the summary with no parameters when the query is empty', () => {
    api.summary({}).subscribe();
    const request = httpMock.expectOne((candidate) => candidate.url === '/api/reporting/summary');
    expect(request.request.method).toBe('GET');
    expect(request.request.params.keys()).toEqual([]);
    request.flush({});
  });

  it('sends the client id and both month bounds as ISO instants', () => {
    const fromMonth = new Date('2026-03-01T00:00:00.000Z');
    const toMonth = new Date('2026-05-01T00:00:00.000Z');
    api.summary({clientId: 'c1', fromMonth, toMonth}).subscribe();

    const request = httpMock.expectOne((candidate) => candidate.url === '/api/reporting/summary');
    expect(request.request.params.get('clientId')).toBe('c1');
    expect(request.request.params.get('fromMonth')).toBe('2026-03-01T00:00:00.000Z');
    expect(request.request.params.get('toMonth')).toBe('2026-05-01T00:00:00.000Z');
    request.flush({});
  });

  it('sends fromTheBeginning as a string and omits the bounds', () => {
    api.summary({clientId: 'c1', fromTheBeginning: true}).subscribe();

    const request = httpMock.expectOne((candidate) => candidate.url === '/api/reporting/summary');
    expect(request.request.params.get('fromTheBeginning')).toBe('true');
    expect(request.request.params.has('fromMonth')).toBe(false);
    expect(request.request.params.has('toMonth')).toBe(false);
    request.flush({});
  });

  it('reads the CSV as text so the BOM and CRLF survive', () => {
    let csv = '';
    api.summaryCsv({clientId: 'c1', fromTheBeginning: true}).subscribe((body) => (csv = body));

    const request = httpMock.expectOne((candidate) => candidate.url === '/api/reporting/summary.csv');
    expect(request.request.method).toBe('GET');
    expect(request.request.responseType).toBe('text');
    request.flush('\uFEFFa;b\r\n');

    expect(csv).toBe('\uFEFFa;b\r\n');
  });

  it('omits an absent client id for the all-clients export', () => {
    api.summaryCsv({}).subscribe();

    const request = httpMock.expectOne((candidate) => candidate.url === '/api/reporting/summary.csv');
    expect(request.request.params.has('clientId')).toBe(false);
    request.flush('');
  });
});

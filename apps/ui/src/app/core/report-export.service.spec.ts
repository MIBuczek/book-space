import {TestBed} from '@angular/core/testing';
import {ReportExport} from './report-export.service';

describe('ReportExport', () => {
  let service: ReportExport;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ReportExport);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('download', () => {
    it('saves the content under the given name and cleans up the object URL', () => {
      const createObjectURL = jest.spyOn(URL, 'createObjectURL');
      const revokeObjectURL = jest.spyOn(URL, 'revokeObjectURL');
      // `click()` on a detached anchor is ignored by Firefox, so the anchor must be in the
      // document when it is clicked; spying on the prototype proves it was.
      const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

      service.download('klub (od początku).csv', '\uFEFFa;b\r\n');

      expect(createObjectURL).toHaveBeenCalledTimes(1);
      expect(click).toHaveBeenCalledTimes(1);
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:jsdom-stub');
      // The anchor is removed again, so the DOM is left as it was found.
      expect(document.querySelector('a[download]')).toBeNull();
    });

    it('builds a CSV blob from the content', () => {
      const createObjectURL = jest.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x');
      jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

      service.download('report.csv', '\uFEFFheader\r\n');

      const blob = createObjectURL.mock.calls[0][0] as Blob;
      expect(blob.type).toBe('text/csv;charset=utf-8');
    });
  });

  describe('print', () => {
    it('opens the browser print dialog', () => {
      const print = jest.spyOn(window, 'print').mockImplementation(() => undefined);

      service.print();

      expect(print).toHaveBeenCalledTimes(1);
    });
  });
});

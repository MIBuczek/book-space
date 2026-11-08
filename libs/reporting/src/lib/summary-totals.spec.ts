import {IBookedTimeSummary} from '@models/reporting.model';
import {summaryTotalBookingsNumber} from './summary-totals';

const entry = (statuses: Array<'INITIAL' | 'DONE' | 'CANCELED'>): IBookedTimeSummary => ({
  generalBookingDetails: {
    payment: 'CASH',
    discount: '',
    extraOptions: false,
    selectedOptions: [],
    size: '1/1',
    building: 'hala-sportowa',
  },
  bookingTimeDetails: statuses.map((status, index) => ({
    day: new Date(`2026-03-0${index + 1}T10:00:00Z`),
    startHours: new Date(`2026-03-0${index + 1}T10:00:00Z`),
    endHours: new Date(`2026-03-0${index + 1}T11:00:00Z`),
    status,
  })),
});

describe('summaryTotalBookingsNumber', () => {
  it('reports zero bookings when there are none', () => {
    expect(summaryTotalBookingsNumber([])).toBe('0 rezerwacji.');
  });

  it('counts every slot and the done ones separately', () => {
    expect(summaryTotalBookingsNumber([entry(['DONE', 'INITIAL']), entry(['DONE'])])).toBe(
      '3 rezerwacji, w tym 2 zrealizowanych.'
    );
  });

  it('reports zero done when none is resolved', () => {
    expect(summaryTotalBookingsNumber([entry(['INITIAL', 'CANCELED'])])).toBe(
      '2 rezerwacji, w tym 0 zrealizowanych.'
    );
  });
});

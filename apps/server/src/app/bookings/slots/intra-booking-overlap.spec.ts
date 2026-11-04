import {findIntraBookingOverlap, slotsOverlap} from './intra-booking-overlap';

describe('intra-booking overlap (T053)', () => {
  const DAY = new Date('2026-03-04T00:00:00.000Z');
  const OTHER_DAY = new Date('2026-03-05T00:00:00.000Z');
  const slot = (startHour: number, endHour: number, day = DAY) => ({
    day,
    startHours: new Date(Date.UTC(2026, 2, 4, startHour)),
    endHours: new Date(Date.UTC(2026, 2, 4, endHour)),
  });

  describe('slotsOverlap', () => {
    it('treats a touching interval as a non-overlap', () => {
      // 08:00–10:00 then 10:00–12:00 is back-to-back, not a conflict.
      expect(slotsOverlap(slot(8, 10), slot(10, 12))).toBe(false);
    });

    it('reports a genuine overlap', () => {
      // The issue's example: 13:00–15:00 and 14:00–16:00.
      expect(slotsOverlap(slot(13, 15), slot(14, 16))).toBe(true);
    });

    it('reports a contained interval as an overlap', () => {
      expect(slotsOverlap(slot(8, 16), slot(9, 10))).toBe(true);
    });

    it('reports identical intervals as an overlap', () => {
      expect(slotsOverlap(slot(9, 11), slot(9, 11))).toBe(true);
    });

    it('does not report an overlap across days', () => {
      expect(slotsOverlap(slot(9, 11), slot(9, 11, OTHER_DAY))).toBe(false);
    });
  });

  describe('findIntraBookingOverlap', () => {
    it('returns null for an empty list', () => {
      expect(findIntraBookingOverlap([])).toBeNull();
    });

    it('returns null for a single slot', () => {
      expect(findIntraBookingOverlap([slot(9, 11)])).toBeNull();
    });

    it('returns null for adjacent slots', () => {
      expect(findIntraBookingOverlap([slot(8, 10), slot(10, 12), slot(12, 14)])).toBeNull();
    });

    it('returns the later slot day when two slots overlap', () => {
      expect(findIntraBookingOverlap([slot(13, 15), slot(14, 16)])).toEqual(DAY);
    });

    it('returns the day of the colliding slot in a three-slot booking', () => {
      // 08:00–10:00 and 10:00–12:00 are adjacent; the third, 11:00–13:00, collides with
      // the second, so the day reported is that of the slot that collided.
      const third = slot(11, 13);
      expect(findIntraBookingOverlap([slot(8, 10), slot(10, 12), third])).toEqual(DAY);
    });

    it('does not report a booking whose slots merely share a day', () => {
      // Same day, disjoint hours: a valid multi-slot booking.
      expect(findIntraBookingOverlap([slot(8, 10), slot(11, 13)])).toBeNull();
    });

    it('reports an identical pair', () => {
      expect(findIntraBookingOverlap([slot(9, 11), slot(9, 11)])).toEqual(DAY);
    });
  });
});

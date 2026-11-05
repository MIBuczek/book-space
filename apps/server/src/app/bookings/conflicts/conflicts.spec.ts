import {bookedDays, findConflictingBookingIds, findConflictsWith, IConflictBooking, IConflictSlot, slotsConflict} from './conflicts';

/**
 * SC-002 requires the rewrite to produce identical results to the legacy
 * implementation for at least 50 reference pairs. The named cases below pin the rules
 * a reader can check by eye; `legacyConflict` below is a transcription of
 * `check-booking-conflicts-function.ts`, kept independent of `conflicts.ts`, and the
 * oracle suite drives both over generated inputs. A test that called the new code
 * from both sides would prove nothing.
 */

const slot = (day: string, start: string, end: string): IConflictSlot => ({
  day: new Date(day),
  startHours: new Date(start),
  endHours: new Date(end),
});

const booking = (_id: string, accepted: boolean, bookedTimes: IConflictSlot[]): IConflictBooking => ({
  _id,
  accepted,
  bookedTimes,
});

/**
 * The legacy month index for a slot day, 0-based (`day.getMonth()`). The legacy algorithm
 * derived the booking's `month` from its first slot, so the SC-002 oracle below is fed the
 * same derivation. The corrected rule does not read `month` at all (T054); the oracle keeps
 * its gate only to stay a faithful transcription, and the generator supplies a month that
 * matches the slot day so the two agree everywhere the legacy gate was *correct* — the
 * boundary cases where it was wrong are pinned by named tests instead.
 */
const legacyMonthOf = (slot: IConflictSlot): number => new Date(slot.day).getMonth();

/**
 * Re-reads the corrected bookings the way the legacy algorithm did: it stamps each with
 * the `month` derived from its **first** slot. Used only by the boundary cases, to show
 * the legacy gate misses what the corrected rule finds.
 */
const asLegacy = (bookings: IConflictBooking[]): ILegacyBooking[] =>
  bookings.map((entry) => ({...entry, month: legacyMonthOf(entry.bookedTimes[0])}));

// --- Legacy algorithm, transcribed verbatim (behaviour, not style) ---------------

const legacyCheckDay = (dOne: Date, dTwo: Date): boolean =>
  Date.parse(new Date(dOne).toISOString()) - Date.parse(new Date(dTwo).toISOString()) === 0;

const legacyCheckHoursRange = (checkDate: Date, startHour: Date, endHour: Date): boolean =>
  checkDate.getTime() > startHour.getTime() && checkDate.getTime() < endHour.getTime();

const legacyCheckOverlapCase = (checkStartDate: Date, checkEndDate: Date, startHour: Date, endHour: Date): boolean =>
  checkStartDate.getTime() <= startHour.getTime() &&
  checkStartDate.getTime() <= endHour.getTime() &&
  checkEndDate.getTime() >= startHour.getTime() &&
  checkEndDate.getTime() >= endHour.getTime();

const legacyCheckSingleBookingTime = (bt: IConflictSlot, cbt: IConflictSlot): boolean => {
  const sameDay = legacyCheckDay(bt.day, cbt.day);
  const checkStartHour = legacyCheckHoursRange(bt.startHours, cbt.startHours, cbt.endHours);
  const checkEndHour = legacyCheckHoursRange(bt.endHours, cbt.startHours, cbt.endHours);
  const isOverlap = legacyCheckOverlapCase(bt.startHours, bt.endHours, cbt.startHours, cbt.endHours);
  return sameDay && (checkStartHour || checkEndHour || isOverlap);
};

/** A booking as the legacy algorithm read it: the scalar `month` included. */
type ILegacyBooking = IConflictBooking & {month: number};

const legacyCheckConflicts = (currentBooking: ILegacyBooking, all: ILegacyBooking[]): boolean => {
  if (currentBooking.accepted) {
    return false;
  }
  let isConflict = false;
  all.forEach((b) => {
    if (currentBooking._id !== b._id && currentBooking.month === b.month) {
      b.bookedTimes.forEach((cbt) => {
        if (currentBooking.bookedTimes.some((cb) => legacyCheckSingleBookingTime(cb, cbt))) {
          isConflict = true;
        }
      });
    }
  });
  return isConflict;
};

const legacyFindConflictingBookingIds = (all: ILegacyBooking[]): string[] => {
  if (all.length <= 1) {
    return [];
  }
  const result: string[] = [];
  all.forEach((b) => {
    if (!b.accepted && legacyCheckConflicts(b, all)) {
      result.push(b._id);
    }
  });
  return [...new Set(result)];
};

// --- Named rule cases ------------------------------------------------------------

describe('slotsConflict', () => {
  const DAY = '2026-03-04T00:00:00.000Z';

  it('does not conflict when the ranges are on the same day but do not overlap', () => {
    expect(slotsConflict(slot(DAY, '2026-03-04T08:00:00Z', '2026-03-04T09:00:00Z'), slot(DAY, '2026-03-04T10:00:00Z', '2026-03-04T11:00:00Z'))).toBe(false);
  });

  it('does not conflict when one range merely touches the other', () => {
    // `end === start` is neither strictly inside nor containing, so a touching
    // interval is not a conflict. The legacy check agreed, and an implementation that
    // used `<=`/`>=` for the inside test would wrongly flag this.
    expect(slotsConflict(slot(DAY, '2026-03-04T08:00:00Z', '2026-03-04T09:00:00Z'), slot(DAY, '2026-03-04T09:00:00Z', '2026-03-04T10:00:00Z'))).toBe(false);
  });

  it('conflicts when one range starts inside the other', () => {
    expect(slotsConflict(slot(DAY, '2026-03-04T08:30:00Z', '2026-03-04T10:00:00Z'), slot(DAY, '2026-03-04T08:00:00Z', '2026-03-04T09:00:00Z'))).toBe(true);
  });

  it('conflicts when one range ends inside the other', () => {
    expect(slotsConflict(slot(DAY, '2026-03-04T07:30:00Z', '2026-03-04T08:30:00Z'), slot(DAY, '2026-03-04T08:00:00Z', '2026-03-04T09:00:00Z'))).toBe(true);
  });

  it('conflicts when one range contains the other', () => {
    expect(slotsConflict(slot(DAY, '2026-03-04T07:00:00Z', '2026-03-04T12:00:00Z'), slot(DAY, '2026-03-04T08:00:00Z', '2026-03-04T09:00:00Z'))).toBe(true);
  });

  it('conflicts when one range is contained by the other', () => {
    expect(slotsConflict(slot(DAY, '2026-03-04T08:00:00Z', '2026-03-04T09:00:00Z'), slot(DAY, '2026-03-04T07:00:00Z', '2026-03-04T12:00:00Z'))).toBe(true);
  });

  it('does not conflict when the day differs even with identical hours', () => {
    expect(slotsConflict(slot('2026-03-04T00:00:00Z', '2026-03-04T08:00:00Z', '2026-03-04T09:00:00Z'), slot('2026-03-05T00:00:00Z', '2026-03-04T08:00:00Z', '2026-03-04T09:00:00Z'))).toBe(false);
  });

  it('conflicts across the spring DST change on a day the clock skips an hour', () => {
    // Europe/Warsaw moves to CEST on 2026-03-29. The stored instants are absolute, so
    // a range that overlaps the transition still compares by instant, not wall clock.
    const day = '2026-03-29T00:00:00.000Z';
    expect(slotsConflict(slot(day, '2026-03-29T00:30:00Z', '2026-03-29T02:30:00Z'), slot(day, '2026-03-29T01:30:00Z', '2026-03-29T03:00:00Z'))).toBe(true);
  });

  it('conflicts across the autumn DST change on a day the clock repeats an hour', () => {
    // Europe/Warsaw returns to CET on 2026-10-25; the repeated hour is still one span
    // of instants, so an overlap there is a conflict.
    const day = '2026-10-25T00:00:00.000Z';
    expect(slotsConflict(slot(day, '2026-10-25T00:30:00Z', '2026-10-25T02:30:00Z'), slot(day, '2026-10-25T01:30:00Z', '2026-10-25T03:00:00Z'))).toBe(true);
  });
});

describe('findConflictingBookingIds', () => {
  const DAY = '2026-03-04T00:00:00.000Z';

  it('returns nothing for a single booking', () => {
    expect(findConflictingBookingIds([booking('a', false, [slot(DAY, '2026-03-04T08:00:00Z', '2026-03-04T09:00:00Z')])])).toEqual([]);
  });

  it('excludes an accepted booking from the result', () => {
    const bookings = [
      booking('accepted', true, [slot(DAY, '2026-03-04T08:00:00Z', '2026-03-04T10:00:00Z')]),
      booking('pending', false, [slot(DAY, '2026-03-04T09:00:00Z', '2026-03-04T11:00:00Z')]),
    ];

    // The accepted booking is skipped as a candidate; the pending one still conflicts
    // with it, because the legacy `checkConflicts` compares against accepted bookings
    // too — only the *reported* booking has to be unaccepted.
    expect(findConflictingBookingIds(bookings)).toEqual(['pending']);
  });

  it('does not compare bookings on different days', () => {
    const bookings = [
      booking('fourth', false, [slot(DAY, '2026-03-04T08:00:00Z', '2026-03-04T10:00:00Z')]),
      booking('fifth', false, [slot('2026-03-05T00:00:00.000Z', '2026-03-05T09:00:00Z', '2026-03-05T11:00:00Z')]),
    ];

    expect(findConflictingBookingIds(bookings)).toEqual([]);
  });

  it('conflicts across a month boundary when the slots share a day', () => {
    // T054. The stored `month` is derived from the *first* slot, so this booking's scalar
    // is September and the legacy gate never compares its 2 Oct slot against an October
    // booking — the blind spot the issue names. The rule keys on the day, so the October
    // pair is found. The legacy transcription is asserted alongside to make the contrast
    // explicit, the way `cyclical.spec.ts` contrasts the off-by-one count.
    const bookings = [
      booking('crossing', false, [
        slot('2026-09-30T00:00:00.000Z', '2026-09-30T08:00:00Z', '2026-09-30T09:00:00Z'),
        slot('2026-10-02T00:00:00.000Z', '2026-10-02T08:00:00Z', '2026-10-02T09:00:00Z'),
      ]),
      booking('october', false, [slot('2026-10-02T00:00:00.000Z', '2026-10-02T08:30:00Z', '2026-10-02T09:30:00Z')]),
    ];

    expect(legacyFindConflictingBookingIds(asLegacy(bookings))).toEqual([]);
    expect(findConflictingBookingIds(bookings).sort()).toEqual(['crossing', 'october']);
  });

  it('conflicts across a year boundary when the slots share a day', () => {
    const bookings = [
      booking('crossing', false, [
        slot('2026-12-31T00:00:00.000Z', '2026-12-31T08:00:00Z', '2026-12-31T09:00:00Z'),
        slot('2027-01-02T00:00:00.000Z', '2027-01-02T08:00:00Z', '2027-01-02T09:00:00Z'),
      ]),
      booking('january', false, [slot('2027-01-02T00:00:00.000Z', '2027-01-02T08:30:00Z', '2027-01-02T09:30:00Z')]),
    ];

    expect(legacyFindConflictingBookingIds(asLegacy(bookings))).toEqual([]);
    expect(findConflictingBookingIds(bookings).sort()).toEqual(['crossing', 'january']);
  });

  it('reports every booking in a three-way overlap, once each', () => {
    const bookings = [
      booking('a', false, [slot(DAY, '2026-03-04T08:00:00Z', '2026-03-04T10:00:00Z')]),
      booking('b', false, [slot(DAY, '2026-03-04T09:00:00Z', '2026-03-04T11:00:00Z')]),
      booking('c', false, [slot(DAY, '2026-03-04T09:30:00Z', '2026-03-04T12:00:00Z')]),
    ];

    expect(findConflictingBookingIds(bookings).sort()).toEqual(['a', 'b', 'c']);
  });

  it('ignores a booking that overlaps nothing', () => {
    const bookings = [
      booking('a', false, [slot(DAY, '2026-03-04T08:00:00Z', '2026-03-04T09:00:00Z')]),
      booking('b', false, [slot(DAY, '2026-03-04T10:00:00Z', '2026-03-04T11:00:00Z')]),
    ];

    expect(findConflictingBookingIds(bookings)).toEqual([]);
  });
});

describe('findConflictsWith', () => {
  const DAY = '2026-03-04T00:00:00.000Z';
  const slotA = slot(DAY, '2026-03-04T08:00:00Z', '2026-03-04T10:00:00Z');
  const overlapping = slot(DAY, '2026-03-04T09:00:00Z', '2026-03-04T11:00:00Z');
  const apart = slot(DAY, '2026-03-04T10:00:00Z', '2026-03-04T11:00:00Z');

  it('returns the ids of the bookings that overlap the target', () => {
    const target = booking('target', false, [slotA]);
    const others = [target, booking('over', false, [overlapping]), booking('far', false, [apart])];

    expect(findConflictsWith(target, others)).toEqual(['over']);
  });

  it('counts an accepted booking as a conflict', () => {
    // The approval decision is exactly where an already-approved booking matters: it is
    // the one that cannot be double-booked. `findConflictingBookingIds` excludes it as a
    // candidate, which is right for the counter and wrong here.
    const target = booking('target', false, [slotA]);
    const others = [target, booking('approved', true, [overlapping])];

    expect(findConflictsWith(target, others)).toEqual(['approved']);
  });

  it('compares the target even when it is already marked accepted', () => {
    // Approving a booking that is already accepted still has to report the conflict,
    // because the flag holds its previous value while the decision is made.
    const target = booking('target', true, [slotA]);
    const others = [target, booking('over', false, [overlapping])];

    expect(findConflictsWith(target, others)).toEqual(['over']);
  });

  it('never reports the target itself', () => {
    const target = booking('target', false, [slotA]);

    expect(findConflictsWith(target, [target])).toEqual([]);
  });

  it('does not compare bookings that share no day', () => {
    // The caller scopes the candidate query to the facility and the target's own slot
    // days; the pure function's own rule is the day comparison, so a booking on another
    // day is not a conflict.
    const target = booking('target', false, [slotA]);
    const others = [target, booking('fifth', false, [slot('2026-03-05T00:00:00.000Z', '2026-03-05T09:00:00Z', '2026-03-05T11:00:00Z')])];

    expect(findConflictsWith(target, others)).toEqual([]);
  });
});

// --- SC-002 oracle ---------------------------------------------------------------

/** Deterministic pseudo-random generator so a failure is reproducible. */
const makeRandom = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
};

/**
 * Builds a booking list from a seed. The generator varies exactly the inputs the rules
 * care about: day, start/end hour and accepted — including deliberately equal edges so
 * the touching-interval and shared-boundary cases are exercised. Every booking is a
 * single slot, so its legacy `month` (derived from the first slot) always matches its
 * day; that is the domain on which the legacy gate and the corrected rule agree, and the
 * generator is deliberately confined to it. The month- and year-boundary cases where the
 * gate was wrong are pinned by the named tests above rather than generated, because a
 * generated crossing booking would disagree with the oracle by design.
 */
const generateBookings = (random: () => number): IConflictBooking[] => {
  const count = 2 + Math.floor(random() * 6);
  return Array.from({length: count}, (_unused, index) => {
    const dayIndex = Math.floor(random() * 3);
    const day = `2026-03-0${4 + dayIndex}T00:00:00.000Z`;
    const startHour = 7 + Math.floor(random() * 6);
    const duration = Math.floor(random() * 4);
    const start = `2026-03-0${4 + dayIndex}T${String(startHour).padStart(2, '0')}:00:00Z`;
    const end = `2026-03-0${4 + dayIndex}T${String(startHour + duration).padStart(2, '0')}:00:00Z`;
    return booking(`b${index}`, random() < 0.25, [slot(day, start, end)]);
  });
};

describe('SC-002 — the rewrite matches the legacy implementation', () => {
  it('agrees on at least 50 generated reference sets', () => {
    let compared = 0;

    for (let seed = 1; seed <= 200; seed += 1) {
      const random = makeRandom(seed);
      const bookings = generateBookings(random);

      expect(findConflictingBookingIds(bookings)).toEqual(legacyFindConflictingBookingIds(asLegacy(bookings)));
      compared += bookings.length;
    }

    // 200 sets of 2–7 bookings is comfortably above the 50 pairs the criterion names.
    expect(compared).toBeGreaterThanOrEqual(50);
  });

  it('agrees on a hand-built set that mixes every rule', () => {
    const bookings = [
      booking('a', false, [slot('2026-03-04T00:00:00Z', '2026-03-04T08:00:00Z', '2026-03-04T10:00:00Z')]),
      booking('b', false, [slot('2026-03-04T00:00:00Z', '2026-03-04T09:00:00Z', '2026-03-04T11:00:00Z')]),
      booking('c', true, [slot('2026-03-04T00:00:00Z', '2026-03-04T09:00:00Z', '2026-03-04T11:00:00Z')]),
      booking('d', false, [slot('2026-03-05T00:00:00Z', '2026-03-05T09:00:00Z', '2026-03-05T11:00:00Z')]),
    ];

    expect(findConflictingBookingIds(bookings)).toEqual(legacyFindConflictingBookingIds(asLegacy(bookings)));
    // a and b overlap each other; c is accepted so it is not reported but still counts as
    // a comparison target; d is on another day and conflicts with nothing.
    expect(findConflictingBookingIds(bookings)).toEqual(['a', 'b']);
  });
});

describe('bookedDays', () => {
  const DAY = '2026-03-04T00:00:00.000Z';

  it('returns one instant per distinct slot day, in first-appearance order', () => {
    const days = bookedDays(
      booking('a', false, [
        slot('2026-09-30T00:00:00.000Z', '2026-09-30T08:00:00Z', '2026-09-30T09:00:00Z'),
        slot('2026-10-02T00:00:00.000Z', '2026-10-02T08:00:00Z', '2026-10-02T09:00:00Z'),
        slot('2026-09-30T00:00:00.000Z', '2026-09-30T10:00:00Z', '2026-09-30T11:00:00Z'),
      ])
    );

    // The September day appears once though two slots fall on it; the set is what scopes
    // the query, so duplicates would only make the `$in` larger.
    expect(days.map((day) => day.toISOString())).toEqual(['2026-09-30T00:00:00.000Z', '2026-10-02T00:00:00.000Z']);
  });

  it('returns a single day for a single-slot booking', () => {
    expect(bookedDays(booking('a', false, [slot(DAY, '2026-03-04T08:00:00Z', '2026-03-04T09:00:00Z')]))).toEqual([
      new Date(DAY),
    ]);
  });
});

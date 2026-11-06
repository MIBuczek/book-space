import {IBooking} from '@models/booking.model';
import {IBookedTime, TSingleBookingStatus} from '@models/booked-time.model';
import {
  addFacilityDays,
  endOfFacilityMonth,
  formatFacilityDate,
  formatFacilityTime,
  startOfFacilityDay,
  startOfFacilityMonth,
} from '@booking/date-time';

/**
 * The calendar's view model, built from the API's bookings.
 *
 * The legacy `prepareCalenderItem` (`calender-functions.ts`) built one FullCalendar event per
 * slot with the label, the colour and the hour range baked into the event object. This module
 * does the same derivation as pure functions, so the colour rule, the cancelled-slot rule and
 * the label rule are unit-testable rather than reachable only through a rendered calendar.
 */

/** The colour semantics of `generateStatusBackground` (legacy `calender-functions.ts`). */
const EVENT_COLORS = {
  /** The slot happened (`DONE`). */
  done: '#454545',
  /** The booking is accepted (`accepted = true`). */
  accepted: '#AFBF36',
  /** Anything else: an unaccepted request. */
  pending: '#3788d8',
} as const;

/** The public label when a booking carries no `nick` (legacy `booking.nick || 'Rezerwacja'`). */
const DEFAULT_LABEL = 'Rezerwacja';

/** Whether a slot is hidden from the calendar: the legacy `bt.status !== QUIT` check (T055: `QUIT` → `CANCELED`). */
const isCancelled = (status: TSingleBookingStatus): boolean => status === 'CANCELED';

/**
 * The background colour for a slot, reproducing the legacy precedence: `DONE` wins over the
 * accepted flag, so a completed accepted booking is dark grey rather than green.
 */
const eventColor = (accepted: boolean, status: TSingleBookingStatus): string => {
  if (status === 'DONE') {
    return EVENT_COLORS.done;
  }
  return accepted ? EVENT_COLORS.accepted : EVENT_COLORS.pending;
};

/**
 * The event label: the tenant's name for staff, the calendar nickname for the public
 * (`Calender.tsx`: `hasRights ? booking.person : booking.nick || 'Rezerwacja'`).
 *
 * A public booking carries no `personName` — the API redacts it — so the staff branch is
 * only ever taken by a caller who is entitled to it.
 */
const eventLabel = (booking: IBooking, staff: boolean): string => {
  if (staff) {
    return booking.personName || DEFAULT_LABEL;
  }
  return booking.nick || DEFAULT_LABEL;
};

/**
 * The status as text, so the calendar does not rely on colour alone (NFR-006).
 *
 * The legacy calendar conveyed the state with the background colour only; a reader who
 * cannot distinguish the three colours would see three identical blocks. The label is
 * derived from the same two fields as the colour, so the two cannot disagree.
 */
const statusLabel = (accepted: boolean, status: TSingleBookingStatus): string => {
  if (status === 'DONE') {
    return 'Zakończona';
  }
  return accepted ? 'Zatwierdzona' : 'Oczekująca';
};

/** One slot rendered on the calendar. */
interface ICalendarEvent {
  /** `{bookingId}:{slotIndex}` — unique per slot, since one booking has many. */
  id: string;
  bookingId: string;
  slotIndex: number;
  title: string;
  /** The facility-local calendar date, `YYYY-MM-DD`. */
  day: string;
  /** Inclusive start hour, `HH:MM`, facility-local. */
  start: string;
  /** Exclusive end hour, `HH:MM`, facility-local. */
  end: string;
  startHour: number;
  endHour: number;
  color: string;
  size: string;
  accepted: boolean;
  status: TSingleBookingStatus;
  /** The full booking, so a click can show its details without a second request. */
  booking: IBooking;
}

/** The wall-clock hour of an instant, 0–23, as the calendar's column index. */
const facilityHour = (instant: Date): number => Number(formatFacilityTime(instant).slice(0, 2));

/**
 * Turns one booking's slots into calendar events, dropping the cancelled ones.
 *
 * `staff` selects the label. A booking with no slots yields nothing rather than an empty
 * event, which is why the caller maps over slots rather than over bookings.
 */
const bookingToEvents = (booking: IBooking, staff: boolean): ICalendarEvent[] =>
  booking.bookedTimes
    .map((slot: IBookedTime, slotIndex: number) => ({slot, slotIndex}))
    .filter(({slot}) => !isCancelled(slot.status))
    .map(({slot, slotIndex}) => ({
      id: `${booking._id}:${slotIndex}`,
      bookingId: booking._id,
      slotIndex,
      title: eventLabel(booking, staff),
      day: formatFacilityDate(new Date(slot.day)),
      start: formatFacilityTime(new Date(slot.startHours)),
      end: formatFacilityTime(new Date(slot.endHours)),
      startHour: facilityHour(new Date(slot.startHours)),
      endHour: facilityHour(new Date(slot.endHours)),
      color: eventColor(booking.accepted, slot.status),
      size: booking.size,
      accepted: booking.accepted,
      status: slot.status,
      booking,
    }));

/** Every event for a list of bookings, in slot order. */
const bookingsToEvents = (bookings: IBooking[], staff: boolean): ICalendarEvent[] =>
  bookings.flatMap((booking) => bookingToEvents(booking, staff));

/** The facility-local midnight of the Monday of the week containing `anchor` (legacy `firstDay={1}`). */
const startOfFacilityWeek = (anchor: Date): Date => {
  // `getUTCDay` on a facility-local date reads the same civil weekday, so the offset is
  // taken without a second zone conversion. `0` (Sunday) maps to `6`, Monday to `0`.
  const dayOfWeek = (new Date(formatFacilityDate(anchor) + 'T00:00:00Z').getUTCDay() + 6) % 7;
  return addFacilityDays(startOfFacilityDay(anchor), -dayOfWeek);
};

/** The seven facility-local day labels (`YYYY-MM-DD`) of the week containing `anchor`. */
const weekDays = (anchor: Date): string[] => {
  const monday = startOfFacilityWeek(anchor);
  return Array.from({length: 7}, (_, index) => formatFacilityDate(addFacilityDays(monday, index)));
};

/**
 * The hour labels the day and week views render, `06:00`–`23:00` (legacy
 * `slotMinTime="06:00:00"` / `slotMaxTime="24:00:00"`). The grid's last row is hour 23,
 * since a slot ending at `24:00` ends at the next day's local midnight and is drawn as the
 * end of hour 23.
 */
const GRID_START_HOUR = 6;
const GRID_END_HOUR = 24;
const gridHours = (): number[] =>
  Array.from({length: GRID_END_HOUR - GRID_START_HOUR}, (_, index) => GRID_START_HOUR + index);

/** The events on one facility-local day, sorted by start hour. */
const eventsOnDay = (events: ICalendarEvent[], day: string): ICalendarEvent[] =>
  events.filter((event) => event.day === day).sort((a, b) => a.startHour - b.startHour);

/** The four views FR-037 names: a week grid, a day grid, a week list and a month list. */
type TCalendarView = 'week' | 'day' | 'list' | 'month';

/** The last instant of the facility-local day containing `instant` (23:59:59.999). */
const endOfFacilityDay = (instant: Date): Date =>
  new Date(addFacilityDays(startOfFacilityDay(instant), 1).getTime() - 1);

/** The inclusive period the API is asked for, and the day labels the view renders. */
interface ICalendarPeriod {
  from: Date;
  to: Date;
}

/**
 * The period a view loads, in facility-local bounds.
 *
 * The server filters by `createdAt` inclusive (research R9), so the week and list views load
 * the whole calendar week, the day view one local day, and the month view one local month.
 * The bounds are facility-local (R4), so a booking created late on the last local day of a
 * period is inside it rather than in the next UTC day.
 */
const periodFor = (view: TCalendarView, anchor: Date): ICalendarPeriod => {
  switch (view) {
    case 'day':
      return {from: startOfFacilityDay(anchor), to: endOfFacilityDay(anchor)};
    case 'month':
      return {from: startOfFacilityMonth(anchor), to: endOfFacilityMonth(anchor)};
    default:
      return {
        from: startOfFacilityWeek(anchor),
        to: endOfFacilityDay(addFacilityDays(startOfFacilityWeek(anchor), 6)),
      };
  }
};

/**
 * The anchor moved one period forward or back, matching the legacy FullCalendar
 * `prev`/`next` buttons. The view decides the step: a day, a week or a month.
 */
const shiftAnchor = (view: TCalendarView, anchor: Date, direction: 1 | -1): Date => {
  switch (view) {
    case 'day':
      return addFacilityDays(anchor, direction);
    case 'month': {
      const first = startOfFacilityMonth(anchor);
      const wall = formatFacilityDate(first);
      const year = Number(wall.slice(0, 4));
      const month = Number(wall.slice(5, 7));
      // Noon on the first of the target month, so no offset can move it across a boundary.
      return new Date(Date.UTC(year, month - 1 + direction, 1, 12));
    }
    default:
      return addFacilityDays(anchor, 7 * direction);
  }
};

/**
 * The Polish short weekday labels, Monday first (the legacy `locale="pl"` / `firstDay={1}`).
 *
 * The copy is Polish because NFR-005 makes every user-facing string Polish; centralising the
 * two arrays here keeps a future translation a single edit rather than a search through the
 * template.
 */
const WEEKDAY_LABELS = ['pon', 'wt', 'śr', 'czw', 'pt', 'sob', 'nie'] as const;

/** The Polish month names, January first. */
const MONTH_LABELS = [
  'styczeń',
  'luty',
  'marzec',
  'kwiecień',
  'maj',
  'czerwiec',
  'lipiec',
  'sierpień',
  'wrzesień',
  'październik',
  'listopad',
  'grudzień',
] as const;

/** The seven day labels of the week containing `anchor`, paired with their weekday label. */
const weekColumns = (anchor: Date): Array<{day: string; label: string}> =>
  weekDays(anchor).map((day, index) => ({day, label: WEEKDAY_LABELS[index]}));

/** The single day column for the day view: the facility-local day and its weekday label. */
const dayColumn = (anchor: Date): {day: string; label: string} => {
  const day = formatFacilityDate(anchor);
  // `getUTCDay` on the date part reads the same civil weekday, so no second zone conversion.
  const weekday = (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;
  return {day, label: WEEKDAY_LABELS[weekday]};
};

/**
 * The facility-local day labels of the month containing `anchor`.
 *
 * The month view lists a whole month rather than a week, so the period it loads is that
 * month. `startOfFacilityMonth`/`endOfFacilityMonth` are facility-local (R4), so the list
 * and the loaded period agree at a month boundary.
 */
const monthDays = (anchor: Date): string[] => {
  const first = startOfFacilityMonth(anchor);
  const last = endOfFacilityMonth(anchor);
  const days: string[] = [];
  for (let day = first; day.getTime() <= last.getTime(); day = addFacilityDays(day, 1)) {
    days.push(formatFacilityDate(day));
  }
  return days;
};

/** The Polish month-and-year label of the month containing `anchor`, e.g. `marzec 2026`. */
const monthLabel = (anchor: Date): string => {
  const first = startOfFacilityMonth(anchor);
  const day = formatFacilityDate(first);
  const year = Number(day.slice(0, 4));
  const month = Number(day.slice(5, 7));
  return `${MONTH_LABELS[month - 1]} ${year}`;
};

export {
  EVENT_COLORS,
  DEFAULT_LABEL,
  GRID_START_HOUR,
  GRID_END_HOUR,
  WEEKDAY_LABELS,
  MONTH_LABELS,
  isCancelled,
  eventColor,
  eventLabel,
  statusLabel,
  bookingToEvents,
  bookingsToEvents,
  startOfFacilityWeek,
  weekDays,
  weekColumns,
  dayColumn,
  monthDays,
  monthLabel,
  gridHours,
  eventsOnDay,
  endOfFacilityDay,
  periodFor,
  shiftAnchor,
};
export type {ICalendarEvent, TCalendarView, ICalendarPeriod};

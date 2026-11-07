import {IClient} from '@models/client.model';
import {IBookedTimeSummary, IClientSummary, SUMMARY_CITIES, TSummaryCity} from '@models/reporting.model';
import {facilityWallClock, formatFacilityDate, formatFacilityTime} from '@booking/date-time';
import {
  displayBoolean,
  displaySelectedOptions,
  displayValue,
  summaryTotalBookingsNumber,
  toPercentage,
} from '@booking/reporting';

/**
 * The admin summary tab's pure logic (FR-027–FR-030).
 *
 * Everything here is a function over plain values, so the filename pattern, the range rule, the
 * client-detail shaping and the printable report's content are unit-testable without a rendered
 * tab — the same shape `bookings-table.ts` gives the bookings tab and `calendar-events.ts` the
 * calendar. The component holds signals and calls these; it does not re-derive a label inline.
 *
 * The report's vocabulary comes from `@booking/reporting`, which the CSV export also imports, so
 * the printable report and the CSV cannot disagree on a label or on the per-city total (T028
 * acceptance criterion 2).
 */

/** The range the tab is showing: either "from the beginning" or a pair of months. */
interface IReportPeriod {
  fromTheBeginning: boolean;
  /** The first instant of the chosen month, or `null` while unset. */
  fromMonth: Date | null;
  /** The first instant of the chosen month, or `null` while unset. */
  toMonth: Date | null;
}

/** One labelled value in the client-details block. */
interface IDetailRow {
  label: string;
  value: string;
}

/** One city's total line, in the legacy order. */
interface ICityTotal {
  city: TSummaryCity;
  label: string;
  total: string;
}

/** One booked slot, as the printable report renders it. */
interface IReportSlot {
  day: string;
  hours: string;
  participants: string;
  status: string;
  comments: string;
}

/** One booking's details plus its slots, as the printable report renders them. */
interface IReportEntry {
  building: string;
  size: string;
  discount: string;
  payment: string;
  extraOptions: string;
  selectedOptions: string;
  comments: string;
  slots: IReportSlot[];
}

/** One city's report block: the total line and the bookings under it. */
interface ICityReport extends ICityTotal {
  entries: IReportEntry[];
}

/**
 * The client fields the summary's detail block shows, with the legacy labels
 * (`RECORDS_CLIENTS_DETAILS_PROPERTY_MAP`), in the legacy order (`RECORDS_CLIENTS_ROW_DETAILS`).
 *
 * The legacy report rendered the client `type` verbatim (`COMPANY`/`INDIVIDUAL`): its
 * `modelDisplayValue` had no mapping for those values. The rewrite keeps that — the report is a
 * business artefact and the enum is what the legacy report carried.
 */
const CLIENT_DETAIL_FIELDS: Array<{key: keyof IClient; label: string}> = [
  {key: 'name', label: 'Imię i nazwisko'},
  {key: 'type', label: 'Typ'},
  {key: 'contactPerson', label: 'Osoba kontaktowa'},
  {key: 'phone', label: 'Telefon'},
  {key: 'email', label: 'E-mail'},
  {key: 'street', label: 'Ulica'},
  {key: 'city', label: 'Miasto'},
  {key: 'zipCode', label: 'Kod pocztowy'},
  {key: 'nip', label: 'NIP'},
  {key: 'nick', label: 'Nick'},
];

/**
 * The month part of an export filename.
 *
 * `fromTheBeginning` (or a missing bound) is `od początku`, matching the legacy
 * `generateFileName`. The month numbers are the facility calendar's, not the browser's: the
 * legacy read `date.getMonth()` in the viewer's zone, so a user abroad would see the neighbouring
 * month in the filename (R4). The year comes from the end month, as in the legacy.
 */
const periodLabel = (period: IReportPeriod): string => {
  if (period.fromTheBeginning || period.fromMonth === null || period.toMonth === null) {
    return 'od początku';
  }
  const from = facilityWallClock(period.fromMonth).month;
  const to = facilityWallClock(period.toMonth);
  return `${from}-${to.month}.${to.year}`;
};

/**
 * The CSV filename, reproducing the legacy `generateFileName` pattern (issue #43: "Both CSV
 * exports download with the documented filename pattern").
 *
 * A client export with no resolved client falls back to `Raport clienta.csv`, matching the
 * legacy early return — the tab only enables the button once a summary exists, so the fallback
 * is a guard rather than a path a user reaches. The name is lower-cased, as the legacy did.
 */
const csvFilename = (clientName: string | null, period: IReportPeriod, forAll: boolean): string => {
  if (!forAll && clientName === null) {
    return 'Raport clienta.csv';
  }
  const base = forAll ? 'Wszyscy klienci' : clientName;
  return `${base} (${periodLabel(period)}).csv`.toLowerCase();
};

/**
 * Whether the chosen range can be submitted, and the message to show when it cannot.
 *
 * This is the corrected `updateToMonthDataInForm` (issue #43): the legacy reset `toMonth` to
 * `fromMonth` whenever `fromMonth` changed, silently discarding a deliberately chosen end month.
 * Here the two are independent — changing the start month never touches the end month — and an
 * inverted range is refused with an explicit message instead. The server rejects an inverted
 * range with `422` as well, so the rule is enforced on both sides; the client copy only saves a
 * round trip and explains the problem.
 */
const rangeError = (
  fromMonth: Date | null,
  toMonth: Date | null,
  fromTheBeginning: boolean
): string | null => {
  if (fromTheBeginning) {
    return null;
  }
  if (fromMonth === null || toMonth === null) {
    return 'Wybierz miesiąc początkowy i końcowy.';
  }
  if (fromMonth.getTime() > toMonth.getTime()) {
    return 'Miesiąc początkowy nie może być późniejszy niż końcowy.';
  }
  return null;
};

/**
 * The range as a human label: `od początku` or `MM.yyyy – MM.yyyy`.
 *
 * The month numbers are read through the shared facility wall clock, so the label matches the
 * instant the server widens to a month (R4) rather than the browser's zone.
 */
const periodText = (period: IReportPeriod): string => {
  if (period.fromTheBeginning || period.fromMonth === null || period.toMonth === null) {
    return 'od początku';
  }
  return `${monthLabel(period.fromMonth)} – ${monthLabel(period.toMonth)}`;
};

/** One instant as `MM.yyyy` in the facility's calendar. */
const monthLabel = (month: Date): string => {
  const wall = facilityWallClock(month);
  return `${String(wall.month).padStart(2, '0')}.${wall.year}`;
};

/**
 * The client-details block: the labelled fields that carry a value, in the legacy order.
 *
 * A field with no value is dropped rather than rendered blank, matching the legacy
 * `!isEmpty(client[prop])` guard.
 */
const clientDetailRows = (client: IClient): IDetailRow[] =>
  CLIENT_DETAIL_FIELDS.reduce<IDetailRow[]>((rows, {key, label}) => {
    const raw = client[key];
    if (raw === undefined || raw === null || raw === '') {
      return rows;
    }
    rows.push({label, value: String(raw)});
    return rows;
  }, []);

/** The per-city totals, in the legacy city order, each as "N rezerwacji, w tym M zrealizowanych." */
const cityTotals = (summary: IClientSummary): ICityTotal[] =>
  SUMMARY_CITIES.map((city) => ({
    city,
    label: displayValue(city),
    total: summaryTotalBookingsNumber(summary[city]),
  }));

/** One booking's slots, as the printable report renders them. */
const reportSlots = (booking: IBookedTimeSummary): IReportSlot[] =>
  booking.bookingTimeDetails.map((slot) => ({
    day: formatFacilityDate(new Date(slot.day)),
    hours: `${formatFacilityTime(new Date(slot.startHours))}–${formatFacilityTime(new Date(slot.endHours))}`,
    participants: slot.participants === undefined ? '[Brak]' : String(slot.participants),
    status: displayValue(slot.status),
    comments: slot.comments && slot.comments !== '' ? slot.comments : '[Brak]',
  }));

/** One booking's details, as the printable report renders them. */
const reportEntry = (booking: IBookedTimeSummary): IReportEntry => {
  const {generalBookingDetails} = booking;
  return {
    building: displayValue(generalBookingDetails.building),
    size: toPercentage(generalBookingDetails.size),
    discount: generalBookingDetails.discount === '' ? '0%' : generalBookingDetails.discount,
    payment: displayValue(generalBookingDetails.payment),
    extraOptions: displayBoolean(generalBookingDetails.extraOptions),
    selectedOptions: displaySelectedOptions(generalBookingDetails.selectedOptions),
    comments:
      generalBookingDetails.comments && generalBookingDetails.comments !== ''
        ? generalBookingDetails.comments
        : '[Brak]',
    slots: reportSlots(booking),
  };
};

/**
 * The printable report's content: the client, the per-city totals and every booking's details and
 * slots (FR-030). The component renders this with Angular's escaping, so a client name or a
 * comment cannot inject markup into the report.
 */
const cityReports = (summary: IClientSummary): ICityReport[] =>
  cityTotals(summary).map(({city, label, total}) => ({
    city,
    label,
    total,
    entries: summary[city].map((booking) => reportEntry(booking)),
  }));

export {
  CLIENT_DETAIL_FIELDS,
  periodLabel,
  periodText,
  monthLabel,
  csvFilename,
  rangeError,
  clientDetailRows,
  cityTotals,
  reportSlots,
  reportEntry,
  cityReports,
};
export type {IReportPeriod, IDetailRow, ICityTotal, IReportSlot, IReportEntry, ICityReport};

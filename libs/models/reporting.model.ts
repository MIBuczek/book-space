import {IBookedTime} from './booked-time.model';
import {IClient} from './client.model';
import {ISelectedExtraOption} from './selected-extra-option.model';

/**
 * The cities a summary is grouped by, in the legacy order (`summary-data-const.ts`).
 *
 * Kept as a runtime list and a type from one declaration, like `CITIES`/`CLIENT_TYPES`, so a
 * consumer that iterates the list and a consumer that types a field cannot drift.
 */
const SUMMARY_CITIES = ['siechnice', 'radwanice', 'swieta-katarzyna', 'zerniki-wroclawskie'] as const;
type TSummaryCity = (typeof SUMMARY_CITIES)[number];

/**
 * The booking-level fields a summary repeats for each of its slots (legacy
 * `IGeneralBookingDetails`). They describe the booking, not the slot, so they are held once
 * per booking rather than duplicated onto every slot.
 */
interface IGeneralBookingDetails {
  /** Payment method, as stored (`CASH`/`TRANSFER`/`FREE`). */
  payment: string;
  /** Percentage string such as `10%`, or `''` when none was granted. */
  discount: string;
  extraOptions: boolean;
  selectedOptions: ISelectedExtraOption[];
  comments?: string;
  size: string;
  /** Facility key, as stored (`hala-sportowa`). */
  building: string;
}

interface IBookedTimeSummary {
  generalBookingDetails: IGeneralBookingDetails;
  bookingTimeDetails: IBookedTime[];
}

/** One city's list of bookings, keyed by the city key. */
type TCitySummary = Record<TSummaryCity, IBookedTimeSummary[]>;

/**
 * The per-client summary: the client record plus one list per city. A booking with no linked
 * client is attributed by name, so `client` is `null` only when the caller asked for a client
 * id that does not resolve — the service refuses that case rather than returning a summary
 * with a null client.
 */
interface IClientSummary extends TCitySummary {
  client: IClient;
}

/**
 * One CSV column: the legacy header label and the key its value is read from. The label set
 * and order are the contract (FR-028) — the file must stay readable by the spreadsheets the
 * business already uses, so the labels are Polish and verbatim from `csv-file-headers.ts`.
 */
interface ICSVColumn {
  label: string;
  key: string;
}

/** A single CSV row, keyed by `ICSVColumn.key`. */
type TCSVRow = Record<string, string>;

/**
 * The query `GET /reporting/summary` and `GET /reporting/summary.csv` accept
 * (contracts/openapi.yaml, FR-027–FR-029).
 *
 * `fromMonth`/`toMonth` name a month (the first instant of it); the server widens each to its
 * whole month. `fromTheBeginning` overrides the bounds and reads the whole history. `clientId`
 * is required for the single-client summary and the per-client CSV, and omitted for the
 * all-clients CSV.
 *
 * A request payload shared by the UI that builds it and the server that consumes it, so it lives
 * here rather than in `apps/ui` (constitution, Principle IV): a field rename has to break both.
 */
interface ISummaryQuery {
  clientId?: string;
  fromMonth?: Date;
  toMonth?: Date;
  fromTheBeginning?: boolean;
}

export {SUMMARY_CITIES};
export type {
  TSummaryCity,
  IGeneralBookingDetails,
  IBookedTimeSummary,
  TCitySummary,
  IClientSummary,
  ICSVColumn,
  TCSVRow,
  ISummaryQuery,
};

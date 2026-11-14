import {IBookedTime} from './booked-time.model';
import {IClient} from './client.model';
import {ISelectedExtraOption} from './selected-extra-option.model';

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

/**
 * The per-client summary: the client record plus one list per city, keyed by the city the
 * booking's facility names.
 *
 * The city keys are open (spec.md §9 open question 1): the summary groups by the cities
 * **actually present in the data**, not a compiled-in list, so an administrator-added city is
 * reported like any other. That is why the index signature is a union with the `client` field
 * rather than a `Record<city, …>` — a `client` key would not be assignable to a city's row list,
 * and a closed key union would be the compiled-in list the decision removes.
 */
interface IClientSummary {
  client: IClient;
  [city: string]: IClient | IBookedTimeSummary[];
}

/**
 * The bookings a summary holds for a city, or `[]` when the city has none.
 *
 * The index signature is a union because the object also carries `client`, so a read has to
 * narrow before it can be treated as the city's rows; every consumer that walks the cities
 * (`cityTotals`, `cityReports`, `summariseClient`) goes through this so the narrowing lives in
 * one place.
 */
const cityBookings = (summary: IClientSummary, city: string): IBookedTimeSummary[] => {
  const rows = summary[city];
  return Array.isArray(rows) ? rows : [];
};

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

export type {
  IGeneralBookingDetails,
  IBookedTimeSummary,
  IClientSummary,
  ICSVColumn,
  TCSVRow,
  ISummaryQuery,
};
export {cityBookings};

/**
 * The API payloads the P1 journey specs serve through `cy.intercept`.
 *
 * The e2e project runs against `ui:serve-static` — a static file server with no API behind it
 * — so every response is stubbed at the HTTP boundary. These builders are the single place a
 * payload shape is written down, so a contract change that breaks the UI shows up as one edit
 * rather than a hunt through every spec.
 *
 * The shapes are the API's *response* shapes, not the request ones, and the dates are ISO
 * strings because that is what travels over the wire. The calendar fixture omits the tenant's
 * personal fields exactly as the server's public serialiser does, so a spec cannot accidentally
 * assert on data an anonymous caller would never receive.
 *
 * The types are declared locally rather than imported from `@models/*`: the e2e project is
 * bundled by Cypress, and a workspace path alias that resolves under `tsc` is not guaranteed to
 * resolve in that bundler. A structural type here keeps the spec independent of the build.
 */

/** A facility as the public `GET /buildings` returns it: no contact details, no employees. */
export interface IBuildingFixture {
  _id: string;
  name: string;
  property: string;
  city: string;
  sizes: string[];
  lighting: boolean;
  toilets: boolean;
}

/** The public building builder. */
export const publicBuilding = (
  overrides: Partial<IBuildingFixture> = {}
): IBuildingFixture => ({
  _id: 'facility-1',
  name: 'Hala sportowa',
  property: 'hala-sportowa',
  city: 'siechnice',
  sizes: ['1/3', '2/3', '1/1'],
  lighting: false,
  toilets: false,
  ...overrides,
});

/** The two Siechnice facilities the calendar selects between by default. */
export const PUBLIC_BUILDINGS: IBuildingFixture[] = [
  publicBuilding(),
  publicBuilding({
    _id: 'facility-2',
    name: 'Boisko ze sztuczną nawierzchnią',
    property: 'boisko-sztuczna-nawierzchnia',
    sizes: ['1/1', '1/2', '1/4', '3/4'],
    lighting: true,
    toilets: true,
  }),
];

/** One slot, in the wire shape (`Date`s arrive as ISO strings). */
export interface ISlotFixture {
  day: string;
  startHours: string;
  endHours: string;
  status: 'INITIAL' | 'DONE' | 'CANCELED';
}

/** A booking as it arrives over the wire, with the public read's redactions applied. */
export interface IBookingFixture {
  _id: string;
  type: 'INDIVIDUAL' | 'COMPANY';
  place: {place: string; city: string};
  size: string;
  /** Calendar label; the public read keeps it because the calendar shows it. */
  nick: string;
  month: number;
  bookedTimes: ISlotFixture[];
  accepted: boolean;
  archive: boolean;
  paymentMethod: 'CASH' | 'TRANSFER' | 'FREE';
  extraOptions: boolean;
  selectedOptions: never[];
}

/** The capability matrix the API resolves for an account. */
export interface ICapabilitiesFixture {
  staff: boolean;
  canSeeClientsTab: boolean;
  canSeeFacilitiesTab: boolean;
  canSeeSummaryTab: boolean;
  canApproveBookings: boolean;
  canArchiveBookings: boolean;
  canFilterUnapproved: boolean;
  canSeeConflicts: boolean;
  canManageUsers: boolean;
  canWriteClients: boolean;
  canWriteFacilities: boolean;
  canSendFacilityMessages: boolean;
}

/** The signed-in account as the API returns it (the stored fields plus the capabilities). */
export interface IUserFixture {
  _id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'ADMIN' | 'OFFICE' | 'EMPLOYEE';
  active: boolean;
  capabilities: ICapabilitiesFixture;
}

/** The `{items, total, page, limit}` envelope every list endpoint answers with. */
export const paginated = <T>(
  items: T[]
): {items: T[]; total: number; page: number; limit: number} => ({
  items,
  total: items.length,
  page: 1,
  limit: 25,
});

/** A slot that starts at a facility-local wall-clock hour on a facility-local day. */
export const slot = (
  day: string,
  startHour: number,
  endHour: number,
  status: ISlotFixture['status'] = 'INITIAL'
): ISlotFixture => {
  const pad = (hour: number): string => String(hour).padStart(2, '0');
  return {
    day: `${day}T00:00:00.000Z`,
    startHours: `${day}T${pad(startHour)}:00:00.000Z`,
    endHours: `${day}T${pad(endHour)}:00:00.000Z`,
    status,
  };
};

/**
 * A booking as an *anonymous* caller receives it.
 *
 * `personName`, `personEmail`, `personPhone`, `comments` and `clientId` are absent — the
 * server removes them for a public read (T016), so a spec that renders the calendar is
 * asserting against exactly what the API would have sent.
 */
export const publicBooking = (overrides: Partial<IBookingFixture> = {}): IBookingFixture => ({
  _id: 'booking-1',
  type: 'INDIVIDUAL',
  place: {place: 'hala-sportowa', city: 'siechnice'},
  size: '1/1',
  nick: 'Klub Sportowy',
  month: 0,
  bookedTimes: [slot('2026-03-02', 9, 11)],
  accepted: true,
  archive: false,
  paymentMethod: 'TRANSFER',
  extraOptions: false,
  selectedOptions: [],
  ...overrides,
});

/** An office account: the Clients/Facilities/Summary tabs, no approve/archive. */
export const officeUser = (overrides: Partial<IUserFixture> = {}): IUserFixture => ({
  _id: 'user-1',
  email: 'office@example.com',
  firstName: 'Anna',
  lastName: 'Nowak',
  role: 'OFFICE',
  active: true,
  capabilities: {
    staff: true,
    canSeeClientsTab: true,
    canSeeFacilitiesTab: true,
    canSeeSummaryTab: true,
    canApproveBookings: false,
    canArchiveBookings: false,
    canFilterUnapproved: false,
    canSeeConflicts: false,
    canManageUsers: false,
    canWriteClients: false,
    canWriteFacilities: false,
    canSendFacilityMessages: true,
  },
  ...overrides,
});

/** An administrator: every tab, every action. */
export const administrator = (overrides: Partial<IUserFixture> = {}): IUserFixture =>
  officeUser({
    _id: 'admin-1',
    email: 'admin@example.com',
    role: 'ADMIN',
    capabilities: {
      staff: true,
      canSeeClientsTab: true,
      canSeeFacilitiesTab: true,
      canSeeSummaryTab: true,
      canApproveBookings: true,
      canArchiveBookings: true,
      canFilterUnapproved: true,
      canSeeConflicts: true,
      canManageUsers: true,
      canWriteClients: true,
      canWriteFacilities: true,
      canSendFacilityMessages: true,
    },
    ...overrides,
  });

/** An employee: only the Calendar and Bookings tabs. */
export const employee = (overrides: Partial<IUserFixture> = {}): IUserFixture =>
  officeUser({
    _id: 'employee-1',
    email: 'employee@example.com',
    role: 'EMPLOYEE',
    capabilities: {
      staff: true,
      canSeeClientsTab: false,
      canSeeFacilitiesTab: false,
      canSeeSummaryTab: false,
      canApproveBookings: false,
      canArchiveBookings: false,
      canFilterUnapproved: false,
      canSeeConflicts: false,
      canManageUsers: false,
      canWriteClients: false,
      canWriteFacilities: false,
      canSendFacilityMessages: true,
    },
    ...overrides,
  });

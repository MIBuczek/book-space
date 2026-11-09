import {ChildProcess, spawn} from 'node:child_process';
import {join} from 'node:path';
import bcrypt from 'bcrypt';
import {MongoClient, ObjectId} from 'mongodb';
import {MongoMemoryServer} from 'mongodb-memory-server';

/**
 * A real API and database for the end-to-end journeys (T047, NFR-004).
 *
 * The journeys are only meaningful against the real stack: the browser talks to the Angular
 * dev server, which proxies `/api` to the Nest application, which reads and writes a real
 * `mongod`. Mocking any of the three would test the mock — the public booking read's
 * redaction, the capability-driven navigation and the approve/archive rules are properties of
 * the whole request, not of a component.
 *
 * The database is an ephemeral `mongodb-memory-server` instance, the same one the server's
 * integration suite uses (`apps/server/src/testing`), so CI needs no MongoDB service and no
 * committed fixture data. The `mongod` version is pinned to the version the integration suite
 * pins, so the same commit cannot be tested against two different servers.
 *
 * The Nest bundle is the built artefact (`dist/apps/server/main.js`), started as a child
 * process. It is built before the suite runs by the `ui-e2e:e2e` target's `dependsOn`, so the
 * e2e suite exercises the same bundle CI ships rather than a second, differently-transpiled
 * copy.
 */

const MONGO_VERSION = '8.2.6';
/** The database the server's `MongooseModule.forRoot` hardcodes. */
const DB_NAME = 'book_space';
const API_PORT = 3000;
const API_ORIGIN = `http://127.0.0.1:${API_PORT}`;
const API_URL = `${API_ORIGIN}/api`;
/** At least 32 characters, the floor `env.validation.ts` enforces. */
const JWT_SECRET = 'end-to-end-jwt-secret-value-32-characters';
/** The plaintext password every seeded account shares; the schema hashes it on write. */
const PASSWORD = 'password123';

/** The workspace root, resolved from this file rather than `process.cwd()`. */
const WORKSPACE_ROOT = join(__dirname, '..', '..', '..', '..');

/** A seeded account: the e-mail, the role and the city the account is tied to. */
interface ISeedUser {
  email: string;
  role: 'ADMIN' | 'OFFICE' | 'EMPLOYEE';
  city?: string;
}

/**
 * The accounts the journeys sign in as.
 *
 * Three roles because US2 is about role-appropriate navigation: an employee sees the staff
 * tabs and nothing else, an office account sees the Clients and Facilities tabs, and an
 * administrator additionally sees the Summary tab and the approve/archive actions. The
 * office account is *not* on the Summary deny-list, so its Summary tab is present.
 */
const USERS: readonly ISeedUser[] = [
  {email: 'admin@example.com', role: 'ADMIN'},
  {email: 'office@example.com', role: 'OFFICE', city: 'siechnice'},
  {email: 'employee@example.com', role: 'EMPLOYEE', city: 'siechnice'},
];

const PASSWORD_HASH_ROUNDS = 10;

/** The facility the journeys act on: the first facility of the first city. */
const FACILITY = {place: 'hala-sportowa', city: 'siechnice'};

/**
 * A booking as the seed stores it, before the driver assigns an `_id`.
 *
 * Shaped like the stored document rather than the request body: the seed writes directly to
 * the collection, so it must supply the server-owned fields (`accepted`, `archive`,
 * `createdAt`) the create route would derive.
 */
interface ISeedBooking {
  nick: string;
  accepted: boolean;
  archive?: boolean;
  personName?: string;
  /** Hours the slot runs for, facility-local, on the seeded day. */
  startHour?: number;
  endHour?: number;
  /** How many days from today the slot sits; `0` is today. */
  dayOffset?: number;
}

/**
 * The bookings the database carries at the start of each spec.
 *
 * Two records: an accepted booking the public calendar shows, and an unaccepted one the
 * administrator approves, resolves and archives. Both are placed on the current week so the
 * calendar's default view contains them, and both are `createdAt: now` so the staff list's
 * default period contains them.
 */
const BOOKINGS: readonly ISeedBooking[] = [
  {nick: 'E2E Kalendarz', accepted: true, personName: 'Kalendarz Publiczny', startHour: 10, endHour: 12},
  {nick: 'E2E Do zatwierdzenia', accepted: false, personName: 'Wnioskodawca Testowy', startHour: 14, endHour: 16},
];

export interface E2EBackend {
  /** The connection string the seed writes through. */
  uri: string;
  /** Re-inserts the seed bookings, dropping whatever the previous spec left behind. */
  reset: () => Promise<void>;
  /** Inserts a booking shaped like the stored document, returning its `_id`. */
  insertBooking: (booking: ISeedBooking) => Promise<string>;
  /** The stored booking with this `nick`, or `null`. Used to assert a public submission landed. */
  findBookingByNick: (nick: string) => Promise<Record<string, unknown> | null>;
  /** Stops the API process and the database. */
  stop: () => Promise<void>;
}

let mongo: MongoMemoryServer | undefined;
let server: ChildProcess | undefined;
let client: MongoClient | undefined;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Polls a URL until it answers, or fails with the server's captured output.
 *
 * The API logs its whole route table and every request as JSON lines, so a failed boot is
 * diagnosed from the tail of that output rather than from a bare timeout. `stdio: 'pipe'`
 * captures it for exactly this reason; inheriting it would interleave the logs with the
 * Cypress reporter and lose the tail that matters.
 */
async function waitForApi(serverOutput: () => string, timeoutMs = 90_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${API_URL}/buildings`);
      if (response.ok) {
        const facilities = (await response.json()) as unknown[];
        if (Array.isArray(facilities) && facilities.length > 0) {
          return;
        }
      }
    } catch {
      // Not listening yet.
    }
    await sleep(250);
  }
  throw new Error(`The API did not become ready in ${timeoutMs}ms.\n${serverOutput()}`);
}

/** The instant on `dayOffset` days from now, at the facility-local hour `hour`. */
function slotInstant(hour: number, dayOffset = 0): Date {
  const day = new Date();
  day.setDate(day.getDate() + dayOffset);
  // The seed only needs the slot to fall inside the calendar's current week and to carry a
  // valid day/start/end ordering; the facility-local conversion is the application's concern,
  // so a plain local-time instant is enough here.
  day.setHours(hour, 0, 0, 0);
  return day;
}

/** The stored document a seed booking becomes. */
function bookingDocument(booking: ISeedBooking): Record<string, unknown> {
  const startHour = booking.startHour ?? 10;
  const endHour = booking.endHour ?? 12;
  const day = slotInstant(startHour, booking.dayOffset ?? 0);
  const end = slotInstant(endHour, booking.dayOffset ?? 0);

  return {
    _id: new ObjectId(),
    type: 'INDIVIDUAL',
    place: FACILITY,
    size: '1/1',
    nick: booking.nick,
    personName: booking.personName ?? 'E2E Tester',
    personEmail: 'e2e@example.com',
    personPhone: '123456789',
    month: day.getMonth(),
    bookedTimes: [
      {day, startHours: day, endHours: end, status: 'INITIAL', participants: 0, comments: ''},
    ],
    accepted: booking.accepted,
    archive: booking.archive ?? false,
    rodoAcknowledgement: true,
    comments: '',
    paymentMethod: 'TRANSFER',
    extraOptions: false,
    selectedOptions: [],
    createdAt: new Date(),
  };
}

/**
 * Starts the database and the API, and seeds the accounts.
 *
 * The API is started first and awaited before the accounts are written, so the reference
 * facilities the bootstrap hook seeds exist by the time a spec reads them. Writing the
 * accounts through the driver (rather than the API) is deliberate: there is no
 * unauthenticated user-creation route, and the journeys are about the *client* reaching a
 * seeded world, not about the account-management flow.
 */
export async function startBackend(): Promise<E2EBackend> {
  mongo = await MongoMemoryServer.create({binary: {version: MONGO_VERSION}});
  const uri = mongo.getUri();

  let output = '';
  server = spawn(process.execPath, ['dist/apps/server/main.js'], {
    cwd: WORKSPACE_ROOT,
    env: {
      ...process.env,
      DB_URI: uri,
      JWT_SECRET,
      PORT: String(API_PORT),
      SEED_REFERENCE_DATA: 'true',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout?.on('data', (chunk: Buffer) => (output += chunk.toString()));
  server.stderr?.on('data', (chunk: Buffer) => (output += chunk.toString()));

  await waitForApi(() => output.slice(-4000));

  client = new MongoClient(uri);
  await client.connect();
  // Captured in a `const` so the closures below do not depend on the module-level `let`
  // being narrowed — `client` is optional for the teardown path, but inside a running
  // backend it is always connected.
  const db = client.db(DB_NAME);

  const password = await bcrypt.hash(PASSWORD, PASSWORD_HASH_ROUNDS);
  const users = db.collection('users');
  await users.deleteMany({});
  await users.insertMany(
    USERS.map((user) => ({
      firstName: 'E2E',
      lastName: user.role,
      email: user.email,
      password,
      role: user.role,
      ...(user.city === undefined ? {} : {city: user.city}),
      active: true,
      createdAt: new Date(),
      lastLogin: new Date(),
    }))
  );

  const reset = async () => {
    const bookings = db.collection('bookings');
    await bookings.deleteMany({});
    await bookings.insertMany(BOOKINGS.map(bookingDocument));
  };
  await reset();

  return {
    uri,
    reset,
    insertBooking: async (booking) => {
      const document = bookingDocument(booking);
      await db.collection('bookings').insertOne(document);
      return String(document._id);
    },
    findBookingByNick: async (nick) => db.collection('bookings').findOne({nick}),
    stop: async () => {
      await client?.close();
      server?.kill('SIGKILL');
      await mongo?.stop();
    },
  };
}

export {API_ORIGIN, API_URL, PASSWORD, USERS};

import {getModelToken} from '@nestjs/mongoose';
import {performance} from 'node:perf_hooks';
import {currentAcademicYearRange} from '@booking/date-time';
import {createMongoTestContext, MongoTestContext} from '../testing/mongo-test-context';

/**
 * Booking read performance against a year of data (T050, NFR-009, SC-006, issue #54).
 *
 * The legacy application loaded the whole booking collection on start-up and paginated in
 * memory. The rewrite pushes the period, the filters and the paging into MongoDB, but a
 * claim of "it scales" is worth nothing without a measurement, so this spec seeds a data
 * set the size of a production year and times the three reads the acceptance criteria name:
 *
 *  1. the staff booking list (default academic year) — target under 2 s (NFR-009);
 *  2. the calendar load, which is the same `GET /bookings` list with an explicit period;
 *  3. the per-client summary CSV for a client with 200 bookings — target under 3 s (SC-006).
 *
 * The load-bearing assertion is not the wall-clock number — a shared CI runner is too noisy
 * for a tight bound to mean anything — but that the list query is served by an index rather
 * than a collection scan. A `COLLSCAN` over a year of bookings is the regression that turns
 * a fast read into a slow one, and it is deterministic to detect. The timings are asserted
 * against the specification's own targets, which on an ephemeral `mongod` sit one to two
 * orders of magnitude above the measured value, so a failure means a structural regression
 * rather than a slow runner. The measured numbers are printed so they are visible in CI.
 */
describe('booking read performance over HTTP', () => {
  let ctx: MongoTestContext;
  /**
   * The driver surface this spec drives, declared locally rather than as `Model<Booking>`.
   *
   * `insertMany` takes plain document literals and `explain` returns a query plan the
   * hydrated-document overloads do not describe; typing only the methods used keeps the
   * spec honest about what it touches without pretending the document type fits (the same
   * reason `booking-indexes.integration.spec.ts` declares its own type).
   */
  let bookingModel: {
    insertMany: (docs: Array<Record<string, unknown>>) => Promise<unknown>;
    createIndexes: () => Promise<unknown>;
    find: (filter: Record<string, unknown>) => {
      sort: (spec: Record<string, unknown>) => {
        limit: (n: number) => {explain: (verbosity: string) => Promise<unknown>};
      };
    };
  };
  let clientModel: {create: (doc: Record<string, unknown>) => Promise<{_id: {toString: () => string}}>};
  let userModel: {create: (doc: Record<string, unknown>) => Promise<unknown>};

  const PASSWORD = 'correct horse battery';
  const CITY = 'siechnice';

  // A year of bookings is ~1 200 rows; the extra 300 sit in the previous academic year so
  // the range filter has something it must exclude, and 200 of the in-year rows belong to
  // one client so the CSV target is measured against the size SC-006 names.
  const IN_YEAR = 1200;
  const OUT_OF_YEAR = 300;
  const CSV_BOOKINGS = 200;

  const academic = currentAcademicYearRange(new Date());
  const academicFrom = academic.from.getTime();
  const academicTo = academic.to.getTime();

  const bookingDoc = (createdAt: number, clientId?: string): Record<string, unknown> => ({
    type: 'INDIVIDUAL',
    place: {place: 'hala-sportowa', city: CITY},
    size: '1/1',
    nick: 'Rezerwacja Kowalscy',
    personName: 'Jan Kowalski',
    personEmail: 'jan@example.com',
    personPhone: '500100200',
    month: 3,
    bookedTimes: [
      {
        day: new Date(createdAt),
        startHours: new Date(createdAt),
        endHours: new Date(createdAt + 3_600_000),
        status: 'INITIAL',
        participants: 1,
      },
    ],
    accepted: true,
    archive: false,
    paymentMethod: 'CASH',
    createdAt: new Date(createdAt),
    ...(clientId ? {clientId} : {}),
  });

  beforeAll(async () => {
    ctx = await createMongoTestContext();
    bookingModel = ctx.app.get(getModelToken('Booking'));
    clientModel = ctx.app.get(getModelToken('Client'));
    userModel = ctx.app.get(getModelToken('User'));
  }, 120_000);

  afterAll(async () => {
    await ctx?.close();
  });

  /**
   * Seeds the data set once for the suite. Seeding is the expensive part (1 500 inserts);
   * the reads under test do not mutate it, so it runs once rather than per test.
   */
  let clientId: string;
  beforeAll(async () => {
    await ctx.reset();
    await bookingModel.createIndexes();

    const client = await clientModel.create({
      type: 'COMPANY',
      name: 'Klub Sportowy',
      contactPerson: 'Jan Kowalski',
      phone: '609996064',
      email: 'klub@example.com',
      street: 'ul. Sportowa 1',
      city: CITY,
      zipCode: '55-010',
      nip: '1234567890',
    });
    clientId = client._id.toString();

    const docs: Array<Record<string, unknown>> = [];
    for (let index = 0; index < IN_YEAR; index += 1) {
      const createdAt = academicFrom + Math.floor(((academicTo - academicFrom) * index) / IN_YEAR);
      // The first CSV_BOOKINGS in-year rows carry the client, so its CSV has exactly that many.
      docs.push(bookingDoc(createdAt, index < CSV_BOOKINGS ? clientId : undefined));
    }
    for (let index = 0; index < OUT_OF_YEAR; index += 1) {
      docs.push(bookingDoc(academicFrom - (index + 1) * 3_600_000));
    }
    await bookingModel.insertMany(docs);
  }, 120_000);

  const signIn = async (email: string, role: 'ADMIN' | 'OFFICE' | 'EMPLOYEE'): Promise<string> => {
    await userModel.create({
      firstName: 'Ada',
      lastName: 'Lovelace',
      email,
      password: PASSWORD,
      role,
      city: role === 'ADMIN' ? undefined : CITY,
      active: true,
    });
    const response = await fetch(`${ctx.baseUrl}/auth/sign-in`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({email, password: PASSWORD}),
    });
    expect(response.status).toBe(201);
    return ((await response.json()) as {token: string}).token;
  };

  /** Runs a request and returns its status plus the wall-clock duration in milliseconds. */
  const timed = async (path: string, token?: string): Promise<{status: number; ms: number; body: string}> => {
    const started = performance.now();
    const response = await fetch(`${ctx.baseUrl}${path}`, {
      headers: token ? {authorization: `Bearer ${token}`} : {},
    });
    const body = await response.text();
    return {status: response.status, ms: performance.now() - started, body};
  };

  const report = (label: string, ms: number) => {
    // Printed rather than only asserted: the acceptance criterion is that the numbers are
    // recorded, and a CI log is where a reviewer reads them.
    console.log(`[T050] ${label}: ${ms.toFixed(1)} ms`);
  };

  it('loads the default academic year well under 2 s (NFR-009)', async () => {
    const token = await signIn('list@example.com', 'OFFICE');

    const {status, ms, body} = await timed('/bookings', token);
    report('booking list, default academic year', ms);

    expect(status).toBe(200);
    // The page is the 50-row default, and the range covers the in-year rows only.
    const page = JSON.parse(body) as {items: unknown[]; total: number};
    expect(page.total).toBe(IN_YEAR);
    expect(page.items).toHaveLength(50);
    expect(ms).toBeLessThan(2000);
  });

  it('loads the calendar period well under 2 s (NFR-009)', async () => {
    // The calendar is the same list route with an explicit period; an anonymous caller is
    // what the public calendar is, so this also covers the public read path.
    const from = new Date(academicFrom).toISOString();
    const to = new Date(academicTo).toISOString();

    const {status, ms, body} = await timed(`/bookings?from=${from}&to=${to}`);
    report('calendar (public list with period)', ms);

    expect(status).toBe(200);
    const page = JSON.parse(body) as {items: unknown[]; total: number};
    expect(page.total).toBe(IN_YEAR);
    expect(ms).toBeLessThan(2000);
  });

  it('exports a 200-booking client summary under 3 s (SC-006)', async () => {
    const token = await signIn('csv@example.com', 'OFFICE');

    const {status, ms, body} = await timed(
      `/reporting/summary.csv?clientId=${clientId}&fromTheBeginning=true`,
      token
    );
    report('summary CSV, client with 200 bookings', ms);

    expect(status).toBe(200);
    // The header row plus one row per slot: 200 bookings, one slot each.
    expect(body.trim().split('\r\n')).toHaveLength(CSV_BOOKINGS + 1);
    expect(ms).toBeLessThan(3000);
  });

  it('serves the list from an index rather than a collection scan', async () => {
    // The query the service builds for the default staff list, run through the planner
    // directly so the plan is observable. A `COLLSCAN` here is the regression that would
    // make the timing above fail on a larger data set than a test seeds.
    const explained = (await bookingModel
      .find({archive: false, accepted: true, createdAt: {$gte: new Date(academicFrom), $lte: new Date(academicTo)}})
      .sort({createdAt: -1, _id: -1})
      .limit(50)
      .explain('executionStats')) as {
      queryPlanner: {winningPlan: Record<string, unknown>};
      executionStats: {totalDocsExamined: number};
    };

    // The plan is a tree — `LIMIT` wraps `FETCH` wraps `IXSCAN` — so the stages are
    // collected by walking every `inputStage` rather than reading the two top levels. A
    // named index is not asserted, because MongoDB is free to choose which eligible index
    // to use.
    const stages: string[] = [];
    const walk = (node: Record<string, unknown> | undefined): void => {
      if (!node || typeof node.stage !== 'string') {
        return;
      }
      stages.push(node.stage);
      walk(node.inputStage as Record<string, unknown> | undefined);
    };
    walk(explained.queryPlanner.winningPlan);

    expect(stages).toContain('IXSCAN');
    expect(stages).not.toContain('COLLSCAN');

    // An index scan reads the page, not the collection. A collection scan would examine
    // every one of the 1 500 rows; the bound is far above the 50-row page and far below
    // the collection, so it fails only if the index stopped being used.
    expect(explained.executionStats.totalDocsExamined).toBeLessThan(IN_YEAR + OUT_OF_YEAR);
  });
});

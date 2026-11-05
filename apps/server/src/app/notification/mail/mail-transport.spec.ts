import {createServer, IncomingMessage, Server, ServerResponse} from 'node:http';
import {AddressInfo} from 'node:net';
import {StructuredLogger} from '../../logging/structured-logger';
import {HttpMailTransport, UnconfiguredMailTransport} from './mail-transport';

/**
 * The transport is asserted against a real local HTTP server rather than a mocked `fetch`. The
 * behaviour that matters — the request shape, the bearer token, a non-2xx answer failing the
 * send — is only visible when a real request is made, and a `fetch` stub would pass whether or
 * not the body and headers were what a provider expects.
 */
describe('HttpMailTransport', () => {
  let server: Server;
  let endpoint: string;
  let received: Array<{authorization?: string; body: Record<string, unknown>}>;
  let status = 200;

  beforeAll(async () => {
    received = [];
    server = createServer((req: IncomingMessage, res: ServerResponse) => {
      let raw = '';
      req.on('data', (chunk) => (raw += chunk));
      req.on('end', () => {
        received.push({authorization: req.headers.authorization, body: JSON.parse(raw)});
        res.writeHead(status, {'content-type': 'application/json'});
        res.end('{}');
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const {port} = server.address() as AddressInfo;
    endpoint = `http://127.0.0.1:${port}/send`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    received.length = 0;
    status = 200;
  });

  const logger = {log: () => undefined, warn: () => undefined, error: () => undefined} as unknown as StructuredLogger;

  it('POSTs the message as JSON with the sender and optional bearer token', async () => {
    const transport = new HttpMailTransport({endpoint, from: 'bookings@example.com', apiKey: 'secret-key'}, logger);

    await transport.send({to: 'facility@example.com', subject: 'Temat', text: 'Treść'});

    expect(received).toHaveLength(1);
    expect(received[0].authorization).toBe('Bearer secret-key');
    expect(received[0].body).toEqual({
      from: 'bookings@example.com',
      to: 'facility@example.com',
      subject: 'Temat',
      text: 'Treść',
    });
  });

  it('omits the authorization header when no key is configured', async () => {
    const transport = new HttpMailTransport({endpoint, from: 'bookings@example.com'}, logger);
    await transport.send({to: 'facility@example.com', subject: 'Temat', text: 'Treść'});
    expect(received[0].authorization).toBeUndefined();
  });

  it('fails the send when the provider answers a non-2xx status', async () => {
    status = 500;
    const transport = new HttpMailTransport({endpoint, from: 'bookings@example.com'}, logger);
    await expect(transport.send({to: 'facility@example.com', subject: 'Temat', text: 'Treść'})).rejects.toThrow(
      'Mail provider answered 500'
    );
  });

  it('fails the send when the endpoint is unreachable', async () => {
    // Port 1 is not listening, so the connection is refused.
    const transport = new HttpMailTransport({endpoint: 'http://127.0.0.1:1/send', from: 'a@example.com'}, logger);
    await expect(transport.send({to: 'facility@example.com', subject: 'Temat', text: 'Treść'})).rejects.toThrow(
      'Mail provider request failed'
    );
  });

  it('aborts a send that exceeds the timeout', async () => {
    // A server that never answers, so the only way out is the timeout.
    const silent = createServer(() => undefined);
    await new Promise<void>((resolve) => silent.listen(0, '127.0.0.1', resolve));
    const {port} = silent.address() as AddressInfo;

    const transport = new HttpMailTransport(
      {endpoint: `http://127.0.0.1:${port}/send`, from: 'a@example.com'},
      logger,
      50
    );
    await expect(transport.send({to: 'facility@example.com', subject: 'Temat', text: 'Treść'})).rejects.toThrow(
      'Mail provider request failed'
    );
    await new Promise<void>((resolve) => silent.close(() => resolve()));
  });
});

describe('UnconfiguredMailTransport', () => {
  it('fails every send rather than dropping it silently', async () => {
    const transport = new UnconfiguredMailTransport();
    await expect(transport.send()).rejects.toThrow('not configured');
  });
});

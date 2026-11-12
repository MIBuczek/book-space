import {
  AdministratorExistsError,
  MissingFieldError,
} from './bootstrap';
import type {IUserModel} from './bootstrap';
import {parseArgs, run, USAGE} from './cli';

/**
 * The bootstrap tool's argument parsing and exit codes, driven without a database.
 *
 * The write itself is proved against a real `mongod` in `bootstrap.integration.spec.ts`; this
 * spec covers the parts that are pure — how a flag is read, which value wins, and which exit code
 * each outcome produces — because those are the branches a caller branches on and they need no
 * server.
 */

const fakeUserModel = (overrides: Partial<IUserModel> = {}): IUserModel => ({
  countDocuments: jest.fn().mockResolvedValue(0),
  create: jest.fn().mockResolvedValue({}),
  createIndexes: jest.fn().mockResolvedValue(undefined),
  ...overrides,
});

/** A connection stand-in whose only real behaviour is handing back the fake model and closing. */
const fakeConnect = (userModel: IUserModel) => {
  const close = jest.fn().mockResolvedValue(undefined);
  const connect = jest.fn().mockResolvedValue({
    models: {},
    model: () => userModel,
    close,
  });
  return {connect, close};
};

describe('parseArgs', () => {
  it('reads a value given as a separate argument', () => {
    const cli = parseArgs(
      ['--target', 'mongodb://db', '--email', 'a@b.com', '--password', 'secret1'],
      {}
    );
    expect(cli.target).toBe('mongodb://db');
    expect(cli.administrator).toEqual({
      email: 'a@b.com',
      password: 'secret1',
      firstName: 'Administrator',
      lastName: 'Administrator',
    });
  });

  it('reads a value given inline with `=`', () => {
    const cli = parseArgs(['--target=mongodb://db', '--email=a@b.com'], {
      BOOTSTRAP_ADMIN_PASSWORD: 'from-env',
    });
    expect(cli.target).toBe('mongodb://db');
    expect(cli.administrator.email).toBe('a@b.com');
    expect(cli.administrator.password).toBe('from-env');
  });

  it('prefers a --password flag over the environment variable', () => {
    const cli = parseArgs(['--target', 'mongodb://db', '--password', 'from-flag'], {
      BOOTSTRAP_ADMIN_PASSWORD: 'from-env',
    });
    expect(cli.administrator.password).toBe('from-flag');
  });

  it('takes the password from the environment when no flag is given', () => {
    const cli = parseArgs(['--target', 'mongodb://db'], {BOOTSTRAP_ADMIN_PASSWORD: 'from-env'});
    expect(cli.administrator.password).toBe('from-env');
  });

  it('accepts explicit names', () => {
    const cli = parseArgs(
      ['--target', 'mongodb://db', '--first-name', 'Anna', '--last-name', 'Nowak'],
      {}
    );
    expect(cli.administrator.firstName).toBe('Anna');
    expect(cli.administrator.lastName).toBe('Nowak');
  });

  it('rejects an unknown flag rather than ignoring it', () => {
    expect(() => parseArgs(['--target', 'mongodb://db', '--dryrun'], {})).toThrow(
      /Unknown flag --dryrun/
    );
  });

  it('ignores a bare positional argument rather than reading it as a flag', () => {
    const cli = parseArgs(['serve', '--target', 'mongodb://db'], {});
    expect(cli.target).toBe('mongodb://db');
  });

  it('rejects a flag whose value is missing', () => {
    expect(() => parseArgs(['--target'], {})).toThrow(/--target needs a value/);
  });

  it('rejects a flag whose value is the next flag', () => {
    expect(() => parseArgs(['--target', '--email', 'a@b.com'], {})).toThrow(
      /--target needs a value/
    );
  });

  it('requires a target and reports the usage', () => {
    expect(() => parseArgs(['--email', 'a@b.com'], {})).toThrow(new RegExp(USAGE.slice(0, 20)));
  });

  it('leaves email and password blank when neither flag nor variable supplies them', () => {
    const cli = parseArgs(['--target', 'mongodb://db'], {});
    expect(cli.administrator.email).toBe('');
    expect(cli.administrator.password).toBe('');
  });
});

describe('run', () => {
  const baseCli = {
    target: 'mongodb://db',
    administrator: {
      email: 'admin@example.com',
      password: 'secret1',
      firstName: 'Administrator',
      lastName: 'Administrator',
    },
  };

  it('returns 0 and reports the created address on success', async () => {
    const {connect} = fakeConnect(fakeUserModel());
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);

    await expect(run(baseCli, {connect})).resolves.toBe(0);
    expect(log).toHaveBeenCalledWith('Created the first administrator: admin@example.com');

    log.mockRestore();
  });

  it('returns 0 when an administrator already exists, so a re-run does not fail a script', async () => {
    const {connect} = fakeConnect(
      fakeUserModel({countDocuments: jest.fn().mockResolvedValue(1)})
    );
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);

    await expect(run(baseCli, {connect})).resolves.toBe(0);
    expect(log).toHaveBeenCalledWith(new AdministratorExistsError().message);

    log.mockRestore();
  });

  it('returns 1 when a required field is missing', async () => {
    const {connect} = fakeConnect(fakeUserModel());
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const cli = {...baseCli, administrator: {...baseCli.administrator, password: ''}};
    await expect(run(cli, {connect})).resolves.toBe(1);
    expect(error).toHaveBeenCalledWith(new MissingFieldError('password').message);

    error.mockRestore();
  });

  it('returns 1 on an unexpected failure, with the message on stderr', async () => {
    const connect = jest.fn().mockRejectedValue(new Error('connection refused'));
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(run(baseCli, {connect})).resolves.toBe(1);
    expect(error).toHaveBeenCalledWith('connection refused');

    error.mockRestore();
  });
});

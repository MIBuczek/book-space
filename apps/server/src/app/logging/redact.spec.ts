import {redact} from './redact';

/**
 * Log records are written to stdout, which in production is collected and
 * indexed, so a password or a token that reaches a log record is disclosed to
 * everyone with log access and retained beyond the request. Redaction is
 * centralised here rather than left to each call site, because a call site
 * added later would otherwise have to remember.
 */
describe('redact', () => {
  it('masks a password', () => {
    expect(redact({password: 'hunter2'})).toEqual({password: '[redacted]'});
  });

  it('masks an e-mail address by its key', () => {
    expect(redact({email: 'a@b.c'})).toEqual({email: '[redacted]'});
  });

  it('masks a token and an authorization header regardless of case', () => {
    expect(redact({token: 'eyJhbGci', Authorization: 'Bearer abc'})).toEqual({
      token: '[redacted]',
      Authorization: '[redacted]',
    });
  });

  it('masks a personal e-mail address', () => {
    // The acceptance criterion is that no personal e-mail appears in logs, so
    // the field is masked wherever it appears rather than only in the auth path.
    expect(redact({personEmail: 'anna@example.com'})).toEqual({
      personEmail: '[redacted]',
    });
  });

  it('masks an e-mail address even under a key that does not name it', () => {
    // A notification failure logs the provider response; the recipient can
    // arrive under a key such as `recipient`, which the key patterns miss.
    expect(redact({recipient: 'anna@example.com'})).toEqual({recipient: '[redacted]'});
  });

  it('masks a sensitive value nested in an object', () => {
    expect(redact({user: {_id: '1', password: 'hunter2'}})).toEqual({
      user: {_id: '1', password: '[redacted]'},
    });
  });

  it('masks a sensitive value nested in an array', () => {
    expect(redact({users: [{password: 'a'}, {password: 'b'}]})).toEqual({
      users: [{password: '[redacted]'}, {password: '[redacted]'}],
    });
  });

  it('leaves non-sensitive values untouched', () => {
    expect(redact({_id: '507f1f77bcf86cd799439011', status: 201, ok: true})).toEqual({
      _id: '507f1f77bcf86cd799439011',
      status: 201,
      ok: true,
    });
  });

  it('survives a circular reference instead of throwing while logging', () => {
    const value: Record<string, unknown> = {_id: '1'};
    value.self = value;

    expect(() => redact(value)).not.toThrow();
  });
});

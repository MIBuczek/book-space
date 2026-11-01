import {HttpException, HttpStatus} from '@nestjs/common';
import {errorMessage, errorStatus} from './http-error';

describe('errorMessage', () => {
  it('reads the message from an Error', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom');
  });

  it('reads the message from a Mongoose-shaped object that is not an Error', () => {
    expect(errorMessage({message: 'E11000 duplicate key', code: 11000})).toBe(
      'E11000 duplicate key',
    );
  });

  it('reads a thrown string', () => {
    expect(errorMessage('plain string')).toBe('plain string');
  });

  it('falls back when there is no usable message', () => {
    expect(errorMessage(undefined)).toBe('Internal server error');
    expect(errorMessage(null)).toBe('Internal server error');
    expect(errorMessage({message: 42})).toBe('Internal server error');
    expect(errorMessage({})).toBe('Internal server error');
  });
});

describe('errorStatus', () => {
  it('keeps the status of an HttpException', () => {
    expect(errorStatus(new HttpException('nope', HttpStatus.FORBIDDEN))).toBe(HttpStatus.FORBIDDEN);
  });

  it('treats an unexpected error as a 500', () => {
    expect(errorStatus(new Error('E11000 duplicate key'))).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
  });

  it('does not yield undefined for an error with no status', () => {
    // `new HttpException(message, undefined)` makes Nest answer 200 OK, reporting a
    // failed database write as success. The status must always be a real number.
    const mongooseLike = Object.assign(new Error('E11000 duplicate key'), {code: 11000});

    expect(errorStatus(mongooseLike)).not.toBeUndefined();
    expect(Number.isInteger(errorStatus(mongooseLike))).toBe(true);
  });

  it('rejects a status taken from a non-HttpException', () => {
    // Guards the exact defect: reading `.status` off a Mongoose error is `undefined`.
    const mongooseLike = Object.assign(new Error('E11000 duplicate key'), {code: 11000});

    expect(errorStatus(mongooseLike)).toBe(500);
    expect(errorStatus(mongooseLike)).not.toBe(200);
  });
});

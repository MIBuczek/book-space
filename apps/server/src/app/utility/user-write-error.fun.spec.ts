import {handleUserWriteError} from './user-write-error.fun';

/**
 * The mapping a user write relies on to turn a driver error into a message the
 * contract declares. Every branch is asserted, including the fall-through, because a
 * branch that stops matching would otherwise surface as an unmapped driver message in
 * an API response.
 */
describe('handleUserWriteError', () => {
  it('maps a failed password confirmation', () => {
    expect(handleUserWriteError(new Error('Incorrect recheck_password'))).toBe('Passwords not match each other');
  });

  it('maps a duplicate e-mail to the registered message', () => {
    expect(handleUserWriteError({code: 11000, message: 'E11000 duplicate key'})).toBe(
      'That email is already registered'
    );
  });

  it('joins the individual messages of a Mongoose validation failure', () => {
    // The shape a real Mongoose ValidationError has: `name` is what identifies it,
    // and the message begins with the capitalised model name.
    const error = {
      name: 'ValidationError',
      message: 'User validation failed: role: Please assign a role',
      errors: {
        role: {properties: {message: 'Please assign a role'}},
        email: {properties: {message: 'Please enter a valid email'}},
      },
    };

    expect(handleUserWriteError(error)).toBe('Please assign a role,Please enter a valid email');
  });

  it('passes an unrecognised message through unchanged', () => {
    expect(handleUserWriteError(new Error('connection lost'))).toBe('connection lost');
  });

  it('does not map the sign-in messages it used to', () => {
    // These strings are the enumeration oracle T013 removed. Asserting they are no
    // longer mapped stops them being reintroduced here, where a reader might assume
    // this is still the auth error mapper.
    expect(handleUserWriteError(new Error('Incorrect email'))).toBe('Incorrect email');
    expect(handleUserWriteError(new Error('Incorrect password'))).toBe('Incorrect password');
  });
});

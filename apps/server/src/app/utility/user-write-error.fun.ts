/**
 * Maps the errors a user write can raise onto the messages the contract declares.
 *
 * It does not map sign-in failures. It used to turn "Incorrect email" and "Incorrect
 * password" into two distinct sentences, which made `/auth/sign-in` answer
 * differently depending on whether an address was registered — an enumeration
 * oracle. Sign-in now raises one message of its own and this function is not in that
 * path; the branches that produced those sentences are gone rather than left dead,
 * because leaving them invites reusing them.
 */
const handleUserWriteError = (err: any): string => {
  /* incorrect password match */
  if (err.message === 'Incorrect recheck_password') {
    return 'Passwords not match each other';
  }

  /* duplicate email error */
  if (err.code === 11000) {
    return 'That email is already registered';
  }

  /*
   * Matched on the error name, not on the message text. The previous check was
   * `message.includes('user validation failed')`, which never matched: Mongoose
   * capitalises the model name, so the real message is "User validation failed: ...".
   * The branch was dead, and a validation failure returned the raw Mongoose message
   * (including the field path) instead of the declared messages.
   */
  if (err?.name === 'ValidationError' && err.errors) {
    return Object.values(err.errors as any[])
      .map(({properties}) => {
        return properties.message;
      })
      .join(',');
  }

  return err.message;
};

export {handleUserWriteError};

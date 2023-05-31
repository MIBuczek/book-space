const handleAuthErrors = (err: any): string => {
  /* incorrect email */
  if (err.message === 'Incorrect email') {
    return 'That email is not registered';
  }

  /* incorrect password */
  if (err.message === 'Incorrect password') {
    return 'That password is incorrect';
  }

  /* incorrect password match */
  if (err.message === 'Incorrect recheck_password') {
    return 'Passwords not match each other';
  }

  /* duplicate email error */
  if (err.code === 11000) {
    return 'That email is already registered';
  }

  /* validation errors */
  if (err.message.includes('user validation failed')) {
    return Object.values(err.errors as any[])
      .map(({properties}) => {
        return properties.message;
      })
      .join(',');
  }
};

export {handleAuthErrors};

import { IValidationError } from '@models/validation-error.model';

const handleAuthErrors = (err: any) => {
  const errors: IValidationError = {
    nick: '',
    email: '',
    password: '',
    recheck_password: '',
  };

  /* incorrect email */
  if (err.message === 'Incorrect email') {
    errors.email = 'That email is not registered';
  }

  /* incorrect password */
  if (err.message === 'Incorrect password') {
    errors.password = 'That password is incorrect';
  }

  /* incorrect password match */
  if (err.message === 'Incorrect recheck_password') {
    errors.recheck_password = 'Passwords not match each other';
  }

  /* duplicate email error */
  if (err.code === 11000) {
    errors.email = 'That email is already registered';
    return errors;
  }

  /* validation errors */
  if (err.message.includes('user validation failed')) {
    Object.values(err.errors as any[]).forEach(({ properties }) => {
      errors[properties.path] = properties.message;
    });
  }

  return errors;
};

export { handleAuthErrors };

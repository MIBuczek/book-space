/**
 * The body of a 422 from `contracts/openapi.yaml`: `message` is the list of
 * field errors, and `error` is the status text.
 */
interface IValidationError {
  statusCode: number;
  message: string[];
  error: string;
}

export {IValidationError};

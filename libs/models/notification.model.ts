/**
 * The body of `POST /notifications/message` (contracts/openapi.yaml, FR-034, FR-041).
 *
 * One route serves two audiences, told apart by `recipient`:
 *
 * - **without `recipient`** it is the public contact form (FR-034) and the server delivers it
 *   to the configured SISK inbox;
 * - **with `recipient`** it is the Facilities-tab message to a selected facility employee
 *   (FR-041), delivered to that address.
 *
 * `email` is the *sender's* address, carried in the body so the recipient can answer directly;
 * `recipient` is the *destination*. They are deliberately separate fields: the legacy
 * `Building.tsx` form pre-filled its single `email` field with the facility address and let
 * the EmailJS template use it as the destination, which made "who is answering" and "who
 * receives this" the same value. Here the destination is explicit.
 *
 * `phone` is optional and only the public contact form supplies it; the employee variant's
 * template (`employee-message`) declares `person`, `email` and `message` and no phone.
 */
interface IMessageRequest {
  person: string;
  email: string;
  message: string;
  phone?: string;
  /** The destination. Omitted for the public contact form, which goes to the SISK inbox. */
  recipient?: string;
}

export {IMessageRequest};

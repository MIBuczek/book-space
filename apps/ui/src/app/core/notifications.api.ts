import {HttpClient} from '@angular/common/http';
import {inject, Injectable} from '@angular/core';
import {IBookingNotificationRequest, IMessageRequest} from '@models/notification.model';
import {Observable} from 'rxjs';

/** What the send answers: the API's acknowledgement that the message was accepted. */
interface IMessageResponse {
  status: string;
}

/**
 * The outbound notifications the UI can trigger.
 *
 * `POST /notifications/message` is public for the contact form (FR-034) and accepts a
 * `recipient` for the employee message (FR-041); the server resolves the destination from that
 * field and never from a facility lookup, so the Facilities tab has to supply the employee's
 * address. A provider failure answers `502` (FR-036), which the tab surfaces as a visible error
 * rather than a silent no-op — the legacy error branch was commented out, which is the defect
 * T038 exists to correct.
 *
 * `POST /notifications/booking` is the operator's booking notification (FR-032, FR-033) and its
 * `APPLICANT` audience is the decision notification (FR-052, T062). The recipient is resolved
 * server-side in every case, so the UI sends only the booking id and the audience and can never
 * name an address to send to. The service takes the shared request types rather than hand-built
 * objects, so the UI cannot send a field the contract does not allow
 * (`whitelist`/`forbidNonWhitelisted` would reject it) and cannot forget a required one.
 */
@Injectable({providedIn: 'root'})
export class NotificationsApi {
  private readonly http = inject(HttpClient);

  /** Sends a message; with a `recipient` it goes to that facility employee (FR-041). */
  sendMessage(request: IMessageRequest): Observable<IMessageResponse> {
    return this.http.post<IMessageResponse>('/api/notifications/message', request);
  }

  /**
   * Sends a booking notification. `APPLICANT` tells the requestor their booking was approved
   * or rejected (FR-052); the recipient and the approved/rejected wording are resolved from the
   * booking server-side, so the UI decides only *whether* to send, not to whom or what.
   */
  notifyBooking(request: IBookingNotificationRequest): Observable<IMessageResponse> {
    return this.http.post<IMessageResponse>('/api/notifications/booking', request);
  }
}

export type {IMessageResponse};

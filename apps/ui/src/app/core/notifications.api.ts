import {HttpClient} from '@angular/common/http';
import {inject, Injectable} from '@angular/core';
import {IMessageRequest} from '@models/notification.model';
import {Observable} from 'rxjs';

/** What the send answers: the API's acknowledgement that the message was accepted. */
interface IMessageResponse {
  status: string;
}

/**
 * The outbound message the Facilities tab sends (FR-041).
 *
 * `POST /notifications/message` is public for the contact form (FR-034) and accepts a
 * `recipient` for the employee message; the server resolves the destination from that field
 * and never from a facility lookup, so the tab has to supply the employee's address. A
 * provider failure answers `502` (FR-036), which the tab surfaces as a visible error rather
 * than a silent no-op — the legacy error branch was commented out, which is the defect T038
 * exists to correct.
 *
 * The service takes the shared `IMessageRequest` rather than a hand-built object, so the tab
 * cannot send a field the contract does not allow (`whitelist`/`forbidNonWhitelisted` would
 * reject it) and cannot forget the required `person`, `email` or `message`.
 */
@Injectable({providedIn: 'root'})
export class NotificationsApi {
  private readonly http = inject(HttpClient);

  /** Sends a message; with a `recipient` it goes to that facility employee (FR-041). */
  sendMessage(request: IMessageRequest): Observable<IMessageResponse> {
    return this.http.post<IMessageResponse>('/api/notifications/message', request);
  }
}

export type {IMessageResponse};

import {Component, computed, inject, linkedSignal, signal} from '@angular/core';
import {HttpErrorResponse} from '@angular/common/http';
import {rxResource} from '@angular/core/rxjs-interop';
import {TranslatePipe} from '@ngx-translate/core';
import {injectTranslate} from '@booking/i18n';
import {CITIES, CITY_LABELS, IBuilding, TCity} from '@models/building.model';
import {FacilitiesApi} from '../../../core/facilities.api';
import {NotificationsApi} from '../../../core/notifications.api';
import {SessionStore} from '../../../core/session.store';
import {
  ButtonComponent,
  ISelectOption,
  InputComponent,
  SelectComponent,
  TableComponent,
} from '../../../shared/ui';
import {
  buildMessageRequest,
  emptyEmployeeMessage,
  employeeOptions,
  facilityDetails,
  sendFailureMessage,
  validateEmployeeMessage,
} from './facilities-tab';
import type {IEmployeeMessageValue, TEmployeeMessageErrors} from './facilities-tab';

const CITY_OPTIONS: ISelectOption[] = CITIES.map((city) => ({value: city, label: CITY_LABELS[city]}));

const EMPLOYEE_COLUMNS = [{key: 'name', label: 'facilities.employeeColumn'}];

/**
 * The admin facilities tab (FR-009, FR-041, issue #42).
 *
 * The legacy `Building.tsx` showed the selected facility's details and employee list and let an
 * administrator message a chosen employee, but it read the facility from a compiled-in constant
 * and fell back to it when the API had none. This tab reads `GET /buildings` as staff — the
 * full record, including the contact details and the employee list the public read removes —
 * and there is no fallback: a facility that is not in the API is simply not shown.
 *
 * The message goes through `POST /notifications/message` with a `recipient`, the route T031
 * built for exactly this action (FR-041). The destination is the employee's address the
 * operator supplies; the sender's address is the facility's contact address, so a reply returns
 * to the facility. A failed send is surfaced rather than swallowed — the legacy error branch was
 * commented out, which is the defect acceptance criterion 3 names.
 *
 * State is signals because the app is zoneless. The detail rows, the employee options and the
 * selected facility are `computed`, so a reload or a city change recomputes them without a
 * manual sync; the message form is a `linkedSignal` on the selected facility, so it re-fills
 * with the facility's address and first employee whenever the selection changes.
 */
@Component({
  selector: 'book-space-facilities-tab',
  imports: [ButtonComponent, InputComponent, SelectComponent, TableComponent, TranslatePipe],
  template: `
    <section class="bs-page">
      <h1>{{ 'facilities.title' | translate }}</h1>

      <div class="bs-facilities__controls">
        <book-space-select
          [label]="'facilities.city' | translate"
          [options]="cityOptions"
          [value]="city()"
          (valueChange)="onCity($event)"
        />
        <book-space-select
          [label]="'facilities.facility' | translate"
          [options]="facilityOptions()"
          [value]="selectedProperty()"
          (valueChange)="onFacility($event)"
        />
      </div>

      @if (facilitiesResource.isLoading()) {
        <p role="status">{{ 'facilities.loading' | translate }}</p>
      } @else if (facilitiesResource.status() === 'error') {
        <p role="alert">{{ 'facilities.loadError' | translate }}</p>
      } @else if (selectedFacility(); as facility) {
        <section class="bs-facilities__details" [attr.aria-label]="'facilities.detailsAria' | translate">
          <h2>{{ 'facilities.detailsHeading' | translate }}</h2>
          <dl>
            @for (row of details(); track row.label) {
              <dt>{{ row.label }}</dt>
              <dd>{{ row.value }}</dd>
            }
          </dl>
        </section>

        <section class="bs-facilities__employees" [attr.aria-label]="'facilities.employeesAria' | translate">
          <h2>{{ 'facilities.employeesHeading' | translate }}</h2>
          <book-space-table
            [caption]="'facilities.employeesCaption' | translate"
            trackKey="name"
            [columns]="employeeColumns"
            [rows]="employeeRows()"
            [emptyMessage]="'facilities.employeesEmpty' | translate"
          >
            @if (canSend()) {
              <ng-template #rowActions let-row>
                <book-space-button variant="secondary" (pressed)="startMessage(row.name)">
                  {{ 'facilities.messageAction' | translate }}
                </book-space-button>
              </ng-template>
            }
          </book-space-table>
        </section>

        @if (canSend()) {
          <section class="bs-facilities__message" [attr.aria-label]="'facilities.messageAria' | translate">
            <h2>{{ 'facilities.messageHeading' | translate }}</h2>

            <book-space-select
              [label]="'facilities.messagePerson' | translate"
              [options]="employees()"
              [value]="form().person"
              [error]="fieldErrors().person ?? null"
              (valueChange)="updateMessage({person: $event})"
            />
            <book-space-input
              [label]="'facilities.messageEmail' | translate"
              type="email"
              [value]="form().recipient"
              [error]="fieldErrors().recipient ?? null"
              (valueChange)="updateMessage({recipient: $event})"
            />
            <label class="bs-field">
              <span class="bs-field__label">{{ 'facilities.messageBody' | translate }}</span>
              <textarea
                [value]="form().message"
                (input)="updateMessage({message: $any($event.target).value})"
              ></textarea>
            </label>
            @if (fieldErrors().message; as messageError) {
              <p class="bs-facilities__error" role="alert">{{ messageError }}</p>
            }

            @if (sendError(); as message) {
              <p class="bs-facilities__error" role="alert">{{ message }}</p>
            }
            @if (sendSuccess(); as message) {
              <p class="bs-facilities__success" role="status">{{ message }}</p>
            }

            <div class="bs-facilities__message-actions">
              <book-space-button variant="primary" (pressed)="send()" [disabled]="sending()">
                {{ 'facilities.send' | translate }}
              </book-space-button>
            </div>
          </section>
        }
      } @else {
        <p>{{ 'facilities.noFacilities' | translate }}</p>
      }
    </section>
  `,
  styles: [
    `
      .bs-page {
        padding: 1rem 0;
      }
      .bs-facilities__controls {
        display: flex;
        align-items: flex-end;
        gap: 1rem;
        flex-wrap: wrap;
        margin-bottom: 1rem;
      }
      .bs-facilities__details dl {
        display: grid;
        grid-template-columns: max-content 1fr;
        gap: 0.25rem 1rem;
        margin: 0;
      }
      .bs-facilities__details dt {
        font-weight: 600;
      }
      .bs-facilities__details dd {
        margin: 0;
      }
      .bs-facilities__employees,
      .bs-facilities__message {
        margin-top: 1rem;
      }
      .bs-facilities__message {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        max-width: 32rem;
      }
      .bs-facilities__message-actions {
        display: flex;
        gap: 0.75rem;
      }
      .bs-facilities__error {
        color: #a4262c;
      }
      .bs-facilities__success {
        color: #2f6f3e;
      }
    `,
  ],
})
export class FacilitiesTabComponent {
  private readonly facilitiesApi = inject(FacilitiesApi);
  private readonly notificationsApi = inject(NotificationsApi);
  private readonly session = inject(SessionStore);

  private readonly t = injectTranslate();
  readonly cityOptions = CITY_OPTIONS;
  readonly employeeColumns = EMPLOYEE_COLUMNS;

  readonly city = signal<TCity>('siechnice');
  /** The chosen facility key; the selection falls back to the city's first while it is unset. */
  readonly property = signal('');

  readonly submitted = signal(false);
  readonly sending = signal(false);
  readonly sendError = signal<string | null>(null);
  readonly sendSuccess = signal<string | null>(null);

  /** The message-to-employee action is available to every staff member (matrix, `Building.tsx`). */
  readonly canSend = computed(() => this.session.capabilities()?.canSendFacilityMessages === true);

  /** The staff read: the full facility record, contact details and employee list included. */
  readonly facilitiesResource = rxResource({stream: () => this.facilitiesApi.listStaff()});

  readonly facilities = computed<IBuilding[]>(() =>
    this.facilitiesResource.hasValue() ? this.facilitiesResource.value() : []
  );

  /** The facilities of the selected city, as the selector's options. */
  readonly facilityOptions = computed<ISelectOption[]>(() =>
    this.facilities()
      .filter((facility) => facility.city === this.city())
      .map((facility) => ({value: facility.property, label: facility.name}))
  );

  /**
   * The selected facility.
   *
   * The chosen key wins while it is one of the city's facilities; otherwise the city's first is
   * used, so changing city always lands on a real facility and an unset selection resolves on
   * the first load rather than rendering an empty panel. `null` when the city has no facilities.
   */
  readonly selectedFacility = computed<IBuilding | null>(() => {
    const inCity = this.facilities().filter((facility) => facility.city === this.city());
    if (inCity.length === 0) {
      return null;
    }
    return inCity.find((facility) => facility.property === this.property()) ?? inCity[0];
  });

  /** The property key the selector should show, always the resolved facility's. */
  readonly selectedProperty = computed(() => this.selectedFacility()?.property ?? '');

  readonly details = computed(() => facilityDetails(this.selectedFacility(), this.t));
  readonly employees = computed(() => employeeOptions(this.selectedFacility()));
  readonly employeeRows = computed<Record<string, unknown>[]>(() =>
    this.employees().map((employee) => ({name: employee.value}))
  );

  /**
   * The message form, re-filled whenever the selected facility changes.
   *
   * A `linkedSignal` rather than a plain signal so switching facility cannot leave the previous
   * facility's address in the recipient field — the same class of stale-state bug the legacy
   * form's manual reset avoided by hand.
   */
  readonly form = linkedSignal<IBuilding | null, IEmployeeMessageValue>({
    source: () => this.selectedFacility(),
    computation: (facility) => emptyEmployeeMessage(facility),
  });

  /** The form errors, but only after a submit attempt, so typing is not punished. */
  readonly fieldErrors = computed<TEmployeeMessageErrors>(() =>
    this.submitted() ? validateEmployeeMessage(this.form(), this.t) : {}
  );

  onCity(city: string): void {
    this.city.set(city as TCity);
    this.property.set('');
  }

  onFacility(property: string): void {
    this.property.set(property);
  }

  /** The per-employee action: selects that employee and clears any message being written. */
  startMessage(person: string): void {
    this.form.set({...emptyEmployeeMessage(this.selectedFacility()), person});
    this.resetStatus();
  }

  updateMessage(patch: Partial<IEmployeeMessageValue>): void {
    this.form.update((current) => ({...current, ...patch}));
  }

  /**
   * Sends the message.
   *
   * The form is validated against the same rules the server enforces before sending, so an
   * obviously invalid message never makes a round trip; a `422` the server returns is shown
   * with its own messages, and any other failure — a `502` provider failure in particular — is
   * shown as a retry prompt (FR-036).
   */
  send(): void {
    this.submitted.set(true);
    this.resetStatus();

    if (Object.keys(validateEmployeeMessage(this.form(), this.t)).length > 0) {
      return;
    }

    this.sending.set(true);
    this.notificationsApi.sendMessage(buildMessageRequest(this.form(), this.selectedFacility())).subscribe({
      next: () => {
        this.sending.set(false);
        this.sendSuccess.set(this.t('facilities.sent'));
        this.form.set(emptyEmployeeMessage(this.selectedFacility()));
        this.submitted.set(false);
      },
      error: (error: unknown) => {
        this.sending.set(false);
        this.sendError.set(this.failureMessage(error));
      },
    });
  }

  /** The visible message for a failed send; every failure produces one (acceptance criterion 3). */
  private failureMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      return sendFailureMessage(error.status, this.t);
    }
    return sendFailureMessage(0, this.t);
  }

  private resetStatus(): void {
    this.sendError.set(null);
    this.sendSuccess.set(null);
  }
}

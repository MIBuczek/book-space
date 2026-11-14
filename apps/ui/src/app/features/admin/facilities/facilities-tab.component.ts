import {Component, computed, inject, linkedSignal, signal} from '@angular/core';
import {HttpErrorResponse} from '@angular/common/http';
import {rxResource} from '@angular/core/rxjs-interop';
import {TranslatePipe} from '@ngx-translate/core';
import {injectTranslate} from '@booking/i18n';
import {IBuilding, SIZES, TSize} from '@models/building.model';
import {FacilitiesApi} from '../../../core/facilities.api';
import {NotificationsApi} from '../../../core/notifications.api';
import {SessionStore} from '../../../core/session.store';
import {
  ButtonComponent,
  CheckboxComponent,
  ISelectOption,
  InputComponent,
  ModalComponent,
  SelectComponent,
  TableComponent,
} from '../../../shared/ui';
import {
  buildFacilityRequest,
  buildMessageRequest,
  deleteFailureMessage,
  emptyEmployeeMessage,
  emptyFacilityForm,
  employeeOptions,
  facilityDetails,
  formFromFacility,
  mapFacilityServerErrors,
  sendFailureMessage,
  validateEmployeeMessage,
  validateFacilityForm,
} from './facilities-tab';
import type {
  IEmployeeMessageValue,
  IFacilityFormValue,
  TEmployeeMessageErrors,
  TFacilityFieldErrors,
} from './facilities-tab';
import {cityOptions as buildCityOptions, keepSelected} from '../../../core/city-options';

const EMPLOYEE_COLUMNS = [{key: 'name', label: 'facilities.employeeColumn'}];

/** The rentable sizes the create/edit form offers, as checkbox options (FR-008). */
const SIZE_OPTIONS = SIZES;

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
  imports: [ButtonComponent, CheckboxComponent, InputComponent, ModalComponent, SelectComponent, TableComponent, TranslatePipe],
  template: `
    <section class="bs-page">
      <h1>{{ 'facilities.title' | translate }}</h1>

      <div class="bs-facilities__controls">
        <book-space-select
          [label]="'facilities.city' | translate"
          [options]="cityOptions()"
          [value]="city()"
          (valueChange)="onCity($event)"
        />
        <book-space-select
          [label]="'facilities.facility' | translate"
          [options]="facilityOptions()"
          [value]="selectedProperty()"
          (valueChange)="onFacility($event)"
        />
        @if (canWrite()) {
          <book-space-button variant="primary" (pressed)="openCreate()">
            {{ 'facilities.add' | translate }}
          </book-space-button>
        }
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
          @if (canWrite()) {
            <div class="bs-facilities__detail-actions">
              <book-space-button variant="secondary" (pressed)="openEdit(facility)">
                {{ 'common.edit' | translate }}
              </book-space-button>
              <book-space-button variant="danger" (pressed)="askDelete(facility)">
                {{ 'common.remove' | translate }}
              </book-space-button>
            </div>
          }
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

      <book-space-modal
        [open]="editing()"
        [title]="(editTarget() ? 'facilities.editTitle' : 'facilities.createTitle') | translate"
        (closed)="cancelEdit()"
      >
        @if (editing()) {
          <div class="bs-facilities__form">
          <book-space-input
            [label]="'facilities.fields.name' | translate"
            [value]="facilityForm().name"
            [error]="facilityErrors().name ?? null"
            (valueChange)="updateFacility({name: $event})"
          />
          <book-space-input
            [label]="'facilities.fields.property' | translate"
            [value]="facilityForm().property"
            [error]="facilityErrors().property ?? null"
            (valueChange)="updateFacility({property: $event})"
          />
          <book-space-input
            [label]="'facilities.fields.city' | translate"
            [value]="facilityForm().city"
            [error]="facilityErrors().city ?? null"
            (valueChange)="updateFacility({city: $event})"
          />
          <book-space-input
            [label]="'facilities.fields.email' | translate"
            type="email"
            [value]="facilityForm().email"
            [error]="facilityErrors().email ?? null"
            (valueChange)="updateFacility({email: $event})"
          />
          <book-space-input
            [label]="'facilities.fields.phone' | translate"
            [value]="facilityForm().phone"
            [error]="facilityErrors().phone ?? null"
            (valueChange)="updateFacility({phone: $event})"
          />
          <book-space-input
            [label]="'facilities.fields.street' | translate"
            [value]="facilityForm().street"
            [error]="facilityErrors().street ?? null"
            (valueChange)="updateFacility({street: $event})"
          />
          <book-space-input
            [label]="'facilities.fields.zipCode' | translate"
            [value]="facilityForm().zipCode"
            [error]="facilityErrors().zipCode ?? null"
            (valueChange)="updateFacility({zipCode: $event})"
          />

          <fieldset class="bs-facilities__sizes">
            <legend>{{ 'facilities.fields.sizes' | translate }}</legend>
            @for (size of sizeOptions; track size) {
              <book-space-checkbox
                [label]="size"
                [checked]="hasSize(size)"
                (checkedChange)="toggleSize(size, $event)"
              />
            }
            @if (facilityErrors().sizes; as sizeError) {
              <p class="bs-facilities__error" role="alert">{{ sizeError }}</p>
            }
          </fieldset>

          <book-space-checkbox
            [label]="'facilities.fields.lighting' | translate"
            [checked]="facilityForm().lighting"
            (checkedChange)="updateFacility({lighting: $event})"
          />
          <book-space-checkbox
            [label]="'facilities.fields.toilets' | translate"
            [checked]="facilityForm().toilets"
            (checkedChange)="updateFacility({toilets: $event})"
          />

          <label class="bs-field">
            <span class="bs-field__label">{{ 'facilities.fields.employees' | translate }}</span>
            <textarea
              [value]="facilityForm().employees"
              (input)="updateFacility({employees: $any($event.target).value})"
            ></textarea>
          </label>

          <book-space-checkbox
            [label]="'facilities.fields.active' | translate"
            [checked]="facilityForm().active"
            (checkedChange)="updateFacility({active: $event})"
          />

          @if (facilityGeneralError(); as message) {
            <p class="bs-facilities__error" role="alert">{{ message }}</p>
          }

          <div class="bs-modal__actions">
            <book-space-button variant="primary" (pressed)="confirmSave()">{{ 'common.save' | translate }}</book-space-button>
            <book-space-button variant="secondary" (pressed)="cancelEdit()">{{ 'common.cancel' | translate }}</book-space-button>
          </div>
          </div>
        }
      </book-space-modal>

      <book-space-modal
        [open]="deleteTarget() !== null"
        [title]="'facilities.deleteTitle' | translate"
        role="alertdialog"
        (closed)="cancelDelete()"
      >
        @if (deleteTarget(); as target) {
          <div class="bs-facilities__delete">
          <p>{{ 'facilities.deleteConfirm' | translate: {name: target.name} }}</p>
          @if (deleteError(); as message) {
            <p class="bs-facilities__error" role="alert">{{ message }}</p>
          }
          <div class="bs-modal__actions">
            <book-space-button variant="danger" (pressed)="confirmDelete()">{{ 'common.remove' | translate }}</book-space-button>
            <book-space-button variant="secondary" (pressed)="cancelDelete()">{{ 'common.cancel' | translate }}</book-space-button>
          </div>
          </div>
        }
      </book-space-modal>
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
      .bs-facilities__detail-actions {
        display: flex;
        gap: 0.75rem;
        margin-top: 0.75rem;
      }
      .bs-facilities__sizes {
        border: 1px solid #d0d0d0;
        border-radius: 6px;
        padding: 0.5rem 0.75rem;
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
  readonly employeeColumns = EMPLOYEE_COLUMNS;

  /** The chosen facility key; the selection falls back to the city's first while it is unset. */
  readonly property = signal('');

  readonly submitted = signal(false);
  readonly sending = signal(false);
  readonly sendError = signal<string | null>(null);
  readonly sendSuccess = signal<string | null>(null);

  /** The message-to-employee action is available to every staff member (matrix, `Building.tsx`). */
  readonly canSend = computed(() => this.session.capabilities()?.canSendFacilityMessages === true);

  /**
   * Whether the create/edit/delete controls are offered (FR-010). Administrator-only on the
   * server; the tab is the presentation half of the same rule.
   */
  readonly canWrite = computed(() => this.session.capabilities()?.canWriteFacilities === true);

  readonly sizeOptions = SIZE_OPTIONS;

  /** The staff read: the full facility record, contact details and employee list included. */
  readonly facilitiesResource = rxResource({stream: () => this.facilitiesApi.listStaff()});

  readonly facilities = computed<IBuilding[]>(() =>
    this.facilitiesResource.hasValue() ? this.facilitiesResource.value() : []
  );

  /** The city selector's options: the cities the facilities actually sit in (FR-007). */
  readonly cityOptions = computed<ISelectOption[]>(() => buildCityOptions(this.facilities()));

  /**
   * The selected city. A `linkedSignal` on the facility list, so the initial city is the first
   * city the facilities carry rather than a compiled-in default (spec.md §9 open question 1).
   */
  readonly city = linkedSignal<ISelectOption[], string>({
    source: () => this.cityOptions(),
    computation: (options, previous) => keepSelected(options, previous?.value),
  });

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

  /** Whether the create/edit modal is open. */
  readonly editing = signal(false);
  /** The facility being edited, or `null` when the modal is creating a new one. */
  readonly editTarget = signal<IBuilding | null>(null);
  /** The create/edit form value (the message form is the separate `form` above). */
  readonly facilityForm = signal<IFacilityFormValue>(emptyFacilityForm());
  readonly facilitySubmitted = signal(false);
  readonly facilityServerErrors = signal<TFacilityFieldErrors>({});
  readonly facilityGeneralError = signal<string | null>(null);

  readonly deleteTarget = signal<IBuilding | null>(null);
  /** The message shown in the delete modal when the server refuses the delete (T059). */
  readonly deleteError = signal<string | null>(null);

  /** The facility form's errors, but only after a submit attempt. */
  readonly facilityErrors = computed<TFacilityFieldErrors>(() =>
    this.facilitySubmitted()
      ? {...validateFacilityForm(this.facilityForm(), this.t), ...this.facilityServerErrors()}
      : {}
  );

  /** Whether a size is selected in the form, for the size checkbox's checked state. */
  hasSize(size: TSize): boolean {
    return this.facilityForm().sizes.includes(size);
  }

  /** Adds or removes a size from the form's selection. */
  toggleSize(size: TSize, checked: boolean): void {
    this.facilityForm.update((current) => ({
      ...current,
      sizes: checked
        ? [...current.sizes, size]
        : current.sizes.filter((candidate) => candidate !== size),
    }));
  }

  openCreate(): void {
    this.editTarget.set(null);
    this.facilityForm.set(emptyFacilityForm());
    this.resetFacilityErrors();
    this.editing.set(true);
  }

  openEdit(facility: IBuilding): void {
    this.editTarget.set(facility);
    this.facilityForm.set(formFromFacility(facility));
    this.resetFacilityErrors();
    this.editing.set(true);
  }

  updateFacility(patch: Partial<IFacilityFormValue>): void {
    this.facilityForm.update((current) => ({...current, ...patch}));
  }

  /**
   * Saves the facility.
   *
   * The form validates the same rules as the server before sending, so an obviously invalid
   * facility never makes a round trip; a `422` the server returns is mapped back to the field it
   * names (FR-026, T272). On success the list reloads so a new city or facility appears in the
   * selectors without a manual refresh.
   */
  confirmSave(): void {
    this.facilitySubmitted.set(true);
    this.facilityServerErrors.set({});
    this.facilityGeneralError.set(null);

    if (Object.keys(validateFacilityForm(this.facilityForm(), this.t)).length > 0) {
      return;
    }

    const body = buildFacilityRequest(this.facilityForm());
    const target = this.editTarget();
    const request =
      target === null
        ? this.facilitiesApi.create(body)
        : this.facilitiesApi.update(target._id, body);
    request.subscribe({
      next: () => {
        this.cancelEdit();
        this.facilitiesResource.reload();
      },
      error: (error: unknown) => this.handleWriteError(error),
    });
  }

  cancelEdit(): void {
    this.editing.set(false);
    this.editTarget.set(null);
    this.resetFacilityErrors();
  }

  askDelete(facility: IBuilding): void {
    this.deleteError.set(null);
    this.deleteTarget.set(facility);
  }

  confirmDelete(): void {
    const target = this.deleteTarget();
    if (target === null) {
      return;
    }
    this.facilitiesApi.remove(target._id).subscribe({
      next: () => {
        this.cancelDelete();
        this.facilitiesResource.reload();
      },
      error: (error: unknown) => this.deleteError.set(deleteFailureMessage(error, this.t)),
    });
  }

  cancelDelete(): void {
    this.deleteError.set(null);
    this.deleteTarget.set(null);
  }

  /** Surfaces a `422` against the field it names; any other failure is shown generally. */
  private handleWriteError(error: unknown): void {
    if (error instanceof HttpErrorResponse && error.status === 422) {
      const body = error.error as {message?: unknown} | null;
      const raw = body ? body.message : undefined;
      const messages = Array.isArray(raw) ? (raw as string[]) : [];
      const {fields, general} = mapFacilityServerErrors(messages, this.t);
      this.facilityServerErrors.set(fields);
      this.facilityGeneralError.set(general ?? this.t('errors.generic'));
      return;
    }
    this.facilityGeneralError.set(this.t('facilities.saveFailure'));
  }

  private resetFacilityErrors(): void {
    this.facilitySubmitted.set(false);
    this.facilityServerErrors.set({});
    this.facilityGeneralError.set(null);
  }

  onCity(city: string): void {
    this.city.set(city);
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

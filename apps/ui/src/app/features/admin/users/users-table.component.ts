import {Component, computed, inject, signal} from '@angular/core';
import {HttpErrorResponse} from '@angular/common/http';
import {rxResource} from '@angular/core/rxjs-interop';
import {COPY} from '@booking/copy';
import {IUser, TUserRole} from '@models/user.model';
import {IBuilding, CITY_LABELS} from '@models/building.model';
import {IValidationError} from '@models/validation-error.model';
import {UsersApi} from '../../../core/users.api';
import {FacilitiesApi} from '../../../core/facilities.api';
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
  ROLE_LABELS,
  ROLE_OPTIONS,
  USER_COLUMNS,
  buildCreateRequest,
  buildUpdateRequest,
  cityOptions,
  emptyUserForm,
  formFromUser,
  isCityRequired,
  mapServerErrors,
  toRow,
  validateUserForm,
} from './users-table';
import type {IUserFormValue, TUserFieldErrors} from './users-table';

const ROLE_SELECT_OPTIONS: ISelectOption[] = ROLE_OPTIONS.map((role) => ({
  value: role,
  label: ROLE_LABELS[role],
}));

const CITY_SELECT_OPTIONS: ISelectOption[] = cityOptions(CITY_LABELS);

/**
 * The admin Users tab (FR-045, FR-047, issue #118).
 *
 * The legacy panel managed accounts through the users endpoints; this reproduces the
 * list/create/edit/deactivate screen on signals. The list read is `GET /users`, and the writes are
 * the `POST`/`PUT` routes — all administrator-only, which the server enforces and the tab mirrors
 * by rendering the controls only for a caller with `canManageUsers`.
 *
 * Deactivation is the tab's removal action (FR-047): the account stops being able to sign in and
 * the records it created stay attributable. The tab does not offer deletion, because deleting an
 * account that has ever acted is what the rule exists to avoid; the API's `DELETE` route remains
 * for an account created in error.
 *
 * State is signals because the app is zoneless. The row list is `computed` from the resource, so
 * a reload recomputes it without a manual sync.
 */
@Component({
  selector: 'book-space-users-table',
  imports: [
    ButtonComponent,
    CheckboxComponent,
    InputComponent,
    ModalComponent,
    SelectComponent,
    TableComponent,
  ],
  template: `
    <section class="bs-page">
      <h1>{{ copy.title }}</h1>

      <div class="bs-users__controls">
        <book-space-button variant="primary" (pressed)="openCreate()">
          {{ copy.add }}
        </book-space-button>
      </div>

      @if (usersResource.isLoading()) {
        <p role="status">{{ copy.loading }}</p>
      } @else if (usersResource.status() === 'error') {
        <p role="alert">{{ copy.loadError }}</p>
      } @else {
        <book-space-table
          [caption]="copy.caption"
          [columns]="columns"
          [rows]="rows()"
          [emptyMessage]="copy.empty"
        >
          <ng-template #rowActions let-row>
            <book-space-button variant="secondary" (pressed)="openEdit(row.user)">
              {{ common.edit }}
            </book-space-button>
            @if (row.user.active) {
              <book-space-button variant="danger" (pressed)="askDeactivate(row.user)">
                {{ copy.deactivate }}
              </book-space-button>
            }
          </ng-template>
        </book-space-table>
      }

      <book-space-modal
        [open]="editing()"
        [title]="editTarget() ? copy.editTitle : copy.createTitle"
        (closed)="cancelEdit()"
      >
        @if (editing()) {
          <book-space-input
            [label]="copy.fields.firstName"
            [value]="form().firstName"
            [error]="fieldErrors().firstName ?? null"
            (valueChange)="update({firstName: $event})"
          />
          <book-space-input
            [label]="copy.fields.lastName"
            [value]="form().lastName"
            [error]="fieldErrors().lastName ?? null"
            (valueChange)="update({lastName: $event})"
          />
          <book-space-input
            [label]="copy.fields.email"
            type="email"
            [value]="form().email"
            [error]="fieldErrors().email ?? null"
            (valueChange)="update({email: $event})"
          />
          <book-space-input
            [label]="copy.fields.password"
            type="password"
            [placeholder]="editTarget() ? copy.passwordPlaceholderEdit : ''"
            [value]="form().password"
            [error]="fieldErrors().password ?? null"
            (valueChange)="update({password: $event})"
          />
          <book-space-input
            [label]="copy.fields.recheckPassword"
            type="password"
            [value]="form().recheckPassword"
            [error]="fieldErrors().recheckPassword ?? null"
            (valueChange)="update({recheckPassword: $event})"
          />
          <book-space-select
            [label]="copy.fields.role"
            [options]="roleOptions"
            [value]="form().role"
            (valueChange)="onRole($event)"
          />
          @if (cityRequired()) {
            <book-space-select
              [label]="copy.fields.city"
              [options]="citySelectOptions"
              [value]="form().city"
              [error]="fieldErrors().city ?? null"
              (valueChange)="update({city: $event})"
            />
          }
          @if (facilities().length > 0) {
            <fieldset class="bs-users__assignment">
              <legend>{{ copy.assignmentsLegend }}</legend>
              @for (facility of facilities(); track facility._id) {
                <book-space-checkbox
                  [label]="facilityLabel(facility)"
                  [checked]="isAssigned(facility.property)"
                  (checkedChange)="toggleAssignment(facility.property, $event)"
                />
              }
            </fieldset>
          }
          <book-space-checkbox
            [label]="copy.fields.active"
            [checked]="form().active"
            (checkedChange)="update({active: $event})"
          />

          @if (generalError(); as message) {
            <p class="bs-users__error" role="alert">{{ message }}</p>
          }

          <div class="bs-modal__actions">
            <book-space-button variant="primary" (pressed)="confirmSave()">{{ common.save }}</book-space-button>
            <book-space-button variant="secondary" (pressed)="cancelEdit()">{{ common.cancel }}</book-space-button>
          </div>
        }
      </book-space-modal>

      <book-space-modal
        [open]="deactivateTarget() !== null"
        [title]="copy.deactivateTitle"
        role="alertdialog"
        (closed)="cancelDeactivate()"
      >
        @if (deactivateTarget(); as target) {
          <p>{{ copy.deactivateConfirm(target.firstName, target.lastName) }}</p>
          @if (deactivateError(); as message) {
            <p class="bs-users__error" role="alert">{{ message }}</p>
          }
          <div class="bs-modal__actions">
            <book-space-button variant="danger" (pressed)="confirmDeactivate()">
              {{ copy.deactivate }}
            </book-space-button>
            <book-space-button variant="secondary" (pressed)="cancelDeactivate()">
              {{ common.cancel }}
            </book-space-button>
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
      .bs-users__controls {
        display: flex;
        align-items: flex-end;
        gap: 1rem;
        flex-wrap: wrap;
        margin-bottom: 1rem;
      }
      .bs-users__error {
        color: #a4262c;
      }
      .bs-users__assignment {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        border: 1px solid #d0d0d0;
        border-radius: 4px;
        padding: 0.5rem 0.75rem;
      }
    `,
  ],
})
export class UsersTableComponent {
  private readonly usersApi = inject(UsersApi);
  private readonly facilitiesApi = inject(FacilitiesApi);
  private readonly session = inject(SessionStore);

  readonly copy = COPY.users;
  readonly common = COPY.common;
  readonly columns = USER_COLUMNS;
  readonly roleOptions = ROLE_SELECT_OPTIONS;
  readonly citySelectOptions = CITY_SELECT_OPTIONS;

  readonly editing = signal(false);
  readonly editTarget = signal<IUser | null>(null);
  readonly form = signal<IUserFormValue>(emptyUserForm());
  readonly submitted = signal(false);
  readonly serverErrors = signal<TUserFieldErrors>({});
  readonly generalError = signal<string | null>(null);
  readonly deactivateTarget = signal<IUser | null>(null);
  readonly deactivateError = signal<string | null>(null);

  readonly cityRequired = computed(() => isCityRequired(this.form().role));

  /** The form errors, but only after a submit attempt, so typing is not punished. */
  readonly fieldErrors = computed<TUserFieldErrors>(() =>
    this.submitted()
      ? {...validateUserForm(this.form(), this.editTarget() !== null), ...this.serverErrors()}
      : {}
  );

  readonly usersResource = rxResource({
    stream: () => this.usersApi.list(),
  });

  /**
   * The facilities for the assignment checkboxes.
   *
   * The staff read, because an administrator sees the full record; only the `property` key is used
   * here, and it is what the server stores on a user's `buildings`. A failure to load the list is
   * not fatal to the tab: the assignment editor is hidden and the rest of the form still works.
   */
  readonly facilitiesResource = rxResource({
    stream: () => this.facilitiesApi.listStaff(),
    defaultValue: [] as IBuilding[],
  });

  readonly facilities = computed(() =>
    this.facilitiesResource.hasValue() ? this.facilitiesResource.value() : []
  );

  readonly rows = computed<Record<string, unknown>[]>(() => {
    const items = this.usersResource.hasValue() ? this.usersResource.value() : [];
    return items.map((user) => toRow(user));
  });

  onRole(role: string): void {
    this.update({role: role as TUserRole});
  }

  update(patch: Partial<IUserFormValue>): void {
    this.form.update((current) => ({...current, ...patch}));
  }

  /** The label a facility checkbox shows: its name and city, so two same-named halls differ. */
  facilityLabel(facility: IBuilding): string {
    return `${facility.name} (${facility.city})`;
  }

  isAssigned(property: string): boolean {
    return this.form().buildings.includes(property);
  }

  toggleAssignment(property: string, assigned: boolean): void {
    const current = this.form().buildings;
    const buildings = assigned
      ? [...current, property]
      : current.filter((candidate) => candidate !== property);
    this.update({buildings});
  }

  openCreate(): void {
    this.editTarget.set(null);
    this.form.set(emptyUserForm());
    this.resetErrors();
    this.editing.set(true);
  }

  openEdit(user: IUser): void {
    this.editTarget.set(user);
    this.form.set(formFromUser(user));
    this.resetErrors();
    this.editing.set(true);
  }

  /**
   * Saves the form.
   *
   * The client validates the same rules as the server before sending, so an obviously invalid
   * form never makes a round trip; the server is still the authority and a `422` it returns is
   * mapped back to the field that caused it.
   */
  confirmSave(): void {
    this.submitted.set(true);
    this.serverErrors.set({});
    this.generalError.set(null);

    const target = this.editTarget();
    if (Object.keys(validateUserForm(this.form(), target !== null)).length > 0) {
      return;
    }

    const request =
      target === null
        ? this.usersApi.create(buildCreateRequest(this.form()))
        : this.usersApi.update(target._id, buildUpdateRequest(this.form()));
    request.subscribe({
      next: () => {
        this.cancelEdit();
        this.usersResource.reload();
      },
      error: (error: unknown) => this.handleWriteError(error),
    });
  }

  cancelEdit(): void {
    this.editing.set(false);
    this.editTarget.set(null);
    this.resetErrors();
  }

  askDeactivate(user: IUser): void {
    this.deactivateError.set(null);
    this.deactivateTarget.set(user);
  }

  confirmDeactivate(): void {
    const target = this.deactivateTarget();
    if (target === null) {
      return;
    }
    this.usersApi.deactivate(target._id).subscribe({
      next: () => {
        this.cancelDeactivate();
        this.usersResource.reload();
      },
      // The last-administrator rule answers `409`; showing the server's message is the only way
      // the operator learns why the deactivation was refused.
      error: (error: unknown) => this.handleDeactivateError(error),
    });
  }

  cancelDeactivate(): void {
    this.deactivateTarget.set(null);
    this.deactivateError.set(null);
  }

  /** Surfaces a `422` against the field it names; any other failure is shown generally. */
  private handleWriteError(error: unknown): void {
    if (error instanceof HttpErrorResponse && error.status === 422) {
      const body = error.error as IValidationError | undefined;
      const messages = Array.isArray(body?.message) ? body.message : [];
      const {fields, general} = mapServerErrors(messages);
      this.serverErrors.set(fields);
      this.generalError.set(general ?? COPY.errors.generic);
      return;
    }
    this.generalError.set(COPY.users.saveFailure);
  }

  private handleDeactivateError(error: unknown): void {
    if (error instanceof HttpErrorResponse && error.status === 409) {
      // The `409` body is English (the last-active-administrator rule); the UI shows its own
      // Polish text, keyed by the status (NFR-005, T061).
      this.deactivateError.set(COPY.users.deactivateConflict);
      return;
    }
    this.deactivateError.set(COPY.users.deactivateFailure);
  }

  private resetErrors(): void {
    this.submitted.set(false);
    this.serverErrors.set({});
    this.generalError.set(null);
  }
}

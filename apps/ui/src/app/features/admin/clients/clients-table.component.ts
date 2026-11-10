import {Component, computed, inject, signal} from '@angular/core';
import {HttpErrorResponse} from '@angular/common/http';
import {rxResource} from '@angular/core/rxjs-interop';
import {IClient} from '@models/client.model';
import {IValidationError} from '@models/validation-error.model';
import {TClientType} from '@models/booking.model';
import {ClientsApi} from '../../../core/clients.api';
import {SessionStore} from '../../../core/session.store';
import {
  ButtonComponent,
  ISelectOption,
  InputComponent,
  ModalComponent,
  PaginationComponent,
  SelectComponent,
  TableComponent,
} from '../../../shared/ui';
import {
  CLIENT_COLUMNS,
  CLIENT_TYPE_LABELS,
  PAGE_SIZES,
  buildClientRequest,
  emptyClientForm,
  formFromClient,
  mapServerErrors,
  nameLabelFor,
  toRow,
  validateClientForm,
} from './clients-table';
import type {IClientFormValue, TClientFieldErrors} from './clients-table';

const CLIENT_OPTIONS: ISelectOption[] = (Object.keys(CLIENT_TYPE_LABELS) as TClientType[]).map(
  (type) => ({value: type, label: CLIENT_TYPE_LABELS[type]})
);

/**
 * The admin clients tab (FR-024, FR-025, FR-026, issue #41).
 *
 * The legacy `Clients.tsx` provided a paginated list with a name search, and add/edit/delete
 * with a confirmation modal; `ClientForm.tsx` switched the name label between "Nazwa firmy"
 * and "Imię i nazwisko" and showed NIP only for a company. This reproduces that on signals:
 * the list read is `GET /clients` (paged and searchable server-side, issue #123), and the
 * writes are the administrator half of FR-024.
 *
 * The list is read by office and administrators; only an administrator sees the write
 * controls, gated on the `canWriteClients` capability — which the server enforces on the write
 * routes, so the tab is the presentation half of the rule, not the rule itself.
 *
 * State is signals because the app is zoneless. The row list is `computed` from the resource,
 * so a search or a reload recomputes it without a manual sync.
 */
@Component({
  selector: 'book-space-clients-table',
  imports: [
    ButtonComponent,
    InputComponent,
    ModalComponent,
    PaginationComponent,
    SelectComponent,
    TableComponent,
  ],
  template: `
    <section class="bs-page">
      <h1>Lista klientów</h1>

      <div class="bs-clients__controls">
        <book-space-input
          label="Wyszukaj klienta"
          [value]="search()"
          (valueChange)="onSearch($event)"
        />
        @if (canWrite()) {
          <book-space-button variant="primary" (pressed)="openCreate()">
            Dodaj klienta
          </book-space-button>
        }
      </div>

      @if (clientsResource.isLoading()) {
        <p role="status">Wczytywanie klientów…</p>
      } @else if (clientsResource.status() === 'error') {
        <p role="alert">Nie udało się wczytać klientów.</p>
      } @else {
        <book-space-table
          caption="Klienci"
          [columns]="columns"
          [rows]="rows()"
          emptyMessage="Nie ma żadnego klienta w bazie danych."
        >
          @if (canWrite()) {
            <ng-template #rowActions let-row>
              <book-space-button variant="secondary" (pressed)="openEdit(row.client)">
                Edytuj
              </book-space-button>
              <book-space-button variant="danger" (pressed)="askDelete(row.client)">
                Usuń
              </book-space-button>
            </ng-template>
          }
        </book-space-table>

        <book-space-pagination
          [page]="page()"
          [total]="total()"
          [limit]="limit()"
          (pageChange)="onPage($event)"
        />
        <book-space-select
          label="Na stronę"
          [options]="pageSizeOptions"
          [value]="limitValue()"
          (valueChange)="onLimit($event)"
        />
      }

      <book-space-modal
        [open]="editing()"
        [title]="editTarget() ? 'Edytuj klienta' : 'Dodaj klienta'"
        (closed)="cancelEdit()"
      >
        @if (editing()) {
          <book-space-select
            label="Typ"
            [options]="clientOptions"
            [value]="form().type"
            (valueChange)="onType($event)"
          />
          <book-space-input
            [label]="nameLabel()"
            [value]="form().name"
            [error]="fieldErrors().name ?? null"
            (valueChange)="update({name: $event})"
          />
          <book-space-input
            label="Nazwa w kalendarzu (opcjonalnie)"
            [value]="form().nick"
            [error]="fieldErrors().nick ?? null"
            (valueChange)="update({nick: $event})"
          />
          <book-space-input
            label="Osoba kontaktowa"
            [value]="form().contactPerson"
            [error]="fieldErrors().contactPerson ?? null"
            (valueChange)="update({contactPerson: $event})"
          />
          <book-space-input
            label="Telefon"
            [value]="form().phone"
            [error]="fieldErrors().phone ?? null"
            (valueChange)="update({phone: $event})"
          />
          <book-space-input
            label="E-mail"
            type="email"
            [value]="form().email"
            [error]="fieldErrors().email ?? null"
            (valueChange)="update({email: $event})"
          />
          <book-space-input
            label="Ulica"
            [value]="form().street"
            [error]="fieldErrors().street ?? null"
            (valueChange)="update({street: $event})"
          />
          <book-space-input
            label="Miasto"
            [value]="form().city"
            [error]="fieldErrors().city ?? null"
            (valueChange)="update({city: $event})"
          />
          <book-space-input
            label="Kod pocztowy"
            [value]="form().zipCode"
            [error]="fieldErrors().zipCode ?? null"
            (valueChange)="update({zipCode: $event})"
          />
          @if (nipRequired()) {
            <book-space-input
              label="NIP"
              [value]="form().nip"
              [error]="fieldErrors().nip ?? null"
              (valueChange)="update({nip: $event})"
            />
          }

          @if (generalError(); as message) {
            <p class="bs-clients__error" role="alert">{{ message }}</p>
          }

          <div class="bs-modal__actions">
            <book-space-button variant="primary" (pressed)="confirmSave()">Zapisz</book-space-button>
            <book-space-button variant="secondary" (pressed)="cancelEdit()">Anuluj</book-space-button>
          </div>
        }
      </book-space-modal>

      <book-space-modal
        [open]="deleteTarget() !== null"
        title="Usuń klienta"
        role="alertdialog"
        (closed)="cancelDelete()"
      >
        @if (deleteTarget(); as target) {
          <p>Czy na pewno chcesz usunąć klienta {{ target.name }}?</p>
          <div class="bs-modal__actions">
            <book-space-button variant="danger" (pressed)="confirmDelete()">Usuń</book-space-button>
            <book-space-button variant="secondary" (pressed)="cancelDelete()">Anuluj</book-space-button>
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
      .bs-clients__controls {
        display: flex;
        align-items: flex-end;
        gap: 1rem;
        flex-wrap: wrap;
        margin-bottom: 1rem;
      }
      .bs-clients__error {
        color: #a4262c;
      }
    `,
  ],
})
export class ClientsTableComponent {
  private readonly clientsApi = inject(ClientsApi);
  private readonly session = inject(SessionStore);

  readonly columns = CLIENT_COLUMNS;
  readonly clientOptions = CLIENT_OPTIONS;
  readonly pageSizeOptions: ISelectOption[] = PAGE_SIZES.map((size) => ({
    value: String(size),
    label: String(size),
  }));

  readonly search = signal('');
  readonly page = signal(1);
  readonly limit = signal(20);
  readonly limitValue = computed(() => String(this.limit()));

  /** Whether the write controls are offered; the server enforces the same rule on the routes. */
  readonly canWrite = computed(() => this.session.capabilities()?.canWriteClients === true);

  readonly editing = signal(false);
  readonly editTarget = signal<IClient | null>(null);
  readonly form = signal<IClientFormValue>(emptyClientForm());
  readonly submitted = signal(false);
  readonly serverErrors = signal<TClientFieldErrors>({});
  readonly generalError = signal<string | null>(null);
  readonly deleteTarget = signal<IClient | null>(null);

  readonly nameLabel = computed(() => nameLabelFor(this.form().type));
  readonly nipRequired = computed(() => this.form().type === 'COMPANY');

  /** The form errors, but only after a submit attempt, so typing is not punished. */
  readonly fieldErrors = computed<TClientFieldErrors>(() =>
    this.submitted() ? {...validateClientForm(this.form()), ...this.serverErrors()} : {}
  );

  readonly clientsResource = rxResource({
    params: () => ({
      search: this.search() === '' ? undefined : this.search(),
      page: this.page(),
      limit: this.limit(),
    }),
    stream: ({params}) => this.clientsApi.list(params),
  });

  readonly rows = computed<Record<string, unknown>[]>(() => {
    const items = this.clientsResource.hasValue() ? this.clientsResource.value().items : [];
    return items.map((client) => toRow(client));
  });

  readonly total = computed(() =>
    this.clientsResource.hasValue() ? this.clientsResource.value().total : 0
  );

  onSearch(search: string): void {
    this.search.set(search);
    this.page.set(1);
  }

  onPage(page: number): void {
    this.page.set(page);
  }

  onLimit(limit: string): void {
    this.limit.set(Number(limit));
    this.page.set(1);
  }

  openCreate(): void {
    this.editTarget.set(null);
    this.form.set(emptyClientForm());
    this.resetErrors();
    this.editing.set(true);
  }

  openEdit(client: IClient): void {
    this.editTarget.set(client);
    this.form.set(formFromClient(client));
    this.resetErrors();
    this.editing.set(true);
  }

  onType(type: string): void {
    this.update({type: type as TClientType});
  }

  update(patch: Partial<IClientFormValue>): void {
    this.form.update((current) => ({...current, ...patch}));
  }

  /**
   * Saves the form.
   *
   * The client validates the same rules as the server before sending, so an obviously invalid
   * form never makes a round trip; the server is still the authority and a `422` it returns is
   * mapped back to the field that caused it (FR-026).
   */
  confirmSave(): void {
    this.submitted.set(true);
    this.serverErrors.set({});
    this.generalError.set(null);

    if (Object.keys(validateClientForm(this.form())).length > 0) {
      return;
    }

    const body = buildClientRequest(this.form());
    const target = this.editTarget();
    const request = target === null ? this.clientsApi.create(body) : this.clientsApi.update(target._id, body);
    request.subscribe({
      next: () => {
        this.cancelEdit();
        this.clientsResource.reload();
      },
      error: (error: unknown) => this.handleWriteError(error),
    });
  }

  cancelEdit(): void {
    this.editing.set(false);
    this.editTarget.set(null);
    this.resetErrors();
  }

  askDelete(client: IClient): void {
    this.deleteTarget.set(client);
  }

  confirmDelete(): void {
    const target = this.deleteTarget();
    if (target === null) {
      return;
    }
    this.clientsApi.remove(target._id).subscribe(() => {
      this.cancelDelete();
      this.clientsResource.reload();
    });
  }

  cancelDelete(): void {
    this.deleteTarget.set(null);
  }

  /** Surfaces a `422` against the field it names; any other failure is shown generally. */
  private handleWriteError(error: unknown): void {
    if (error instanceof HttpErrorResponse && error.status === 422) {
      const body = error.error as IValidationError | undefined;
      const messages = Array.isArray(body?.message) ? body.message : [];
      const {fields, general} = mapServerErrors(messages);
      this.serverErrors.set(fields);
      this.generalError.set(general ?? 'Popraw dane i spróbuj ponownie.');
      return;
    }
    this.generalError.set('Nie udało się zapisać klienta. Spróbuj ponownie później.');
  }

  private resetErrors(): void {
    this.submitted.set(false);
    this.serverErrors.set({});
    this.generalError.set(null);
  }
}

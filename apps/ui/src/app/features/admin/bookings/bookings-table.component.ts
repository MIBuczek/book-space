import {Component, computed, inject, linkedSignal, signal} from '@angular/core';
import {rxResource} from '@angular/core/rxjs-interop';
import {IBooking} from '@models/booking.model';
import {IBookedTime, TSingleBookingStatus} from '@models/booked-time.model';
import {CITIES, IPublicBuilding, TCity} from '@models/building.model';
import {BookingsApi} from '../../../core/bookings.api';
import {FacilitiesApi} from '../../../core/facilities.api';
import {SessionStore} from '../../../core/session.store';
import {
  ButtonComponent,
  CheckboxComponent,
  DatePickerComponent,
  ISelectOption,
  InputComponent,
  ModalComponent,
  PaginationComponent,
  SelectComponent,
  TableComponent,
} from '../../../shared/ui';
import {
  BOOKING_COLUMNS,
  CITY_LABELS,
  END_HOURS,
  FROM_THE_BEGINNING,
  ISlotRow,
  PAGE_SIZES,
  START_HOURS,
  STATUS_OPTIONS,
  buildSlot,
  periodOptions,
  replaceSlot,
  resolvePeriod,
  toRow,
  toSlotRows,
} from './bookings-table';

const CITY_OPTIONS: ISelectOption[] = CITIES.map((city) => ({value: city, label: CITY_LABELS[city]}));

const HOUR_OPTIONS = (hours: number[]): ISelectOption[] =>
  hours.map((hour) => ({value: String(hour), label: `${String(hour).padStart(2, '0')}:00`}));

/**
 * The admin bookings table (FR-017, FR-018, FR-020, FR-021, FR-022).
 *
 * The legacy `Bookings.tsx` rendered a paginated `MultipleRecords` table filtered to the
 * selected facility, with a name search, an "awaiting approval" filter, a conflict counter
 * and per-row edit/delete/resolve actions behind modals. This reproduces the workflow on
 * signals: the list read is `GET /bookings` with the staff filters (the period loader, the
 * unapproved filter, the search), the conflict set is `GET /bookings/conflicts`, and the
 * actions are the approve/archive/update/slot-replacement/delete routes.
 *
 * The scope is one facility: the legacy panel filtered `bookings` to the selected city and
 * facility, and the conflict rules only compare within a facility. The selectors are the
 * calendar's, and the facility list is the public `GET /buildings` read — staff need the
 * facility identity and sizes, not its contact details.
 *
 * State is signals because the app is zoneless. The derived row list, the conflict marker and
 * the counter are `computed`, so a filter or a reload recomputes them without a manual sync.
 */
@Component({
  selector: 'book-space-bookings-table',
  imports: [
    ButtonComponent,
    CheckboxComponent,
    DatePickerComponent,
    InputComponent,
    ModalComponent,
    PaginationComponent,
    SelectComponent,
    TableComponent,
  ],
  template: `
    <section class="bs-page">
      <h1>Lista rezerwacji</h1>

      <div class="bs-bookings__controls">
        <book-space-select
          label="Miasto"
          [options]="cityOptions"
          [value]="city()"
          (valueChange)="onCity($event)"
        />
        <book-space-select
          label="Obiekt"
          [options]="buildingOptions()"
          [value]="building()"
          placeholder="Wybierz obiekt"
          (valueChange)="onBuilding($event)"
        />
        <book-space-select
          label="Okres"
          [options]="periodSelectOptions"
          [value]="period()"
          (valueChange)="onPeriod($event)"
        />
        <book-space-input
          label="Wyszukaj rezerwację"
          [value]="search()"
          (valueChange)="onSearch($event)"
        />
        @if (canFilterUnapproved()) {
          <book-space-checkbox
            label="Pokaż rezerwacje do zaakceptowania"
            [checked]="unapprovedOnly()"
            (checkedChange)="onUnapprovedOnly($event)"
          />
        }
        <book-space-checkbox
          label="Pokaż szczegóły rezerwacji"
          [checked]="showDetails()"
          (checkedChange)="onShowDetails($event)"
        />
      </div>

      @if (building() === '') {
        <p>Wybierz obiekt, aby zobaczyć rezerwacje.</p>
      } @else if (bookingsResource.isLoading()) {
        <p role="status">Wczytywanie rezerwacji…</p>
      } @else if (bookingsResource.status() === 'error') {
        <p role="alert">Nie udało się wczytać rezerwacji.</p>
      } @else {
        <book-space-table
          caption="Rezerwacje"
          [columns]="columns"
          [rows]="rows()"
          [expandAll]="showDetails()"
          emptyMessage="Nie ma żadnej rezerwacji w bazie danych."
        >
          <ng-template #rowDetails let-row>
            <div class="bs-bookings__details">
              <p><strong>Najemca:</strong> {{ row.personName }}</p>
              <p><strong>Klub:</strong> {{ row.booking.personCompany || '—' }}</p>
              <p><strong>Płatność:</strong> {{ row.booking.paymentMethod }}</p>
              <p><strong>Wiadomość:</strong> {{ row.booking.comments || '—' }}</p>
              <table class="bs-slots">
                <thead>
                  <tr>
                    <th scope="col">Dzień</th>
                    <th scope="col">Godziny</th>
                    <th scope="col">Status</th>
                    <th scope="col">Uczestnicy</th>
                    <th scope="col">Akcje</th>
                  </tr>
                </thead>
                <tbody>
                  @for (slot of slotRows(row.booking); track slot.index) {
                    <tr>
                      <td>{{ slot.dayLabel }}</td>
                      <td>{{ slot.hoursLabel }}</td>
                      <td>{{ slot.statusLabel }}</td>
                      <td>{{ slot.participants ?? '—' }}</td>
                      <td>
                        @if (slot.resolved) {
                          <span>Slot rozliczony</span>
                        } @else {
                          <book-space-button
                            variant="secondary"
                            (pressed)="openReschedule(row.booking, slot)"
                          >
                            Przenieś
                          </book-space-button>
                          <book-space-button
                            variant="secondary"
                            (pressed)="openResolve(row.booking, slot)"
                          >
                            Rozlicz
                          </book-space-button>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </ng-template>

          <ng-template #rowActions let-row>
            @if (canApproveBookings()) {
              <book-space-button
                [variant]="row.accepted ? 'secondary' : 'primary'"
                (pressed)="toggleApproval(row.booking)"
              >
                {{ row.accepted ? 'Odwołaj' : 'Zatwierdź' }}
              </book-space-button>
            }
            @if (canArchiveBookings()) {
              <book-space-button variant="secondary" (pressed)="toggleArchive(row.booking)">
                {{ row.archive ? 'Przywróć' : 'Archiwizuj' }}
              </book-space-button>
            }
            <book-space-button variant="secondary" (pressed)="edit(row.booking)">
              Edytuj
            </book-space-button>
            <book-space-button variant="danger" (pressed)="askDelete(row.booking)">
              Usuń
            </book-space-button>
          </ng-template>
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

        @if (canSeeConflicts()) {
          <p class="bs-bookings__conflicts" [class.bs-bookings__conflicts--active]="conflictCount() > 0">
            Aktualna liczba konfliktów między rezerwacjami: {{ conflictCount() }}
          </p>
        }
      }

      @if (approvalWarning(); as warning) {
        <section class="bs-bookings__warning" role="alert">
          <p>{{ warning }}</p>
          <book-space-button variant="primary" (pressed)="confirmApproval()">
            Zatwierdź mimo konfliktu
          </book-space-button>
          <book-space-button variant="secondary" (pressed)="cancelApproval()">Anuluj</book-space-button>
        </section>
      }

      <book-space-modal
        [open]="rescheduleTarget() !== null"
        title="Przenieś slot"
        (closed)="cancelReschedule()"
      >
        @if (rescheduleTarget()) {
          <book-space-date-picker
            label="Dzień"
            [value]="rescheduleDay()"
            (valueChange)="rescheduleDay.set($event)"
          />
          <book-space-select
            label="Od"
            [options]="startHourOptions"
            [value]="rescheduleStart()"
            (valueChange)="rescheduleStart.set($event)"
          />
          <book-space-select
            label="Do"
            [options]="endHourOptions"
            [value]="rescheduleEnd()"
            (valueChange)="rescheduleEnd.set($event)"
          />
          <div class="bs-modal__actions">
            <book-space-button variant="primary" (pressed)="confirmReschedule()">Zapisz</book-space-button>
            <book-space-button variant="secondary" (pressed)="cancelReschedule()">Anuluj</book-space-button>
          </div>
        }
      </book-space-modal>

      <book-space-modal
        [open]="resolveTarget() !== null"
        title="Rozlicz slot"
        (closed)="cancelResolve()"
      >
        @if (resolveTarget()) {
          <book-space-select
            label="Status"
            [options]="statusOptions"
            [value]="resolveStatus()"
            (valueChange)="onResolveStatus($event)"
          />
          <book-space-input
            label="Uczestnicy"
            type="number"
            [value]="resolveParticipants()"
            (valueChange)="onResolveParticipants($event)"
          />
          <book-space-input
            label="Komentarz"
            [value]="resolveComments()"
            (valueChange)="onResolveComments($event)"
          />
          <div class="bs-modal__actions">
            <book-space-button variant="primary" (pressed)="confirmResolve()">Zapisz</book-space-button>
            <book-space-button variant="secondary" (pressed)="cancelResolve()">Anuluj</book-space-button>
          </div>
        }
      </book-space-modal>

      <book-space-modal
        [open]="editTarget() !== null"
        title="Edytuj rezerwację"
        (closed)="cancelEdit()"
      >
        @if (editTarget()) {
          <book-space-input
            label="Nazwa w kalendarzu"
            [value]="editNick()"
            (valueChange)="editNick.set($event)"
          />
          <book-space-input
            label="Imię i nazwisko"
            [value]="editPersonName()"
            (valueChange)="editPersonName.set($event)"
          />
          <book-space-input
            label="Telefon"
            [value]="editPhone()"
            (valueChange)="editPhone.set($event)"
          />
          <div class="bs-modal__actions">
            <book-space-button variant="primary" (pressed)="confirmEdit()">Zapisz</book-space-button>
            <book-space-button variant="secondary" (pressed)="cancelEdit()">Anuluj</book-space-button>
          </div>
        }
      </book-space-modal>

      <book-space-modal
        [open]="deleteTarget() !== null"
        title="Usuń rezerwację"
        role="alertdialog"
        (closed)="cancelDelete()"
      >
        @if (deleteTarget()) {
          <p>Czy na pewno chcesz usunąć tą rezerwację?</p>
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
      .bs-bookings__controls {
        display: flex;
        align-items: flex-end;
        gap: 1rem;
        flex-wrap: wrap;
        margin-bottom: 1rem;
      }
      .bs-bookings__details {
        padding: 0.5rem 0;
      }
      .bs-slots {
        border-collapse: collapse;
        margin-top: 0.5rem;
      }
      .bs-slots th,
      .bs-slots td {
        border-bottom: 1px solid #d9d9d9;
        padding: 0.25rem 0.5rem;
        text-align: left;
      }
      .bs-bookings__conflicts {
        color: #454545;
      }
      .bs-bookings__conflicts--active {
        color: #a4262c;
        font-weight: 600;
      }
      .bs-bookings__warning {
        border: 1px solid #d9d9d9;
        border-radius: 6px;
        padding: 1rem;
        margin-top: 1rem;
      }
    `,
  ],
})
export class BookingsTableComponent {
  private readonly bookingsApi = inject(BookingsApi);
  private readonly facilitiesApi = inject(FacilitiesApi);
  private readonly session = inject(SessionStore);

  readonly columns = BOOKING_COLUMNS;
  readonly cityOptions = CITY_OPTIONS;
  readonly statusOptions = STATUS_OPTIONS;
  readonly pageSizeOptions: ISelectOption[] = PAGE_SIZES.map((size) => ({
    value: String(size),
    label: String(size),
  }));
  readonly periodSelectOptions: ISelectOption[] = periodOptions(new Date()).map((option) => ({
    value: option.value,
    label: option.label,
  }));
  readonly startHourOptions = HOUR_OPTIONS(START_HOURS);
  readonly endHourOptions = HOUR_OPTIONS(END_HOURS);

  readonly city = signal<TCity>('siechnice');
  readonly period = signal(FROM_THE_BEGINNING);
  readonly search = signal('');
  readonly unapprovedOnly = signal(false);
  readonly showDetails = signal(false);
  readonly page = signal(1);
  readonly limit = signal(20);
  readonly limitValue = computed(() => String(this.limit()));

  /** The row whose actions are pending: the approve confirmation, the resolve, the edit, the delete. */
  readonly approvalWarning = signal<string | null>(null);
  readonly pendingApprovalId = signal<string | null>(null);
  readonly resolveTarget = signal<{booking: IBooking; slot: ISlotRow} | null>(null);
  readonly resolveStatus = signal<TSingleBookingStatus>('DONE');
  readonly resolveParticipants = signal('');
  readonly resolveComments = signal('');
  readonly rescheduleTarget = signal<{booking: IBooking; slot: ISlotRow} | null>(null);
  readonly rescheduleDay = signal<Date | null>(null);
  readonly rescheduleStart = signal('');
  readonly rescheduleEnd = signal('');
  readonly editTarget = signal<IBooking | null>(null);
  readonly editNick = signal('');
  readonly editPersonName = signal('');
  readonly editPhone = signal('');
  readonly deleteTarget = signal<IBooking | null>(null);

  readonly canApproveBookings = computed(() => this.session.capabilities()?.canApproveBookings === true);
  readonly canArchiveBookings = computed(() => this.session.capabilities()?.canArchiveBookings === true);
  readonly canFilterUnapproved = computed(() => this.session.capabilities()?.canFilterUnapproved === true);
  readonly canSeeConflicts = computed(() => this.session.capabilities()?.canSeeConflicts === true);

  readonly facilities = signal<IPublicBuilding[]>([]);

  /** The facilities of the selected city, as the selector's options. */
  readonly buildingOptions = computed<ISelectOption[]>(() =>
    this.facilities()
      .filter((facility) => facility.city === this.city())
      .map((facility) => ({value: facility.property, label: facility.name}))
  );

  /**
   * The selected facility, reset to the city's first when the city changes but kept while it
   * is still valid — the same `linkedSignal` the calendar uses, so a facility-list refresh
   * does not reset a choice the administrator already made.
   */
  readonly building = linkedSignal<{city: TCity; options: ISelectOption[]}, string>({
    source: () => ({city: this.city(), options: this.buildingOptions()}),
    computation: (source, previous) => {
      if (previous && source.options.some((option) => option.value === previous.value)) {
        return previous.value;
      }
      return source.options[0]?.value ?? '';
    },
  });

  readonly resolvedPeriod = computed(() =>
    resolvePeriod(this.period(), periodOptions(new Date()), new Date())
  );

  /** The staff list read, re-run whenever a filter changes. */
  readonly bookingsResource = rxResource({
    params: () => {
      const building = this.building();
      if (building === '') {
        return undefined;
      }
      const {from, to, all} = this.resolvedPeriod();
      return {
        city: this.city(),
        building,
        from,
        to,
        all,
        accepted: this.unapprovedOnly() ? false : undefined,
        search: this.search() === '' ? undefined : this.search(),
        page: this.page(),
        limit: this.limit(),
      };
    },
    stream: ({params}) => this.bookingsApi.listAdmin(params),
  });

  /** The conflict set for the facility and period on screen (FR-015). */
  readonly conflictsResource = rxResource({
    params: () => {
      const building = this.building();
      if (building === '' || !this.canSeeConflicts()) {
        return undefined;
      }
      const {from, to} = this.resolvedPeriod();
      return {city: this.city(), building, from, to};
    },
    stream: ({params}) => this.bookingsApi.conflicts(params),
  });

  readonly conflicts = computed<string[]>(() =>
    this.conflictsResource.hasValue() ? this.conflictsResource.value() : []
  );

  readonly conflictCount = computed(() => this.conflicts().length);

  readonly rows = computed<Record<string, unknown>[]>(() => {
    const items = this.bookingsResource.hasValue() ? this.bookingsResource.value().items : [];
    return items.map((booking) => toRow(booking, this.conflicts()));
  });

  readonly total = computed(() => (this.bookingsResource.hasValue() ? this.bookingsResource.value().total : 0));

  constructor() {
    this.facilitiesApi.list().subscribe((facilities) => this.facilities.set(facilities));
  }

  slotRows(booking: IBooking): ISlotRow[] {
    return toSlotRows(booking);
  }

  onCity(city: string): void {
    this.city.set(city as TCity);
    this.page.set(1);
  }

  onBuilding(building: string): void {
    this.building.set(building);
    this.page.set(1);
  }

  onPeriod(period: string): void {
    this.period.set(period);
    this.page.set(1);
  }

  onSearch(search: string): void {
    this.search.set(search);
    this.page.set(1);
  }

  onUnapprovedOnly(unapprovedOnly: boolean): void {
    this.unapprovedOnly.set(unapprovedOnly);
    this.page.set(1);
  }

  onShowDetails(showDetails: boolean): void {
    this.showDetails.set(showDetails);
  }

  onPage(page: number): void {
    this.page.set(page);
  }

  onLimit(limit: string): void {
    this.limit.set(Number(limit));
    this.page.set(1);
  }

  /**
   * Approves or unapproves a booking (FR-017).
   *
   * Approving a conflicting booking is refused by the server with a `409`; the UI asks first
   * and, on confirmation, re-sends with `force`. The warning is the legacy behaviour
   * ("a confirmation warning is shown before the change is saved", US3 scenario 2).
   */
  toggleApproval(booking: IBooking): void {
    const accepted = !booking.accepted;
    if (accepted && this.conflicts().includes(booking._id)) {
      this.pendingApprovalId.set(booking._id);
      this.approvalWarning.set(
        'Rezerwacja konfliktuje z innymi rezerwacjami. Czy chcesz ją zatwierdzić mimo to?'
      );
      return;
    }
    this.sendApproval(booking._id, accepted, false);
  }

  confirmApproval(): void {
    const id = this.pendingApprovalId();
    if (id !== null) {
      this.sendApproval(id, true, true);
    }
    this.cancelApproval();
  }

  cancelApproval(): void {
    this.approvalWarning.set(null);
    this.pendingApprovalId.set(null);
  }

  private sendApproval(_id: string, accepted: boolean, force: boolean): void {
    this.bookingsApi.approve(_id, accepted, force).subscribe(() => this.reload());
  }

  toggleArchive(booking: IBooking): void {
    this.bookingsApi.archive(booking._id, !booking.archive).subscribe(() => this.reload());
  }

  edit(booking: IBooking): void {
    this.editTarget.set(booking);
    this.editNick.set(booking.nick);
    this.editPersonName.set(booking.personName);
    this.editPhone.set(booking.personPhone);
  }

  confirmEdit(): void {
    const target = this.editTarget();
    if (target === null) {
      return;
    }
    this.bookingsApi
      .update(target._id, {
        nick: this.editNick(),
        personName: this.editPersonName(),
        personPhone: this.editPhone(),
      })
      .subscribe(() => {
        this.cancelEdit();
        this.reload();
      });
  }

  cancelEdit(): void {
    this.editTarget.set(null);
  }

  openResolve(booking: IBooking, slot: ISlotRow): void {
    this.resolveTarget.set({booking, slot});
    this.resolveStatus.set(slot.status);
    this.resolveParticipants.set(slot.participants === undefined ? '' : String(slot.participants));
    this.resolveComments.set(slot.comments ?? '');
  }

  onResolveStatus(status: string): void {
    this.resolveStatus.set(status as TSingleBookingStatus);
  }

  onResolveParticipants(participants: string): void {
    this.resolveParticipants.set(participants);
  }

  onResolveComments(comments: string): void {
    this.resolveComments.set(comments);
  }

  /**
   * Saves a resolved slot (FR-018).
   *
   * The replacement is built for the one slot and the complete list is sent, because the
   * contract's `PUT /bookings/{_id}/booked-times` replaces the whole list. `replaceSlot`
   * refuses an edit to an already-resolved slot before a request is built; the server would
   * answer `409` and the UI does not need to ask.
   */
  confirmResolve(): void {
    const target = this.resolveTarget();
    if (target === null) {
      return;
    }
    const participants = this.resolveParticipants() === '' ? undefined : Number(this.resolveParticipants());
    const comments = this.resolveComments() === '' ? undefined : this.resolveComments();
    const replacement = buildSlot(
      target.slot.day,
      target.slot.startHour,
      target.slot.endHour,
      this.resolveStatus(),
      participants,
      comments
    );
    const slots: IBookedTime[] = replaceSlot(target.booking.bookedTimes, target.slot.index, replacement);
    this.bookingsApi.replaceSlots(target.booking._id, slots).subscribe(() => {
      this.cancelResolve();
      this.reload();
    });
  }

  cancelResolve(): void {
    this.resolveTarget.set(null);
  }

  openReschedule(booking: IBooking, slot: ISlotRow): void {
    this.rescheduleTarget.set({booking, slot});
    this.rescheduleDay.set(slot.day);
    this.rescheduleStart.set(String(slot.startHour));
    this.rescheduleEnd.set(String(slot.endHour));
  }

  /**
   * Moves a slot to a new day and hour (FR-017, "reschedule individual slots").
   *
   * The replacement keeps the slot's status and its participants/comment, so a reschedule is
   * a change of *when*, not a reset of the resolve state. `replaceSlot` refuses a resolved
   * slot before a request is built, and the list is sent whole because the contract's
   * `PUT /bookings/{_id}/booked-times` replaces the complete list.
   */
  confirmReschedule(): void {
    const target = this.rescheduleTarget();
    const day = this.rescheduleDay();
    if (target === null || day === null) {
      return;
    }
    const replacement = buildSlot(
      day,
      Number(this.rescheduleStart()),
      Number(this.rescheduleEnd()),
      target.slot.status,
      target.slot.participants,
      target.slot.comments
    );
    const slots: IBookedTime[] = replaceSlot(target.booking.bookedTimes, target.slot.index, replacement);
    this.bookingsApi.replaceSlots(target.booking._id, slots).subscribe(() => {
      this.cancelReschedule();
      this.reload();
    });
  }

  cancelReschedule(): void {
    this.rescheduleTarget.set(null);
  }

  askDelete(booking: IBooking): void {
    this.deleteTarget.set(booking);
  }

  confirmDelete(): void {
    const target = this.deleteTarget();
    if (target === null) {
      return;
    }
    this.bookingsApi.remove(target._id).subscribe(() => {
      this.cancelDelete();
      this.reload();
    });
  }

  cancelDelete(): void {
    this.deleteTarget.set(null);
  }

  /** Re-runs the list and the conflict read after a write. */
  private reload(): void {
    this.bookingsResource.reload();
    this.conflictsResource.reload();
  }
}

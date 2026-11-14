import {Component, computed, inject, linkedSignal, signal} from '@angular/core';
import {rxResource} from '@angular/core/rxjs-interop';
import {IBooking} from '@models/booking.model';
import {IBookedTime, TSingleBookingStatus} from '@models/booked-time.model';
import {TranslatePipe} from '@ngx-translate/core';
import {injectTranslate} from '@booking/i18n';
import {IPublicBuilding} from '@models/building.model';
import {BookingsApi} from '../../../core/bookings.api';
import {FacilitiesApi} from '../../../core/facilities.api';
import {NotificationsApi} from '../../../core/notifications.api';
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
import {cityOptions as buildCityOptions, keepSelected} from '../../../core/city-options';

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
    TranslatePipe,
  ],
  template: `
    <section class="bs-page">
      <h1>{{ 'bookings.title' | translate }}</h1>

      <div class="bs-bookings__controls">
        <book-space-select
          [label]="'bookings.city' | translate"
          [options]="cityOptions()"
          [value]="city()"
          (valueChange)="onCity($event)"
        />
        <book-space-select
          [label]="'bookings.facility' | translate"
          [options]="buildingOptions()"
          [value]="building()"
          [placeholder]="'bookings.facilityPlaceholder' | translate"
          (valueChange)="onBuilding($event)"
        />
        <book-space-select
          [label]="'bookings.period' | translate"
          [options]="periodSelectOptions"
          [value]="period()"
          (valueChange)="onPeriod($event)"
        />
        <book-space-input
          [label]="'bookings.search' | translate"
          [value]="search()"
          (valueChange)="onSearch($event)"
        />
        @if (canFilterUnapproved()) {
          <book-space-checkbox
            [label]="'bookings.unapproved' | translate"
            [checked]="unapprovedOnly()"
            (checkedChange)="onUnapprovedOnly($event)"
          />
        }
        <book-space-checkbox
          [label]="'bookings.showDetails' | translate"
          [checked]="showDetails()"
          (checkedChange)="onShowDetails($event)"
        />
      </div>

      @if (building() === '') {
        <p>{{ 'bookings.chooseFacility' | translate }}</p>
      } @else if (bookingsResource.isLoading()) {
        <p role="status">{{ 'bookings.loading' | translate }}</p>
      } @else if (bookingsResource.status() === 'error') {
        <p role="alert">{{ 'bookings.loadError' | translate }}</p>
      } @else {
        <book-space-table
          [caption]="'bookings.caption' | translate"
          [columns]="columns"
          [rows]="rows()"
          [expandAll]="showDetails()"
          [emptyMessage]="'bookings.empty' | translate"
        >
          <ng-template #rowDetails let-row>
            <div class="bs-bookings__details">
              <p><strong>{{ 'bookings.details.tenant' | translate }}</strong> {{ row.personName }}</p>
              <p><strong>{{ 'bookings.details.club' | translate }}</strong> {{ row.booking.personCompany || dash }}</p>
              <p><strong>{{ 'bookings.details.payment' | translate }}</strong> {{ row.booking.paymentMethod }}</p>
              <p><strong>{{ 'bookings.details.message' | translate }}</strong> {{ row.booking.comments || dash }}</p>
              <table class="bs-slots">
                <thead>
                  <tr>
                    <th scope="col">{{ 'bookings.slotColumns.day' | translate }}</th>
                    <th scope="col">{{ 'bookings.slotColumns.hours' | translate }}</th>
                    <th scope="col">{{ 'bookings.slotColumns.status' | translate }}</th>
                    <th scope="col">{{ 'bookings.slotColumns.participants' | translate }}</th>
                    <th scope="col">{{ 'bookings.slotColumns.actions' | translate }}</th>
                  </tr>
                </thead>
                <tbody>
                  @for (slot of slotRows(row.booking); track slot.index) {
                    <tr>
                      <td>{{ slot.dayLabel }}</td>
                      <td>{{ slot.hoursLabel }}</td>
                      <td>{{ slot.statusLabel }}</td>
                      <td>{{ slot.participants ?? dash }}</td>
                      <td>
                        @if (slot.resolved) {
                          <span>{{ 'bookings.resolvedSlot' | translate }}</span>
                        } @else {
                          <book-space-button
                            variant="secondary"
                            (pressed)="openReschedule(row.booking, slot)"
                          >
                            {{ 'bookings.reschedule' | translate }}
                          </book-space-button>
                          <book-space-button
                            variant="secondary"
                            (pressed)="openResolve(row.booking, slot)"
                          >
                            {{ 'bookings.resolve' | translate }}
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
                {{ (row.accepted ? 'bookings.unapprove' : 'bookings.approve') | translate }}
              </book-space-button>
              <book-space-button
                variant="secondary"
                [disabled]="notifyTargetId() === row.booking._id"
                (pressed)="notifyApplicant(row.booking)"
              >
                {{ 'bookings.notifyApplicant' | translate }}
              </book-space-button>
            }
            @if (canArchiveBookings()) {
              <book-space-button variant="secondary" (pressed)="toggleArchive(row.booking)">
                {{ (row.archive ? 'bookings.unarchive' : 'bookings.archive') | translate }}
              </book-space-button>
            }
            <book-space-button variant="secondary" (pressed)="edit(row.booking)">
              {{ 'common.edit' | translate }}
            </book-space-button>
            <book-space-button variant="danger" (pressed)="askDelete(row.booking)">
              {{ 'bookings.remove' | translate }}
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
          [label]="'common.pageSize' | translate"
          [options]="pageSizeOptions"
          [value]="limitValue()"
          (valueChange)="onLimit($event)"
        />

        @if (canSeeConflicts()) {
          <p class="bs-bookings__conflicts" [class.bs-bookings__conflicts--active]="conflictCount() > 0">
            {{ 'bookings.conflicts' | translate: {count: conflictCount()} }}
          </p>
        }

        @if (notifySuccess(); as message) {
          <p class="bs-bookings__notify" role="status">{{ message }}</p>
        }
        @if (notifyError(); as message) {
          <p class="bs-bookings__notify bs-bookings__notify--error" role="alert">{{ message }}</p>
        }
      }

      @if (approvalWarning(); as warning) {
        <section class="bs-bookings__warning" role="alert">
          <p>{{ warning }}</p>
          <book-space-button variant="primary" (pressed)="confirmApproval()">
            {{ 'bookings.approveAnyway' | translate }}
          </book-space-button>
          <book-space-button variant="secondary" (pressed)="cancelApproval()">{{ 'common.cancel' | translate }}</book-space-button>
        </section>
      }

      <book-space-modal
        [open]="rescheduleTarget() !== null"
        [title]="'bookings.modals.reschedule' | translate"
        (closed)="cancelReschedule()"
      >
        @if (rescheduleTarget()) {
          <book-space-date-picker
            [label]="'bookings.slotColumns.day' | translate"
            [value]="rescheduleDay()"
            (valueChange)="rescheduleDay.set($event)"
          />
          <book-space-select
            [label]="'bookings.hours.from' | translate"
            [options]="startHourOptions"
            [value]="rescheduleStart()"
            (valueChange)="rescheduleStart.set($event)"
          />
          <book-space-select
            [label]="'bookings.hours.to' | translate"
            [options]="endHourOptions"
            [value]="rescheduleEnd()"
            (valueChange)="rescheduleEnd.set($event)"
          />
          <div class="bs-modal__actions">
            <book-space-button variant="primary" (pressed)="confirmReschedule()">{{ 'common.save' | translate }}</book-space-button>
            <book-space-button variant="secondary" (pressed)="cancelReschedule()">{{ 'common.cancel' | translate }}</book-space-button>
          </div>
        }
      </book-space-modal>

      <book-space-modal
        [open]="resolveTarget() !== null"
        [title]="'bookings.modals.resolve' | translate"
        (closed)="cancelResolve()"
      >
        @if (resolveTarget()) {
          <book-space-select
            [label]="'bookings.resolveFields.status' | translate"
            [options]="statusOptions"
            [value]="resolveStatus()"
            (valueChange)="onResolveStatus($event)"
          />
          <book-space-input
            [label]="'bookings.resolveFields.participants' | translate"
            type="number"
            [value]="resolveParticipants()"
            (valueChange)="onResolveParticipants($event)"
          />
          <book-space-input
            [label]="'bookings.resolveFields.comments' | translate"
            [value]="resolveComments()"
            (valueChange)="onResolveComments($event)"
          />
          <div class="bs-modal__actions">
            <book-space-button variant="primary" (pressed)="confirmResolve()">{{ 'common.save' | translate }}</book-space-button>
            <book-space-button variant="secondary" (pressed)="cancelResolve()">{{ 'common.cancel' | translate }}</book-space-button>
          </div>
        }
      </book-space-modal>

      <book-space-modal
        [open]="editTarget() !== null"
        [title]="'bookings.modals.edit' | translate"
        (closed)="cancelEdit()"
      >
        @if (editTarget()) {
          <book-space-input
            [label]="'bookings.fields.nick' | translate"
            [value]="editNick()"
            (valueChange)="editNick.set($event)"
          />
          <book-space-input
            [label]="'bookings.fields.personName' | translate"
            [value]="editPersonName()"
            (valueChange)="editPersonName.set($event)"
          />
          <book-space-input
            [label]="'bookings.fields.phone' | translate"
            [value]="editPhone()"
            (valueChange)="editPhone.set($event)"
          />
          <div class="bs-modal__actions">
            <book-space-button variant="primary" (pressed)="confirmEdit()">{{ 'common.save' | translate }}</book-space-button>
            <book-space-button variant="secondary" (pressed)="cancelEdit()">{{ 'common.cancel' | translate }}</book-space-button>
          </div>
        }
      </book-space-modal>

      <book-space-modal
        [open]="deleteTarget() !== null"
        [title]="'bookings.modals.delete' | translate"
        role="alertdialog"
        (closed)="cancelDelete()"
      >
        @if (deleteTarget()) {
          <p>{{ 'bookings.deleteConfirm' | translate }}</p>
          <div class="bs-modal__actions">
            <book-space-button variant="danger" (pressed)="confirmDelete()">{{ 'bookings.remove' | translate }}</book-space-button>
            <book-space-button variant="secondary" (pressed)="cancelDelete()">{{ 'common.cancel' | translate }}</book-space-button>
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
      .bs-bookings__notify {
        color: #0b6a0b;
      }
      .bs-bookings__notify--error {
        color: #a4262c;
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
  private readonly notificationsApi = inject(NotificationsApi);
  private readonly session = inject(SessionStore);

  private readonly t = injectTranslate();
  readonly dash = this.t('common.dash');
  readonly columns = BOOKING_COLUMNS;
  readonly statusOptions = STATUS_OPTIONS;
  readonly pageSizeOptions: ISelectOption[] = PAGE_SIZES.map((size) => ({
    value: String(size),
    label: String(size),
  }));
  readonly periodSelectOptions: ISelectOption[] = periodOptions(new Date(), this.t).map((option) => ({
    value: option.value,
    label: option.label,
  }));
  readonly startHourOptions = HOUR_OPTIONS(START_HOURS);
  readonly endHourOptions = HOUR_OPTIONS(END_HOURS);

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

  /**
   * The applicant-notification status for the last send (FR-052, T062).
   *
   * One pair of signals rather than per-row state: the action is one at a time, and the message
   * is a page-level status line, the same shape the Facilities tab uses for its message form.
   */
  readonly notifyTargetId = signal<string | null>(null);
  readonly notifyError = signal<string | null>(null);
  readonly notifySuccess = signal<string | null>(null);

  readonly canApproveBookings = computed(() => this.session.capabilities()?.canApproveBookings === true);
  readonly canArchiveBookings = computed(() => this.session.capabilities()?.canArchiveBookings === true);
  readonly canFilterUnapproved = computed(() => this.session.capabilities()?.canFilterUnapproved === true);
  readonly canSeeConflicts = computed(() => this.session.capabilities()?.canSeeConflicts === true);

  readonly facilities = signal<IPublicBuilding[]>([]);

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
  readonly building = linkedSignal<{city: string; options: ISelectOption[]}, string>({
    source: () => ({city: this.city(), options: this.buildingOptions()}),
    computation: (source, previous) => keepSelected(source.options, previous?.value),
  });

  readonly resolvedPeriod = computed(() =>
    resolvePeriod(this.period(), periodOptions(new Date(), this.t), new Date())
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
    return items.map((booking) => toRow(booking, this.conflicts(), this.t));
  });

  readonly total = computed(() => (this.bookingsResource.hasValue() ? this.bookingsResource.value().total : 0));

  constructor() {
    this.facilitiesApi.list().subscribe((facilities) => this.facilities.set(facilities));
  }

  slotRows(booking: IBooking): ISlotRow[] {
    return toSlotRows(booking, this.t);
  }

  onCity(city: string): void {
    this.city.set(city);
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
      this.approvalWarning.set(this.t('bookings.approveWarning'));
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

  /**
   * Sends the decision notification to the applicant (FR-052, T062).
   *
   * The UI sends only the booking id and the `APPLICANT` audience: the server resolves the
   * recipient from the booking's stored `personEmail` and selects the approved/rejected wording
   * from the booking's stored `accepted` flag. So this action is available on any row — the
   * message follows the booking's own decision rather than a decision the screen is about to
   * make — and the administrator decides *whether* to send, not what it says.
   *
   * A failed send is surfaced rather than swallowed (the same acceptance criterion the
   * Facilities tab meets): the message names the problem for any status, because a `502`
   * provider failure and a `403` both mean the applicant was not notified.
   */
  notifyApplicant(booking: IBooking): void {
    this.notifyError.set(null);
    this.notifySuccess.set(null);
    this.notifyTargetId.set(booking._id);

    this.notificationsApi.notifyBooking({bookingId: booking._id, audience: 'APPLICANT'}).subscribe({
      next: () => {
        this.notifyTargetId.set(null);
        this.notifySuccess.set(this.t('bookings.notifySent'));
      },
      error: () => {
        this.notifyTargetId.set(null);
        this.notifyError.set(this.t('bookings.notifyFailure'));
      },
    });
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

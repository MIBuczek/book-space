import {Component, computed, inject, linkedSignal, signal} from '@angular/core';
import {rxResource} from '@angular/core/rxjs-interop';
import {TranslatePipe} from '@ngx-translate/core';
import {injectTranslate} from '@booking/i18n';
import {IPublicBuilding} from '@models/building.model';
import {BookingsApi} from '../../core/bookings.api';
import {FacilitiesApi} from '../../core/facilities.api';
import {SessionStore} from '../../core/session.store';
import {ButtonComponent, ISelectOption, SelectComponent} from '../../shared/ui';
import {
  ICalendarEvent,
  TCalendarView,
  bookingsToEvents,
  dayColumn,
  eventsOnDay,
  gridHours,
  monthLabel,
  periodFor,
  shiftAnchor,
  statusLabel,
  weekColumns,
} from './calendar-events';

import {cityOptions as buildCityOptions, keepSelected} from '../../core/city-options';

/**
 * The public calendar (FR-037, FR-038).
 *
 * The legacy `Calender.tsx` rendered FullCalendar with week, day and list views, Polish
 * locale, `06:00`–`24:00`, Monday first, event colouring by state and `QUIT` slots hidden.
 * This is the hand-rolled equivalent: no FullCalendar dependency, the same semantics, built
 * on signals so the zoneless change detection sees every update.
 *
 * The city and facility selectors need the facility list, which `GET /buildings` serves to a
 * public caller (T034). The list is fetched once and filtered in the browser rather than
 * re-fetched per city, because a city change is a filter over twelve records, not a read.
 *
 * The bookings read is `GET /bookings`, which is public and redacts the tenant's personal
 * fields for an anonymous caller. The period the view loads is the week, day or month on
 * screen, facility-local (R4): an anonymous caller must name a period, and the calendar
 * always has one. Staff see the same calendar with the tenant's name on each event — the
 * label rule is `eventLabel`, and the redaction is the API's, so the client cannot show what
 * it was not given.
 *
 * Every label, heading and notice is translated (FR-001), so no user-facing text is hardcoded
 * in the template.
 */
@Component({
  selector: 'book-space-public-calendar',
  imports: [SelectComponent, ButtonComponent, TranslatePipe],
  template: `
    <section class="bs-page">
      <h1>{{ 'calendar.title' | translate }}</h1>

      <div class="bs-calendar__controls">
        <book-space-select
          [label]="'calendar.city' | translate"
          [options]="cityOptions()"
          [value]="city()"
          (valueChange)="onCity($event)"
        />
        <book-space-select
          [label]="'calendar.facility' | translate"
          [options]="buildingOptions()"
          [value]="building()"
          [placeholder]="'calendar.facilityPlaceholder' | translate"
          (valueChange)="onBuilding($event)"
        />
        <div class="bs-calendar__views" role="group" [attr.aria-label]="'calendar.viewAria' | translate">
          @for (option of views(); track option.value) {
            <book-space-button
              [variant]="view() === option.value ? 'primary' : 'secondary'"
              [attr.aria-pressed]="view() === option.value"
              (pressed)="onView(option.value)"
            >
              {{ option.label }}
            </book-space-button>
          }
        </div>
      </div>

      <div class="bs-calendar__period">
        <book-space-button variant="secondary" (pressed)="step(-1)">{{ 'calendar.previous' | translate }}</book-space-button>
        <book-space-button variant="secondary" (pressed)="today()">{{ 'calendar.today' | translate }}</book-space-button>
        <book-space-button variant="secondary" (pressed)="step(1)">{{ 'calendar.next' | translate }}</book-space-button>
        <span class="bs-calendar__title">{{ periodLabel() }}</span>
      </div>

      @if (building() === '') {
        <p>{{ 'calendar.chooseFacility' | translate }}</p>
      } @else if (bookingsResource.isLoading()) {
        <p role="status">{{ 'calendar.loading' | translate }}</p>
      } @else if (bookingsResource.status() === 'error') {
        <p role="alert">{{ 'calendar.loadError' | translate }}</p>
      } @else if (view() === 'list' || view() === 'month') {
        <ul class="bs-calendar__list">
          @for (event of events(); track event.id) {
            <li>
              <button type="button" class="bs-event" (click)="select(event)">
                <span class="bs-event__day">{{ event.day }}</span>
                <span class="bs-event__title">{{ event.title }}</span>
                <span class="bs-event__time">{{ event.start }}–{{ event.end }}</span>
                <span class="bs-event__status">{{ statusText(event) }}</span>
              </button>
            </li>
          } @empty {
            <li>{{ 'calendar.empty' | translate }}</li>
          }
        </ul>
      } @else {
        <div class="bs-calendar__grid">
          <div class="bs-calendar__ruler">
            <div class="bs-calendar__corner"></div>
            @for (hour of hours; track hour) {
              <div class="bs-calendar__hour">{{ hour }}:00</div>
            }
          </div>
          @for (column of columns(); track column.day) {
            <div class="bs-calendar__column">
              <div class="bs-calendar__day">{{ column.label }} {{ column.day }}</div>
              @for (hour of hours; track hour) {
                <div class="bs-calendar__cell">
                  @for (event of eventsAt(column.day, hour); track event.id) {
                    <button
                      type="button"
                      class="bs-event"
                      [style.background]="event.color"
                      (click)="select(event)"
                    >
                      <span class="bs-event__title">{{ event.title }}</span>
                      <span class="bs-event__time">{{ event.start }}–{{ event.end }}</span>
                      <span class="bs-event__status">{{ statusText(event) }}</span>
                    </button>
                  }
                </div>
              }
            </div>
          }
        </div>
      }

      @if (!isStaff()) {
        <p class="bs-calendar__notice">{{ 'calendar.publicNotice' | translate }}</p>
      }

      @if (selected(); as event) {
        <section class="bs-calendar__details" [attr.aria-label]="'calendar.detailsAria' | translate">
          <h2>{{ 'calendar.detailsTitle' | translate }}</h2>
          <dl>
            <dt>{{ 'calendar.fields.name' | translate }}</dt>
            <dd>{{ event.title }}</dd>
            <dt>{{ 'calendar.fields.day' | translate }}</dt>
            <dd>{{ event.day }}</dd>
            <dt>{{ 'calendar.fields.hours' | translate }}</dt>
            <dd>{{ event.start }}–{{ event.end }}</dd>
            <dt>{{ 'calendar.fields.size' | translate }}</dt>
            <dd>{{ event.size }}</dd>
            <dt>{{ 'calendar.fields.status' | translate }}</dt>
            <dd>{{ statusText(event) }}</dd>
            @if (isStaff()) {
              <dt>{{ 'calendar.staffFields.client' | translate }}</dt>
              <dd>{{ event.booking.personName }}</dd>
              <dt>{{ 'calendar.staffFields.email' | translate }}</dt>
              <dd>{{ event.booking.personEmail }}</dd>
              <dt>{{ 'calendar.staffFields.phone' | translate }}</dt>
              <dd>{{ event.booking.personPhone }}</dd>
            }
          </dl>
          <book-space-button variant="secondary" (pressed)="clearSelection()">
            {{ 'common.close' | translate }}
          </book-space-button>
        </section>
      }
    </section>
  `,
  styles: [
    `
      .bs-page {
        padding: 1.5rem;
      }
      .bs-calendar__controls,
      .bs-calendar__period {
        display: flex;
        align-items: flex-end;
        gap: 1rem;
        flex-wrap: wrap;
        margin-bottom: 1rem;
      }
      .bs-calendar__views {
        display: flex;
        gap: 0.5rem;
      }
      .bs-calendar__title {
        font-weight: 700;
        align-self: center;
      }
      .bs-calendar__grid {
        display: flex;
        gap: 0.5rem;
        overflow-x: auto;
      }
      .bs-calendar__ruler,
      .bs-calendar__column {
        display: flex;
        flex-direction: column;
        min-width: 8rem;
      }
      .bs-calendar__hour,
      .bs-calendar__cell {
        height: 3rem;
        border-top: 1px solid #d9d9d9;
        font-size: 0.75rem;
      }
      .bs-calendar__day {
        font-weight: 600;
        padding: 0.25rem 0;
      }
      .bs-event {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        width: 100%;
        border: none;
        border-radius: 4px;
        padding: 0.25rem;
        color: #fff;
        cursor: pointer;
        text-align: left;
      }
      .bs-calendar__list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
      }
      .bs-calendar__notice {
        margin-top: 1rem;
        font-size: 0.875rem;
        color: #454545;
      }
      .bs-calendar__details {
        margin-top: 1.5rem;
        border-top: 1px solid #d9d9d9;
        padding-top: 1rem;
      }
    `,
  ],
})
export class PublicCalendarComponent {
  private readonly facilitiesApi = inject(FacilitiesApi);
  private readonly bookingsApi = inject(BookingsApi);
  private readonly session = inject(SessionStore);
  private readonly t = injectTranslate();

  readonly views = computed<Array<{value: TCalendarView; label: string}>>(() => [
    {value: 'week', label: this.t('calendar.views.week')},
    {value: 'day', label: this.t('calendar.views.day')},
    {value: 'list', label: this.t('calendar.views.list')},
    {value: 'month', label: this.t('calendar.views.month')},
  ]);
  readonly hours = gridHours();

  readonly view = signal<TCalendarView>('week');
  /** The day the view is centred on; `now` on first render, matching the legacy initial view. */
  readonly anchor = signal(new Date());
  readonly selected = signal<ICalendarEvent | null>(null);

  /** Whether the caller is staff: the API's answer, not a role re-derived here. */
  readonly isStaff = computed(() => this.session.capabilities()?.staff === true);

  readonly facilitiesResource = rxResource({stream: () => this.facilitiesApi.list()});

  readonly facilities = computed<IPublicBuilding[]>(() =>
    this.facilitiesResource.hasValue() ? this.facilitiesResource.value() : []
  );

  /** The city selector's options: the cities the facilities actually sit in (FR-007). */
  readonly cityOptions = computed<ISelectOption[]>(() => buildCityOptions(this.facilities()));

  /**
   * The selected city.
   *
   * A `linkedSignal` on the facility list: cities are data (spec.md §9 open question 1), so the
   * initial city is the first city the facilities carry rather than a compiled-in default, and
   * the previous choice is kept while it is still valid so a background refresh does not reset
   * it. It stays writable so the selector can set it.
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
   * The selected facility.
   *
   * A `linkedSignal` on the city: when the city changes the facility resets to that city's
   * first one, and it stays writable so the selector can set it. Keeping the previous value
   * when it is still valid stops a background facility-list refresh from resetting a choice
   * the visitor already made.
   */
  readonly building = linkedSignal<{city: string; options: ISelectOption[]}, string>({
    source: () => ({city: this.city(), options: this.buildingOptions()}),
    computation: (source, previous) => {
      if (previous && source.options.some((option) => option.value === previous.value)) {
        return previous.value;
      }
      return source.options[0]?.value ?? '';
    },
  });

  readonly bookingsResource = rxResource({
    params: () => {
      const building = this.building();
      if (building === '') {
        return undefined;
      }
      const period = periodFor(this.view(), this.anchor());
      return {city: this.city(), building, from: period.from, to: period.to};
    },
    stream: ({params}) => this.bookingsApi.list(params),
  });

  readonly events = computed<ICalendarEvent[]>(() =>
    bookingsToEvents(
      this.bookingsResource.hasValue() ? this.bookingsResource.value().items : [],
      this.isStaff(),
      this.t
    )
  );

  /** The day columns the week and day views render: the week, or the single day. */
  readonly columns = computed(() =>
    this.view() === 'day' ? [dayColumn(this.anchor(), this.t)] : weekColumns(this.anchor(), this.t)
  );

  /** The label for the period on screen: the month name, or the period's first day. */
  readonly periodLabel = computed(() => {
    if (this.view() === 'month') {
      return monthLabel(this.anchor(), this.t);
    }
    return this.columns()[0].day;
  });

  onCity(city: string): void {
    this.city.set(city);
  }

  onBuilding(building: string): void {
    this.building.set(building);
  }

  onView(view: TCalendarView): void {
    this.view.set(view);
  }

  step(direction: 1 | -1): void {
    this.anchor.set(shiftAnchor(this.view(), this.anchor(), direction));
  }

  today(): void {
    this.anchor.set(new Date());
  }

  select(event: ICalendarEvent): void {
    this.selected.set(event);
  }

  clearSelection(): void {
    this.selected.set(null);
  }

  /** The events that start in `hour` on `day`, for the grid cell. */
  eventsAt(day: string, hour: number): ICalendarEvent[] {
    return eventsOnDay(this.events(), day).filter((event) => event.startHour === hour);
  }

  statusText(event: ICalendarEvent): string {
    return statusLabel(event.accepted, event.status, this.t);
  }
}

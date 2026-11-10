import {Component, computed, inject, linkedSignal, signal} from '@angular/core';
import {rxResource} from '@angular/core/rxjs-interop';
import {COPY} from '@booking/copy';
import {CITIES, CITY_LABELS, IPublicBuilding, TCity} from '@models/building.model';
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

const CITY_OPTIONS: ISelectOption[] = CITIES.map((city) => ({value: city, label: CITY_LABELS[city]}));

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
 * Every label, heading and notice comes from the shared copy catalogue (NFR-005, T061), so no
 * Polish text is hardcoded in the template.
 */
@Component({
  selector: 'book-space-public-calendar',
  imports: [SelectComponent, ButtonComponent],
  template: `
    <section class="bs-page">
      <h1>{{ copy.title }}</h1>

      <div class="bs-calendar__controls">
        <book-space-select
          [label]="copy.city"
          [options]="cityOptions"
          [value]="city()"
          (valueChange)="onCity($event)"
        />
        <book-space-select
          [label]="copy.facility"
          [options]="buildingOptions()"
          [value]="building()"
          [placeholder]="copy.facilityPlaceholder"
          (valueChange)="onBuilding($event)"
        />
        <div class="bs-calendar__views" role="group" [attr.aria-label]="copy.viewAria">
          @for (option of views; track option.value) {
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
        <book-space-button variant="secondary" (pressed)="step(-1)">{{ copy.previous }}</book-space-button>
        <book-space-button variant="secondary" (pressed)="today()">{{ copy.today }}</book-space-button>
        <book-space-button variant="secondary" (pressed)="step(1)">{{ copy.next }}</book-space-button>
        <span class="bs-calendar__title">{{ periodLabel() }}</span>
      </div>

      @if (building() === '') {
        <p>{{ copy.chooseFacility }}</p>
      } @else if (bookingsResource.isLoading()) {
        <p role="status">{{ copy.loading }}</p>
      } @else if (bookingsResource.status() === 'error') {
        <p role="alert">{{ copy.loadError }}</p>
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
            <li>{{ copy.empty }}</li>
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
        <p class="bs-calendar__notice">{{ copy.publicNotice }}</p>
      }

      @if (selected(); as event) {
        <section class="bs-calendar__details" [attr.aria-label]="copy.detailsAria">
          <h2>{{ copy.detailsTitle }}</h2>
          <dl>
            <dt>{{ copy.fields.name }}</dt>
            <dd>{{ event.title }}</dd>
            <dt>{{ copy.fields.day }}</dt>
            <dd>{{ event.day }}</dd>
            <dt>{{ copy.fields.hours }}</dt>
            <dd>{{ event.start }}–{{ event.end }}</dd>
            <dt>{{ copy.fields.size }}</dt>
            <dd>{{ event.size }}</dd>
            <dt>{{ copy.fields.status }}</dt>
            <dd>{{ statusText(event) }}</dd>
            @if (isStaff()) {
              <dt>{{ copy.staffFields.client }}</dt>
              <dd>{{ event.booking.personName }}</dd>
              <dt>{{ copy.staffFields.email }}</dt>
              <dd>{{ event.booking.personEmail }}</dd>
              <dt>{{ copy.staffFields.phone }}</dt>
              <dd>{{ event.booking.personPhone }}</dd>
            }
          </dl>
          <book-space-button variant="secondary" (pressed)="clearSelection()">
            {{ common.close }}
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

  readonly copy = COPY.calendar;
  readonly common = COPY.common;
  readonly cityOptions = CITY_OPTIONS;
  readonly views: Array<{value: TCalendarView; label: string}> = [
    {value: 'week', label: COPY.calendar.views.week},
    {value: 'day', label: COPY.calendar.views.day},
    {value: 'list', label: COPY.calendar.views.list},
    {value: 'month', label: COPY.calendar.views.month},
  ];
  readonly hours = gridHours();

  readonly city = signal<TCity>('siechnice');
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
  readonly building = linkedSignal<{city: TCity; options: ISelectOption[]}, string>({
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
      this.isStaff()
    )
  );

  /** The day columns the week and day views render: the week, or the single day. */
  readonly columns = computed(() =>
    this.view() === 'day' ? [dayColumn(this.anchor())] : weekColumns(this.anchor())
  );

  /** The Polish label for the period on screen: the month name, or the period's first day. */
  readonly periodLabel = computed(() => {
    if (this.view() === 'month') {
      return monthLabel(this.anchor());
    }
    return this.columns()[0].day;
  });

  onCity(city: string): void {
    this.city.set(city as TCity);
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
    return statusLabel(event.accepted, event.status);
  }
}

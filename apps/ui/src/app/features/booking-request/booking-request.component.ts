import {Component, computed, inject, linkedSignal, signal} from '@angular/core';
import {HttpErrorResponse} from '@angular/common/http';
import {rxResource} from '@angular/core/rxjs-interop';
import {CITIES, IPublicBuilding, TCity} from '@models/building.model';
import {TClientType, TPayment} from '@models/booking.model';
import {BookingRequestsApi} from '../../core/booking-requests.api';
import {FacilitiesApi} from '../../core/facilities.api';
import {
  ButtonComponent,
  CheckboxComponent,
  DatePickerComponent,
  InputComponent,
  ISelectOption,
  SelectComponent,
} from '../../shared/ui';
import {
  CITY_LABELS,
  CLIENT_TYPE_LABELS,
  END_HOUR_OPTIONS,
  PAYMENT_LABELS,
  START_HOUR_OPTIONS,
  buildRequest,
  buildSlots,
  maxSelectableDay,
  minSelectableDay,
  sizeOptions,
  slotHoursValid,
  slotOverlapWarning,
  supportsExtraOptions,
  validateForm,
} from './booking-request-form';
import type {ICyclicalEntry, IExtraOptionEntry, IBookingFormValue, ISlotEntry} from './booking-request-form';
import {formatFacilityDate, formatFacilityTime} from '@booking/date-time';

const CITY_OPTIONS: ISelectOption[] = CITIES.map((city) => ({value: city, label: CITY_LABELS[city]}));

const CLIENT_OPTIONS: ISelectOption[] = (Object.keys(CLIENT_TYPE_LABELS) as TClientType[]).map(
  (type) => ({value: type, label: CLIENT_TYPE_LABELS[type]})
);

const PAYMENT_OPTIONS: ISelectOption[] = (Object.keys(PAYMENT_LABELS) as TPayment[]).map(
  (payment) => ({value: payment, label: PAYMENT_LABELS[payment]})
);

const HOUR_OPTIONS = (hours: number[]): ISelectOption[] =>
  hours.map((hour) => ({value: String(hour), label: `${String(hour).padStart(2, '0')}:00`}));

const RODO_CLAUSE_URL =
  'https://www.sisk-siechnice.pl/wp-content/uploads/2019/09/Klauzula-informacyjna-do-formularza-kontaktowego-SISK.pdf';

/**
 * The public booking request form (FR-011, FR-012, FR-013, issue #39).
 *
 * A separate form from the staff one: an anonymous visitor picks a facility, enters the tenant
 * fields, adds one or more time slots (optionally a weekly series) and must tick the RODO
 * clause before the submit button enables. The rules live in `booking-request-form.ts` as pure
 * functions — the component holds the signal state and calls them, so the bounds, the expansion
 * and the overlap warning are unit-tested without a rendered form.
 *
 * The legacy `BookingForm.tsx` mutated its props (`bookingsList[editedItemIndex].clientId = …`)
 * and dispatched through a Redux store; this form holds its own state and posts directly. It is
 * deliberately the *public* shape: no client assignment, no archive flag, no e-mail toggle —
 * those are the staff form's (T036).
 *
 * State is signals because the app is zoneless: a plain field read by the template would not
 * update the view. The city and facility selectors mirror the calendar's: the facility list is
 * fetched once and filtered in the browser, and the facility resets to the city's first when
 * the city changes.
 */
@Component({
  selector: 'book-space-booking-request',
  imports: [
    ButtonComponent,
    CheckboxComponent,
    DatePickerComponent,
    InputComponent,
    SelectComponent,
  ],
  template: `
    <section class="bs-page">
      <h1>Prośba o rezerwację</h1>

      @if (submitted()) {
        <p class="bs-request__success" role="status">
          Dziękujemy. Twoja prośba o rezerwację została wysłana i oczekuje na zatwierdzenie.
        </p>
      } @else {
        <form (submit)="submit($event)" novalidate>
          <fieldset>
            <legend>Obiekt</legend>
            <book-space-select
              label="Miasto"
              [options]="cityOptions"
              [value]="city()"
              (valueChange)="onCity($event)"
            />
            <book-space-select
              label="Obiekt"
              [options]="buildingOptions()"
              [value]="facilityProperty()"
              placeholder="Wybierz obiekt"
              (valueChange)="onFacility($event)"
            />
            @if (selectedFacility(); as facility) {
              <book-space-select
                label="Rozmiar"
                [options]="sizeSelectOptions()"
                [value]="value().size"
                (valueChange)="update({size: $event})"
              />
            }
          </fieldset>

          <fieldset>
            <legend>Rezerwujący</legend>
            <book-space-select
              label="Typ"
              [options]="clientOptions"
              [value]="value().type"
              (valueChange)="onType($event)"
            />
            <book-space-input
              label="Nazwa w kalendarzu"
              [value]="value().nick"
              [error]="errors().nick ?? null"
              (valueChange)="update({nick: $event})"
            />
            <book-space-input
              label="Imię i nazwisko"
              [value]="value().personName"
              [error]="errors().personName ?? null"
              (valueChange)="update({personName: $event})"
            />
            @if (value().type === 'COMPANY') {
              <book-space-input
                label="Nazwa firmy"
                [value]="value().personCompany"
                [error]="errors().personCompany ?? null"
                (valueChange)="update({personCompany: $event})"
              />
            }
            <book-space-input
              label="E-mail"
              type="email"
              [value]="value().personEmail"
              [error]="errors().personEmail ?? null"
              (valueChange)="update({personEmail: $event})"
            />
            <book-space-input
              label="Telefon"
              [value]="value().personPhone"
              [error]="errors().personPhone ?? null"
              (valueChange)="update({personPhone: $event})"
            />
            <book-space-select
              label="Płatność"
              [options]="paymentOptions"
              [value]="value().paymentMethod"
              (valueChange)="onPayment($event)"
            />
            <book-space-input
              label="Rabat (opcjonalnie)"
              [value]="value().discount"
              [error]="errors().discount ?? null"
              (valueChange)="update({discount: $event})"
            />
            <label class="bs-field">
              <span class="bs-field__label">Dodatkowe informacje</span>
              <textarea
                [value]="value().comments"
                (input)="update({comments: $any($event.target).value})"
              ></textarea>
            </label>
          </fieldset>

          <fieldset>
            <legend>Terminy</legend>
            <book-space-date-picker
              label="Dzień"
              [value]="draftDay()"
              [min]="minDay()"
              [max]="maxDay()"
              (valueChange)="draftDay.set($event)"
            />
            <book-space-select
              label="Od godziny"
              [options]="startHourOptions"
              [value]="hourValue(draftStartHour())"
              (valueChange)="draftStartHour.set(parseHour($event))"
            />
            <book-space-select
              label="Do godziny"
              [options]="endHourOptions"
              [value]="hourValue(draftEndHour())"
              (valueChange)="draftEndHour.set(parseHour($event))"
            />
            <book-space-button variant="secondary" (pressed)="addSlot()">Dodaj termin</book-space-button>

            <book-space-checkbox
              label="Rezerwacja cykliczna"
              [checked]="cyclical()"
              (checkedChange)="cyclical.set($event)"
            />
            @if (cyclical()) {
              <book-space-date-picker
                label="Do dnia"
                [value]="cyclicalEndDay()"
                [min]="minDay()"
                [max]="maxDay()"
                (valueChange)="cyclicalEndDay.set($event)"
              />
            }

            <ul class="bs-request__slots">
              @for (slot of slots(); track slot.day.getTime()) {
                <li>
                  {{ formatDay(slot.day) }} {{ formatHour(slot.startHours) }}–{{ formatHour(slot.endHours) }}
                </li>
              } @empty {
                <li>Nie dodano jeszcze żadnego terminu.</li>
              }
            </ul>
            @if (plainSlots().length > 0) {
              <book-space-button variant="secondary" (pressed)="removeSlot(plainSlots().length - 1)">
                Usuń ostatni termin
              </book-space-button>
            }
            @if (overlapWarning(); as day) {
              <p class="bs-request__warning" role="alert">
                Niektóre godziny rezerwacji konfliktują ze sobą ({{ formatDay(day) }}).
              </p>
            }
          </fieldset>

          @if (supportsExtras()) {
            <fieldset>
              <legend>Dodatkowe opcje wynajmu</legend>
              <book-space-checkbox
                label="Oświetlenie"
                [checked]="extraLights()"
                (checkedChange)="extraLights.set($event)"
              />
              <book-space-checkbox
                label="Zaplecze sanitarne"
                [checked]="extraToilets()"
                (checkedChange)="extraToilets.set($event)"
              />
              <book-space-select
                label="Od godziny"
                [options]="startHourOptions"
                [value]="hourValue(extraFromHour())"
                (valueChange)="extraFromHour.set(parseHour($event))"
              />
              <book-space-select
                label="Do godziny"
                [options]="endHourOptions"
                [value]="hourValue(extraToHour())"
                (valueChange)="extraToHour.set(parseHour($event))"
              />
              <book-space-button variant="secondary" (pressed)="addExtraOption()">
                Dodaj opcję
              </book-space-button>
              <ul class="bs-request__slots">
                @for (option of extraOptions(); track $index) {
                  <li>{{ describeExtraOption(option) }}</li>
                } @empty {
                  <li>Nie dodano żadnych dodatkowych opcji.</li>
                }
              </ul>
            </fieldset>
          }

          <div class="bs-request__rodo">
            <book-space-checkbox
              label="Akceptuję klauzulę informacyjną RODO"
              [checked]="value().rodoAcknowledgement"
              (checkedChange)="update({rodoAcknowledgement: $event})"
            />
            <a [href]="rodoClauseUrl" target="_blank" rel="noopener">
              Klauzula informacyjna o przetwarzaniu danych osobowych.
            </a>
          </div>

          @if (formError(); as message) {
            <p class="bs-request__error" role="alert">{{ message }}</p>
          }

          <book-space-button type="submit" [disabled]="!canSubmit()">
            Wyślij prośbę o rezerwację
          </book-space-button>
        </form>
      }
    </section>
  `,
  styles: [
    `
      .bs-page {
        padding: 1.5rem;
        max-width: 40rem;
      }
      fieldset {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        margin-bottom: 1.5rem;
      }
      .bs-request__slots {
        list-style: none;
        margin: 0;
        padding: 0;
      }
      .bs-request__warning {
        color: #8a6d00;
      }
      .bs-request__error {
        color: #a4262c;
      }
      .bs-request__success {
        color: #2f6f3e;
      }
      .bs-request__rodo {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        margin-bottom: 1rem;
      }
    `,
  ],
})
export class BookingRequestComponent {
  private readonly facilitiesApi = inject(FacilitiesApi);
  private readonly requestsApi = inject(BookingRequestsApi);

  readonly cityOptions = CITY_OPTIONS;
  readonly clientOptions = CLIENT_OPTIONS;
  readonly paymentOptions = PAYMENT_OPTIONS;
  readonly startHourOptions = HOUR_OPTIONS(START_HOUR_OPTIONS);
  readonly endHourOptions = HOUR_OPTIONS(END_HOUR_OPTIONS);
  readonly rodoClauseUrl = RODO_CLAUSE_URL;

  readonly city = signal<TCity>('siechnice');
  readonly value = signal<IBookingFormValue>({
    type: 'INDIVIDUAL',
    size: '',
    nick: '',
    personName: '',
    personCompany: '',
    personEmail: '',
    personPhone: '',
    comments: '',
    paymentMethod: 'TRANSFER',
    discount: '',
    rodoAcknowledgement: false,
  });

  readonly draftDay = signal(new Date());
  readonly draftStartHour = signal(START_HOUR_OPTIONS[0]);
  readonly draftEndHour = signal(END_HOUR_OPTIONS[0]);

  readonly cyclical = signal(false);
  readonly cyclicalEndDay = signal(new Date());

  readonly plainSlots = signal<ISlotEntry[]>([]);
  readonly cyclicalSlots = signal<ICyclicalEntry[]>([]);

  readonly extraLights = signal(false);
  readonly extraToilets = signal(false);
  readonly extraFromHour = signal(START_HOUR_OPTIONS[0]);
  readonly extraToHour = signal(END_HOUR_OPTIONS[0]);
  readonly extraOptions = signal<IExtraOptionEntry[]>([]);

  readonly submitted = signal(false);
  readonly submitting = signal(false);
  readonly formError = signal<string | null>(null);

  readonly facilitiesResource = rxResource({stream: () => this.facilitiesApi.list()});

  readonly facilities = computed<IPublicBuilding[]>(() =>
    this.facilitiesResource.hasValue() ? this.facilitiesResource.value() : []
  );

  readonly buildingOptions = computed<ISelectOption[]>(() =>
    this.facilities()
      .filter((facility) => facility.city === this.city())
      .map((facility) => ({value: facility.property, label: facility.name}))
  );

  readonly facilityProperty = linkedSignal<{city: TCity; options: ISelectOption[]}, string>({
    source: () => ({city: this.city(), options: this.buildingOptions()}),
    computation: (source, previous) => {
      if (previous && source.options.some((option) => option.value === previous.value)) {
        return previous.value;
      }
      return source.options[0]?.value ?? '';
    },
  });

  readonly selectedFacility = computed<IPublicBuilding | undefined>(() =>
    this.facilities().find(
      (facility) => facility.property === this.facilityProperty() && facility.city === this.city()
    )
  );

  readonly sizeSelectOptions = computed<ISelectOption[]>(() =>
    sizeOptions(this.selectedFacility()).map((size) => ({value: size, label: size}))
  );

  readonly supportsExtras = computed(() => supportsExtraOptions(this.selectedFacility()));

  /** The form errors, but only after the first submit, so typing is not punished. */
  readonly errors = computed(() => (this.attempted() ? validateForm(this.value()) : {}));

  private readonly attempted = signal(false);

  readonly minDay = computed(() => formatFacilityDate(minSelectableDay(new Date())));
  readonly maxDay = computed(() => formatFacilityDate(maxSelectableDay(new Date())));

  readonly slots = computed(() => buildSlots(this.plainSlots(), this.cyclicalSlots()));

  readonly overlapWarning = computed(() => slotOverlapWarning(this.slots()));

  /** The submit button is enabled only when the RODO clause is accepted and slots exist. */
  readonly canSubmit = computed(
    () => this.value().rodoAcknowledgement && this.slots().length > 0 && !this.submitting()
  );

  onCity(city: string): void {
    this.city.set(city as TCity);
  }

  onFacility(property: string): void {
    this.facilityProperty.set(property);
  }

  onType(type: string): void {
    this.value.update((current) => ({...current, type: type as TClientType}));
  }

  onPayment(payment: string): void {
    this.value.update((current) => ({...current, paymentMethod: payment as TPayment}));
  }

  update(patch: Partial<IBookingFormValue>): void {
    this.value.update((current) => ({...current, ...patch}));
  }

  /** Adds the draft slot: a plain slot, or a cyclical series when the box is ticked. */
  addSlot(): void {
    if (!slotHoursValid(this.draftStartHour(), this.draftEndHour())) {
      this.formError.set('Godzina zakończenia musi być późniejsza niż godzina rozpoczęcia.');
      return;
    }
    if (this.cyclical() && this.cyclicalEndDay().getTime() < this.draftDay().getTime()) {
      // The shared expansion refuses a backwards series with a `RangeError`; refusing it here
      // turns that into a message rather than a broken submit.
      this.formError.set('Data zakończenia serii nie może być wcześniejsza niż jej początek.');
      return;
    }
    this.formError.set(null);

    if (this.cyclical()) {
      this.cyclicalSlots.update((current) => [
        ...current,
        {
          startDay: this.draftDay(),
          endDay: this.cyclicalEndDay(),
          startHour: this.draftStartHour(),
          endHour: this.draftEndHour(),
        },
      ]);
    } else {
      this.plainSlots.update((current) => [
        ...current,
        {day: this.draftDay(), startHour: this.draftStartHour(), endHour: this.draftEndHour()},
      ]);
    }
  }

  removeSlot(index: number): void {
    this.plainSlots.update((current) => current.filter((_, at) => at !== index));
  }

  addExtraOption(): void {
    this.extraOptions.update((current) => [
      ...current,
      {
        day: this.draftDay(),
        fromHour: this.extraFromHour(),
        toHour: this.extraToHour(),
        lights: this.extraLights(),
        toilets: this.extraToilets(),
      },
    ]);
  }

  removeExtraOption(index: number): void {
    this.extraOptions.update((current) => current.filter((_, at) => at !== index));
  }

  describeExtraOption(option: IExtraOptionEntry): string {
    const parts: string[] = [];
    if (option.lights) {
      parts.push('Oświetlenie');
    }
    if (option.toilets) {
      parts.push('Zaplecze sanitarne');
    }
    const hours = `${String(option.fromHour).padStart(2, '0')}:00–${String(option.toHour).padStart(2, '0')}:00`;
    return `${parts.join(', ')} (${hours})`;
  }

  formatDay(day: Date): string {
    return formatFacilityDate(day);
  }

  formatHour(hour: Date): string {
    return formatFacilityTime(hour);
  }

  /** The hour as the select's `value`: the number rendered as a string. */
  hourValue(hour: number): string {
    return String(hour);
  }

  /** The hour from a select's string value. */
  parseHour(value: string): number {
    return Number(value);
  }

  submit(event: Event): void {
    event.preventDefault();
    this.attempted.set(true);
    this.formError.set(null);

    const facility = this.selectedFacility();
    if (!facility) {
      this.formError.set('Wybierz obiekt.');
      return;
    }
    if (Object.keys(validateForm(this.value())).length > 0 || this.slots().length === 0) {
      return;
    }

    this.submitting.set(true);
    this.requestsApi
      .create(buildRequest(this.value(), facility, this.slots(), this.extraOptions()))
      .subscribe({
        next: () => {
          this.submitting.set(false);
          this.submitted.set(true);
        },
        error: (error: unknown) => {
          this.submitting.set(false);
          this.formError.set(
            error instanceof HttpErrorResponse && error.status === 422
              ? 'Nie udało się wysłać prośby. Sprawdź dane i spróbuj ponownie.'
              : 'Nie udało się wysłać prośby. Spróbuj ponownie później.'
          );
        },
      });
  }
}

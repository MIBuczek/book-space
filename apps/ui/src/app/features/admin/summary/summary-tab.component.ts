import {Component, computed, inject, signal} from '@angular/core';
import {rxResource} from '@angular/core/rxjs-interop';
import {IClientSummary} from '@models/reporting.model';
import {ClientsApi} from '../../../core/clients.api';
import {ReportingApi} from '../../../core/reporting.api';
import {ReportExport} from '../../../core/report-export.service';
import {
  ButtonComponent,
  CheckboxComponent,
  ISelectOption,
  MonthPickerComponent,
  SelectComponent,
} from '../../../shared/ui';
import {
  cityReports,
  cityTotals,
  clientDetailRows,
  csvFilename,
  periodText,
  rangeError,
} from './summary-tab';
import type {IReportPeriod} from './summary-tab';

/** The default range: the current month, both bounds, matching the legacy form's defaults. */
const thisMonth = (): Date => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 12));
};

/**
 * The admin summary tab (FR-027–FR-030, issue #43).
 *
 * It reproduces the legacy `Summary.tsx`: a client selector, a month range, a "from the
 * beginning" option, a generated per-city summary with totals, a CSV export for the selected
 * client and for every client, and a printable report. The aggregation itself is the server's
 * (R7) — this tab requests a range and renders or downloads the result, so the booking history
 * never has to reach the browser (FR-043).
 *
 * The one behaviour deliberately *changed* is `updateToMonthDataInForm`: the legacy reset the
 * end month to the start month whenever the start month changed, silently discarding a chosen
 * end month. Here the two month pickers are independent and an inverted range is refused with an
 * explicit message (`rangeError`), so changing the start month never touches the end month.
 *
 * The printable report (FR-030, T028) is rendered in the page and printed by the browser, not
 * opened in a window at a hardcoded production URL the way `PreviewPDF.tsx` did. The content
 * comes from the same summary the totals are built from, and its vocabulary is the shared
 * `@booking/reporting` one, so the printed report and the CSV cannot disagree.
 */
@Component({
  selector: 'book-space-summary-tab',
  imports: [ButtonComponent, CheckboxComponent, MonthPickerComponent, SelectComponent],
  template: `
    <section class="bs-page">
      <h1>Podsumowanie najmów</h1>

      <div class="bs-summary__controls">
        <book-space-select
          label="Wybrany klient"
          placeholder="Wybierz"
          [options]="clientOptions()"
          [value]="clientId()"
          (valueChange)="onClient($event)"
        />

        <book-space-month-picker
          label="Od miesiąca"
          [value]="fromMonth()"
          [disabled]="fromTheBeginning()"
          (valueChange)="onFromMonth($event)"
        />
        <book-space-month-picker
          label="Do miesiąca"
          [value]="toMonth()"
          [disabled]="fromTheBeginning()"
          (valueChange)="onToMonth($event)"
        />

        <book-space-checkbox
          label="Podsumowanie od początku"
          [checked]="fromTheBeginning()"
          (checkedChange)="onFromTheBeginning($event)"
        />
      </div>

      @if (rangeError(); as error) {
        <p role="alert">{{ error }}</p>
      }

      <div class="bs-summary__actions">
        <book-space-button [disabled]="!canGenerate()" (pressed)="generate()">
          Generuj podsumowanie
        </book-space-button>
        <book-space-button variant="secondary" (pressed)="clear()">Wyczyść</book-space-button>
        <book-space-button variant="secondary" [disabled]="!canGenerate()" (pressed)="downloadAllCsv()">
          Pobierz raport wszystkich klientów [.csv]
        </book-space-button>
      </div>

      @if (summaryResource.isLoading()) {
        <p role="status">Wczytywanie podsumowania…</p>
      } @else if (summaryResource.status() === 'error') {
        <p role="alert">Nie udało się wygenerować podsumowania.</p>
      } @else if (summary(); as current) {
        <section class="bs-printable" aria-label="Raport podsumowania">
          <h2>Raport najmów za okres</h2>
          <p>{{ periodText() }}</p>

          <dl class="bs-summary__client">
            @for (row of detailRows(); track row.label) {
              <dt>{{ row.label }}</dt>
              <dd>{{ row.value }}</dd>
            }
          </dl>

          <ul class="bs-summary__totals">
            @for (total of totals(); track total.city) {
              <li>
                <strong>{{ total.label }}</strong> : {{ total.total }}
              </li>
            }
          </ul>

          @for (report of reports(); track report.city) {
            @if (report.entries.length > 0) {
              <section class="bs-summary__city">
                <h3>{{ report.label }}</h3>
                @for (entry of report.entries; track $index) {
                  <div class="bs-summary__booking">
                    <p>
                      Budynek: {{ entry.building }} · Wynajmowana powierzchnia: {{ entry.size }} ·
                      Udzielony rabat: {{ entry.discount }} · Metoda płatności: {{ entry.payment }} ·
                      Dodatkowe opcje: {{ entry.extraOptions }}
                    </p>
                    @if (entry.selectedOptions) {
                      <p>Wybrane opcje: {{ entry.selectedOptions }}</p>
                    }
                    <p>Dodatkowe informacje: {{ entry.comments }}</p>
                    <ul>
                      @for (slot of entry.slots; track $index) {
                        <li>
                          Dzień: {{ slot.day }} · Godziny: {{ slot.hours }} · Liczba uczestników:
                          {{ slot.participants }} · Status: {{ slot.status }} · Uwagi: {{ slot.comments }}
                        </li>
                      }
                    </ul>
                  </div>
                }
              </section>
            }
          }
        </section>

        <div class="bs-summary__downloads">
          <book-space-button [disabled]="!canGenerate()" (pressed)="downloadClientCsv()">
            Pobierz plik [.csv]
          </book-space-button>
          <book-space-button variant="secondary" (pressed)="printReport()">
            Wyświetl szczegóły [.pdf]
          </book-space-button>
        </div>
      } @else {
        <p>Aby zobaczyć podsumowanie, wybierz klienta oraz miesiąc.</p>
      }
    </section>
  `,
  styles: [
    `
      .bs-summary__controls,
      .bs-summary__actions,
      .bs-summary__downloads {
        display: flex;
        flex-wrap: wrap;
        gap: 1rem;
        align-items: flex-end;
        margin-bottom: 1rem;
      }
      .bs-summary__totals {
        list-style: none;
        padding: 0;
      }
      .bs-summary__booking {
        border-bottom: 1px solid #ccc;
        padding: 0.5rem 0;
      }
    `,
  ],
})
export class SummaryTabComponent {
  private readonly clientsApi = inject(ClientsApi);
  private readonly reportingApi = inject(ReportingApi);
  private readonly reportExport = inject(ReportExport);

  readonly clientId = signal('');
  readonly fromMonth = signal<Date>(thisMonth());
  readonly toMonth = signal<Date>(thisMonth());
  readonly fromTheBeginning = signal(false);
  readonly generated = signal(false);

  /** The client list for the selector, walked page by page rather than read unbounded (FR-043). */
  readonly clientsResource = rxResource({stream: () => this.clientsApi.listAll()});

  readonly clientOptions = computed<ISelectOption[]>(() => {
    const clients = this.clientsResource.hasValue() ? this.clientsResource.value() : [];
    return clients.map((client) => ({value: client._id, label: client.name}));
  });

  private readonly period = computed<IReportPeriod>(() => ({
    fromTheBeginning: this.fromTheBeginning(),
    fromMonth: this.fromMonth(),
    toMonth: this.toMonth(),
  }));

  /** The range error, or `null` when the selection can be submitted (the corrected legacy bug). */
  readonly rangeError = computed(() =>
    rangeError(this.fromMonth(), this.toMonth(), this.fromTheBeginning())
  );

  /** A client and a valid range are the two preconditions for generating or exporting. */
  readonly canGenerate = computed(() => this.clientId() !== '' && this.rangeError() === null);

  /**
   * The generated summary. The resource is idle until "Generuj podsumowanie" is pressed, and
   * re-reads when the selection changes afterwards; an incomplete or inverted selection leaves it
   * idle rather than sending a request the server would answer `422`.
   */
  readonly summaryResource = rxResource({
    params: () => {
      if (!this.generated() || !this.canGenerate()) {
        return undefined;
      }
      return this.query();
    },
    stream: ({params}) => this.reportingApi.summary(params),
  });

  readonly summary = computed<IClientSummary | null>(() =>
    this.summaryResource.hasValue() ? this.summaryResource.value() : null
  );

  readonly detailRows = computed(() => {
    const summary = this.summary();
    return summary === null ? [] : clientDetailRows(summary.client);
  });

  readonly totals = computed(() => {
    const summary = this.summary();
    return summary === null ? [] : cityTotals(summary);
  });

  readonly reports = computed(() => {
    const summary = this.summary();
    return summary === null ? [] : cityReports(summary);
  });

  readonly periodText = computed(() => periodText(this.period()));

  onClient(clientId: string): void {
    this.clientId.set(clientId);
  }

  /** Changing the start month leaves the end month untouched (the legacy bug is fixed here). */
  onFromMonth(fromMonth: Date): void {
    this.fromMonth.set(fromMonth);
  }

  onToMonth(toMonth: Date): void {
    this.toMonth.set(toMonth);
  }

  onFromTheBeginning(fromTheBeginning: boolean): void {
    this.fromTheBeginning.set(fromTheBeginning);
  }

  generate(): void {
    this.generated.set(true);
  }

  clear(): void {
    this.clientId.set('');
    this.fromMonth.set(thisMonth());
    this.toMonth.set(thisMonth());
    this.fromTheBeginning.set(false);
    this.generated.set(false);
  }

  /** Downloads the selected client's CSV (FR-028), named per the legacy pattern. */
  downloadClientCsv(): void {
    const summary = this.summary();
    if (summary === null) {
      return;
    }
    const filename = csvFilename(summary.client.name, this.period(), false);
    this.reportingApi.summaryCsv(this.query()).subscribe((csv) => this.reportExport.download(filename, csv));
  }

  /** Downloads every client's CSV (FR-029), named per the legacy pattern. */
  downloadAllCsv(): void {
    const filename = csvFilename(null, this.period(), true);
    this.reportingApi.summaryCsv({...this.query(), clientId: undefined}).subscribe((csv) =>
      this.reportExport.download(filename, csv)
    );
  }

  /** Opens the browser's print dialog over the rendered report (FR-030). */
  printReport(): void {
    this.reportExport.print();
  }

  private query() {
    const fromTheBeginning = this.fromTheBeginning();
    return {
      clientId: this.clientId(),
      fromTheBeginning: fromTheBeginning ? true : undefined,
      fromMonth: fromTheBeginning ? undefined : this.fromMonth(),
      toMonth: fromTheBeginning ? undefined : this.toMonth(),
    };
  }
}

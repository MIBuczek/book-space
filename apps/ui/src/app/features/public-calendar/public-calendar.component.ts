import { Component } from '@angular/core';

/**
 * The public calendar route.
 *
 * A placeholder for T032: it proves the route resolves and renders inside the
 * shell. T034 replaces the body with the city/facility selectors and the
 * weekly/day/list views.
 */
@Component({
  selector: 'book-space-public-calendar',
  template: `
    <section class="bs-page">
      <h1>Reservation calendar</h1>
      <p>The public calendar is being built (T034).</p>
    </section>
  `,
  styles: [
    `
      .bs-page {
        padding: 1.5rem;
      }
    `,
  ],
})
export class PublicCalendarComponent {}

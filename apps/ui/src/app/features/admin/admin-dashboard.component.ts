import { Component } from '@angular/core';

/**
 * The admin landing page.
 *
 * A placeholder for T032: it proves the guarded admin chunk loads and renders.
 * T036 (bookings) is the first tab that replaces this; the tab navigation lands
 * with it.
 */
@Component({
  selector: 'book-space-admin-dashboard',
  template: `
    <section class="bs-page">
      <h1>Administration</h1>
      <p>The admin tabs are being built (T036–T039).</p>
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
export class AdminDashboardComponent {}

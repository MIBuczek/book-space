import { Component } from '@angular/core';

/**
 * The contact route.
 *
 * A placeholder for T032; the form and RODO clause are T040's.
 */
@Component({
  selector: 'book-space-contact',
  template: `
    <section class="bs-page">
      <h1>Contact</h1>
      <p>The contact form is being built (T040).</p>
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
export class ContactComponent {}

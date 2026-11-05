import { Component } from '@angular/core';

/**
 * The footer shared by every page.
 *
 * Kept minimal for T032; the informational links (privacy, cookie notice) are
 * T040's. It exists now so the shell has the layout slots a page can rely on
 * without each page adding its own.
 */
@Component({
  selector: 'book-space-footer',
  template: `
    <footer class="bs-footer">
      <p>SISK Siechnice — reservation system</p>
    </footer>
  `,
  styles: [
    `
      .bs-footer {
        margin-top: auto;
        padding: 1rem 1.5rem;
        border-top: 1px solid #d9d9d9;
        color: #5a5a5a;
        font-size: 0.875rem;
      }
    `,
  ],
})
export class FooterComponent {}

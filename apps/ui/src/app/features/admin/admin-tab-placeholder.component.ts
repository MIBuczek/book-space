import { Component, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

/**
 * A tab's placeholder body.
 *
 * T033 lands the shell, the routing and the role-derived navigation; the tab contents are
 * T036–T039. One placeholder serves every tab and takes its heading from the route's `data`,
 * so each tab is a distinct route (and a distinct guarded entry) without five near-identical
 * components that would each need their own spec.
 */
@Component({
  selector: 'book-space-admin-tab',
  imports: [TranslatePipe],
  template: `
    <section class="bs-page">
      <h1>{{ title() | translate }}</h1>
      <p>{{ 'admin.placeholder.body' | translate }}</p>
    </section>
  `,
  styles: [
    `
      .bs-page {
        padding: 1rem 0;
      }
    `,
  ],
})
export class AdminTabPlaceholderComponent {
  readonly title = input('admin.placeholder.title');
}

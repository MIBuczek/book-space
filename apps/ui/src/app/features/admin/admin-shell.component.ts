import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { SessionStore } from '../../core/session.store';
import { ButtonComponent } from '../../shared/ui';
import { visibleAdminTabs } from '../../shell/navigation';

/**
 * The admin area's frame: the role-derived tab navigation and the routed tab.
 *
 * The tabs come from `visibleAdminTabs(session.capabilities())` — the capabilities the API
 * resolved — so a hidden tab is hidden because the server said the account may not use it,
 * not because of a role check repeated here. The same capability guards each tab's route, so
 * the menu and the routes cannot disagree.
 *
 * A caller with no session never reaches this component: `authGuard` and
 * `capabilityGuard('staff')` on the parent route run first.
 */
@Component({
  selector: 'book-space-admin-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ButtonComponent],
  template: `
    <div class="bs-admin">
      <nav class="bs-admin__tabs" aria-label="Admin sections">
        <ul>
          @for (tab of tabs(); track tab.path) {
            <li>
              <a
                [routerLink]="tab.path"
                routerLinkActive="active"
                [routerLinkActiveOptions]="{ exact: false }"
              >
                {{ tab.label }}
              </a>
            </li>
          }
        </ul>
        <book-space-button variant="secondary" (pressed)="signOut()">Sign out</book-space-button>
      </nav>
      <section class="bs-admin__content">
        <router-outlet />
      </section>
    </div>
  `,
  styles: [
    `
      .bs-admin {
        padding: 1.5rem;
      }
      .bs-admin__tabs {
        display: flex;
        align-items: center;
        gap: 1rem;
        border-bottom: 1px solid #d9d9d9;
        padding-bottom: 0.5rem;
        margin-bottom: 1rem;
      }
      .bs-admin__tabs ul {
        display: flex;
        gap: 1rem;
        list-style: none;
        margin: 0;
        padding: 0;
      }
      .bs-admin__tabs a.active {
        font-weight: 700;
        color: #2f6f3e;
      }
      .bs-admin__tabs book-space-button {
        margin-left: auto;
      }
    `,
  ],
})
export class AdminShellComponent {
  private readonly session = inject(SessionStore);
  private readonly auth = inject(AuthService);

  readonly tabs = computed(() => visibleAdminTabs(this.session.capabilities()));

  signOut(): void {
    this.auth.signOut().subscribe();
  }
}

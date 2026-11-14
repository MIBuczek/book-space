import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
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
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ButtonComponent, TranslatePipe],
  template: `
    <div class="bs-admin">
      <nav class="bs-admin__tabs" [attr.aria-label]="'admin.sectionsAria' | translate">
        <ul>
          @for (tab of tabs(); track tab.path) {
            <li>
              <a
                [routerLink]="tab.path"
                routerLinkActive="active"
                ariaCurrentWhenActive="page"
                [routerLinkActiveOptions]="{ exact: false }"
              >
                {{ tab.label | translate }}
              </a>
            </li>
          }
        </ul>
        <book-space-button variant="secondary" (pressed)="signOut()">
          {{ 'admin.signOut' | translate }}
        </book-space-button>
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
  private readonly router = inject(Router);

  readonly tabs = computed(() => visibleAdminTabs(this.session.capabilities()));

  /**
   * Signs out and leaves the admin area (US2 scenario 6).
   *
   * Navigating away is part of the action, not a nicety: `authGuard` is a `CanMatchFn`, so it
   * runs on navigation and not when the session changes. Clearing the session without moving
   * therefore leaves the administrator on the admin route with the tabs gone and the loaded
   * tab still rendered — a stranded state the top navigation's sign-out (which navigates to
   * `/`) does not have. Both controls now behave the same way.
   */
  signOut(): void {
    this.auth.signOut().subscribe(() => void this.router.navigate(['/']));
  }
}

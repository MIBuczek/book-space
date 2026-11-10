import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { COPY } from '@booking/copy';
import { AuthService } from '../core/auth.service';
import { SessionStore } from '../core/session.store';
import { ButtonComponent } from '../shared/ui';

/**
 * The top navigation, shared by the public and admin areas.
 *
 * The admin link is offered when the account has the `staff` capability — the API's answer,
 * not a role re-derived here — so a role or deny-list change reaches the menu without a
 * redeploy. This is presentation, not enforcement: the server decides what a request may do
 * (constitution: server-side enforcement), so a hidden link is a courtesy, not a control.
 *
 * The labels come from the shared copy catalogue (NFR-005, T061), so no Polish text is
 * hardcoded in the template. The brand is the product name, not user-facing copy.
 */
@Component({
  selector: 'book-space-nav',
  imports: [RouterLink, RouterLinkActive, ButtonComponent],
  template: `
    <nav class="bs-nav" [attr.aria-label]="copy.ariaLabel">
      <a class="bs-nav__brand" routerLink="/">Book Space</a>
      <ul class="bs-nav__links">
        <li>
          <a
            routerLink="/"
            routerLinkActive="active"
            ariaCurrentWhenActive="page"
            [routerLinkActiveOptions]="{ exact: true }"
          >
            {{ copy.calendar }}
          </a>
        </li>
        <li>
          <a routerLink="/booking-request" routerLinkActive="active" ariaCurrentWhenActive="page">
            {{ copy.bookingRequest }}
          </a>
        </li>
        <li>
          <a routerLink="/contact" routerLinkActive="active" ariaCurrentWhenActive="page">
            {{ copy.contact }}
          </a>
        </li>
        @if (session.capabilities()?.staff) {
          <li>
            <a routerLink="/admin" routerLinkActive="active" ariaCurrentWhenActive="page">
              {{ copy.admin }}
            </a>
          </li>
        }
      </ul>
      <div class="bs-nav__session">
        @if (session.isAuthenticated()) {
          <span class="bs-nav__user">{{ session.user()?.email }}</span>
          <book-space-button variant="secondary" (pressed)="signOut()">
            {{ copy.signOut }}
          </book-space-button>
        } @else {
          <a routerLink="/sign-in">{{ copy.signIn }}</a>
        }
      </div>
    </nav>
  `,
  styles: [
    `
      .bs-nav {
        display: flex;
        align-items: center;
        gap: 1.5rem;
        padding: 1rem 1.5rem;
        border-bottom: 1px solid #d9d9d9;
      }
      .bs-nav__links {
        display: flex;
        gap: 1rem;
        list-style: none;
        margin: 0;
        padding: 0;
      }
      .bs-nav__links a.active {
        font-weight: 700;
        color: #2f6f3e;
      }
      .bs-nav__brand {
        font-weight: 700;
      }
      .bs-nav__session {
        margin-left: auto;
        display: flex;
        align-items: center;
        gap: 0.75rem;
      }
    `,
  ],
})
export class NavComponent {
  readonly copy = COPY.nav;
  readonly session = inject(SessionStore);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  signOut(): void {
    this.auth.signOut().subscribe(() => void this.router.navigate(['/']));
  }
}

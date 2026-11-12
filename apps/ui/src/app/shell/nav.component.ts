import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../core/auth.service';
import { SessionStore } from '../core/session.store';
import { ButtonComponent } from '../shared/ui';
import { LanguageSwitchComponent } from './language-switch.component';

/**
 * The top navigation, shared by the public and admin areas.
 *
 * The admin link is offered when the account has the `staff` capability — the API's answer,
 * not a role re-derived here — so a role or deny-list change reaches the menu without a
 * redeploy. This is presentation, not enforcement: the server decides what a request may do
 * (constitution: server-side enforcement), so a hidden link is a courtesy, not a control.
 *
 * The labels are translation keys (FR-001), so the navigation re-renders on a language switch
 * without a rebuild. The language switch itself is hosted here, so it is reachable from every
 * page including the sign-in one.
 */
@Component({
  selector: 'book-space-nav',
  imports: [RouterLink, RouterLinkActive, ButtonComponent, TranslatePipe, LanguageSwitchComponent],
  template: `
    <nav class="bs-nav" [attr.aria-label]="'nav.ariaLabel' | translate">
      <a class="bs-nav__brand" routerLink="/">Book Space</a>
      <ul class="bs-nav__links">
        <li>
          <a
            routerLink="/"
            routerLinkActive="active"
            ariaCurrentWhenActive="page"
            [routerLinkActiveOptions]="{ exact: true }"
          >
            {{ 'nav.calendar' | translate }}
          </a>
        </li>
        <li>
          <a routerLink="/booking-request" routerLinkActive="active" ariaCurrentWhenActive="page">
            {{ 'nav.bookingRequest' | translate }}
          </a>
        </li>
        <li>
          <a routerLink="/contact" routerLinkActive="active" ariaCurrentWhenActive="page">
            {{ 'nav.contact' | translate }}
          </a>
        </li>
        @if (session.capabilities()?.staff) {
          <li>
            <a routerLink="/admin" routerLinkActive="active" ariaCurrentWhenActive="page">
              {{ 'nav.admin' | translate }}
            </a>
          </li>
        }
      </ul>
      <div class="bs-nav__session">
        <book-space-language-switch />
        @if (session.isAuthenticated()) {
          <span class="bs-nav__user">{{ session.user()?.email }}</span>
          <book-space-button variant="secondary" (pressed)="signOut()">
            {{ 'nav.signOut' | translate }}
          </book-space-button>
        } @else {
          <a routerLink="/sign-in">{{ 'nav.signIn' | translate }}</a>
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
  readonly session = inject(SessionStore);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  signOut(): void {
    this.auth.signOut().subscribe(() => void this.router.navigate(['/']));
  }
}

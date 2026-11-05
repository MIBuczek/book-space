import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../../core/auth.service';
import { ButtonComponent, InputComponent } from '../../shared/ui';

// Mirrors the server's `LoginUserDto` bounds (`contracts/openapi.yaml`), not the legacy
// form's 5–100. The server is the authority: a client that accepts a value the server
// rejects turns a specific problem into a generic "sign-in failed" after a round trip.
const EMAIL_MIN = 3;
const EMAIL_MAX = 125;
const PASSWORD_MIN = 6;
const PASSWORD_MAX = 30;

/**
 * The sign-in page.
 *
 * The two fields are signal state, not `[(ngModel)]`, because the app is zoneless: a plain
 * field read by the template would not update the view. Validation mirrors the server's
 * `LoginUserDto` — the address must contain `@` and be 3–125 characters, the password 6–30 —
 * and is checked here as well as on the server: the server rejects a malformed body with
 * `422`, but telling the user before the round trip is the point of the form. The legacy
 * form used 5–100; the server contract is narrower, and the client follows the contract so
 * it never sends a request the server will refuse.
 *
 * The failure message is the server's single "Invalid e-mail or password". The API does not
 * distinguish an unknown address from a wrong password (it answers one message for every
 * rejection), and the page must not invent a distinction the server refuses to make.
 */
@Component({
  selector: 'book-space-sign-in',
  imports: [ButtonComponent, InputComponent],
  template: `
    <section class="bs-page">
      <h1>Sign in</h1>
      <form (submit)="submit($event)" novalidate>
        <book-space-input
          label="E-mail"
          type="email"
          [value]="email()"
          [error]="emailError()"
          (valueChange)="onEmail($event)"
        />
        <book-space-input
          label="Password"
          type="password"
          [value]="password()"
          [error]="passwordError()"
          (valueChange)="onPassword($event)"
        />
        @if (formError()) {
          <p class="bs-sign-in__error" role="alert">{{ formError() }}</p>
        }
        <book-space-button type="submit" [disabled]="submitting()">Sign in</book-space-button>
      </form>
    </section>
  `,
  styles: [
    `
      .bs-page {
        padding: 1.5rem;
        max-width: 24rem;
      }
      form {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
      }
      .bs-sign-in__error {
        color: #a4262c;
      }
    `,
  ],
})
export class SignInComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly email = signal('');
  readonly password = signal('');
  /** The server's rejection, or a transport failure. */
  readonly formError = signal<string | null>(null);
  readonly submitting = signal(false);
  /** Field errors appear only after the first submit, so typing is not punished. */
  private readonly submitted = signal(false);

  readonly emailError = computed(() => (this.submitted() ? this.validateEmail(this.email()) : null));
  readonly passwordError = computed(() =>
    this.submitted() ? this.validatePassword(this.password()) : null
  );

  private validateEmail(value: string): string | null {
    if (value === '') {
      return 'E-mail is required';
    }
    if (!value.includes('@')) {
      return 'E-mail must contain @';
    }
    if (value.length < EMAIL_MIN || value.length > EMAIL_MAX) {
      return `E-mail must be ${EMAIL_MIN}–${EMAIL_MAX} characters`;
    }
    return null;
  }

  private validatePassword(value: string): string | null {
    if (value === '') {
      return 'Password is required';
    }
    if (value.length < PASSWORD_MIN || value.length > PASSWORD_MAX) {
      return `Password must be ${PASSWORD_MIN}–${PASSWORD_MAX} characters`;
    }
    return null;
  }

  onEmail(value: string): void {
    this.email.set(value);
  }

  onPassword(value: string): void {
    this.password.set(value);
  }

  submit(event: Event): void {
    event.preventDefault();
    this.submitted.set(true);
    this.formError.set(null);

    if (this.emailError() !== null || this.passwordError() !== null) {
      return;
    }

    this.submitting.set(true);
    this.auth.signIn({ email: this.email(), password: this.password() }).subscribe({
      next: () => void this.router.navigate(['/admin']),
      error: (error: unknown) => {
        this.submitting.set(false);
        this.formError.set(
          error instanceof HttpErrorResponse && error.status === 401
            ? 'Invalid e-mail or password'
            : 'Sign-in failed. Please try again.'
        );
      },
    });
  }
}

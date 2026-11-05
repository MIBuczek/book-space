import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../../core/auth.service';
import { ButtonComponent, InputComponent } from '../../shared/ui';

/**
 * The sign-in page.
 *
 * The two fields are signal state, not `[(ngModel)]`, because the app is
 * zoneless: a plain field read by the template would not update the view. The
 * error message is deliberately the server's single "Invalid e-mail or
 * password" — the API does not distinguish an unknown address from a wrong
 * password, and the page must not invent a distinction the server refuses to
 * make.
 */
@Component({
  selector: 'book-space-sign-in',
  imports: [ButtonComponent, InputComponent],
  template: `
    <section class="bs-page">
      <h1>Sign in</h1>
      <form (submit)="submit($event)">
        <book-space-input label="E-mail" type="email" (valueChange)="email.set($event)" />
        <book-space-input label="Password" type="password" (valueChange)="password.set($event)" />
        @if (error()) {
          <p class="bs-sign-in__error" role="alert">{{ error() }}</p>
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
  readonly error = signal<string | null>(null);
  readonly submitting = signal(false);

  submit(event: Event): void {
    event.preventDefault();
    this.error.set(null);
    this.submitting.set(true);

    this.auth.signIn({ email: this.email(), password: this.password() }).subscribe({
      next: () => void this.router.navigate(['/admin']),
      error: (error: unknown) => {
        this.submitting.set(false);
        this.error.set(
          error instanceof HttpErrorResponse && error.status === 401
            ? 'Invalid e-mail or password'
            : 'Sign-in failed. Please try again.'
        );
      },
    });
  }
}

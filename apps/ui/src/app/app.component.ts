import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { FooterComponent } from './shell/footer.component';
import { NavComponent } from './shell/nav.component';

/**
 * The application shell: navigation, the routed page, and the footer.
 *
 * It holds no state of its own. The starter's `HttpClient` call to
 * `http://localhost:3000/api` is gone — a hard-coded origin is wrong in every
 * environment and the shell has no reason to talk to the API at all.
 */
@Component({
  selector: 'book-space-root',
  imports: [RouterOutlet, NavComponent, FooterComponent],
  template: `
    <div class="bs-app">
      <book-space-nav />
      <main class="bs-app__main">
        <router-outlet />
      </main>
      <book-space-footer />
    </div>
  `,
  styles: [
    `
      .bs-app {
        display: flex;
        flex-direction: column;
        min-height: 100vh;
      }
      .bs-app__main {
        flex: 1;
      }
    `,
  ],
})
export class AppComponent {}

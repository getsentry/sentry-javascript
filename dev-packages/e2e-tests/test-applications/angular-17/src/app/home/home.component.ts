import { Component } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Observable, switchMap } from 'rxjs';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink],
  template: `
  <main>
    <h1>Welcome to Sentry's Angular 17 E2E test app</h1>
    <ul>
      <li> <a [routerLink]="['/users', '123']">Visit User 123</a> </li>
    </ul>
    <button (click)="throwError">Throw error</button>
  </main>
`,
})
export class HomeComponent {
  throwError() {
    throw new Error('Error thrown from Angular 17 E2E test app');
  }
}

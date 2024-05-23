import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink],
  template: `
  <main>
    <h1>Welcome to Sentry's Angular 17 E2E test app</h1>
    <ul>
      <li> <a id="navLink" [routerLink]="['/users', '123']">Visit User 123</a> </li>
      <li> <a id="redirectLink" [routerLink]="['/redirect1']">Redirect</a> </li>
      <li> <a id="cancelLink" [routerLink]="['/cancel']">Cancel</a> </li>
      <li> <a id="nonExistentLink" [routerLink]="['/non-existent']">Error</a> </li>
      <li> <a id="componentTracking" [routerLink]="['/component-tracking']">Component Tracking</a> </li>
    </ul>
    <button id="errorBtn" (click)="throwError()">Throw error</button>
  </main>
`,
})
export class HomeComponent {
  throwError() {
    throw new Error('Error thrown from Angular 17 E2E test app');
  }
}

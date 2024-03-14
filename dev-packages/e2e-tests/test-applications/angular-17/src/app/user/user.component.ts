import { AsyncPipe } from '@angular/common';
import { Component } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Observable, map } from 'rxjs';

@Component({
  selector: 'app-user',
  standalone: true,
  imports: [AsyncPipe],
  template: `
    <h1>Hello User {{ userId$ | async }}</h1>
    <button id="userErrorBtn" (click)="throwError()">Throw error</button>
  `,
})
export class UserComponent {
  public userId$: Observable<string>;

  constructor(private route: ActivatedRoute) {
    this.userId$ = this.route.paramMap.pipe(map(params => params.get('id') || 'UNKNOWN USER'));
  }

  throwError() {
    throw new Error('Error thrown from user page');
  }
}

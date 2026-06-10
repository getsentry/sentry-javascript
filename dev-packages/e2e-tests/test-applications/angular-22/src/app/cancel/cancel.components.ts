import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-cancel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div></div>
  `,
})
export class CancelComponent {}

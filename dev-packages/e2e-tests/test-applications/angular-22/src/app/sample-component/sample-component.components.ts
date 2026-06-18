import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';

@Component({
  selector: 'app-sample-component',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div>Component</div>
  `,
})
export class SampleComponent implements OnInit {
  ngOnInit() {
    console.log('SampleComponent');
  }
}

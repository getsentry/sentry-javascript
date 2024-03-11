import { AfterViewInit, Component, OnInit } from '@angular/core';
import { TraceClassDecorator, TraceMethodDecorator, TraceModule } from '@sentry/angular-ivy';
import { SampleComponent } from '../sample-component/sample-component.components';

@Component({
  selector: 'app-cancel',
  standalone: true,
  imports: [TraceModule, SampleComponent],
  template: `<app-sample-component [trace]="'sample-component'"></app-sample-component>`,
})
@TraceClassDecorator()
export class ComponentTrackingComponent implements OnInit, AfterViewInit {
  @TraceMethodDecorator()
  ngOnInit() {}

  @TraceMethodDecorator()
  ngAfterViewInit() {}
}

import { AfterViewInit, Component, OnInit } from '@angular/core';
import { TraceClass, TraceMethod, TraceModule } from '@sentry/angular';
import { SampleComponent } from '../sample-component/sample-component.components';

@Component({
  selector: 'app-cancel',
  standalone: true,
  imports: [TraceModule, SampleComponent],
  template: `<app-sample-component [trace]="'sample-component'"></app-sample-component>`,
})
@TraceClass({ name: 'ComponentTrackingComponent' })
export class ComponentTrackingComponent implements OnInit, AfterViewInit {
  @TraceMethod({ name: 'ngOnInit' })
  ngOnInit() {}

  @TraceMethod()
  ngAfterViewInit() {}
}

import { Component, NgModule } from '@angular/core';
import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import type { Routes } from '@angular/router';
import { Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import type { Transaction } from '@sentry/types';

import { instrumentAngularRouting, TraceService } from '../../src';

@Component({
  template: '<router-outlet></router-outlet>',
})
export class AppComponent {}

@NgModule({
  providers: [
    {
      provide: TraceService,
      deps: [Router],
    },
  ],
})
export class AppModule {}

const defaultRoutes = [
  {
    path: '',
    component: AppComponent,
  },
];

export class TestEnv {
  constructor(
    public router: Router,
    public fixture: ComponentFixture<unknown>,
    public traceService: TraceService | null,
  ) {
    fixture.detectChanges();
  }

  public static async setup(conf: {
    routes?: Routes;
    components?: any[];
    defaultComponent?: any;
    customStartTransaction?: (context: any) => Transaction | undefined;
    startTransactionOnPageLoad?: boolean;
    startTransactionOnNavigation?: boolean;
    useTraceService?: boolean;
  }): Promise<TestEnv> {
    instrumentAngularRouting(
      conf.customStartTransaction || jest.fn(),
      conf.startTransactionOnPageLoad !== undefined ? conf.startTransactionOnPageLoad : true,
      conf.startTransactionOnNavigation !== undefined ? conf.startTransactionOnNavigation : true,
    );

    const useTraceService = conf.useTraceService !== undefined ? conf.useTraceService : true;
    const routes = conf.routes === undefined ? defaultRoutes : conf.routes;

    TestBed.configureTestingModule({
      imports: [AppModule, RouterTestingModule.withRoutes(routes)],
      declarations: [...(conf.components || []), AppComponent],
      providers: useTraceService
        ? [
            {
              provide: TraceService,
              deps: [Router],
            },
          ]
        : [],
    });

    const router: Router = TestBed.inject(Router);
    const traceService = useTraceService ? new TraceService(router) : null;
    const fixture = TestBed.createComponent(conf.defaultComponent || AppComponent);

    return new TestEnv(router, fixture, traceService);
  }

  public async navigateInAngular(url: string): Promise<void> {
    return new Promise(resolve => {
      return this.fixture.ngZone?.run(() => {
        void this.router.navigateByUrl(url).then(() => {
          this.fixture.detectChanges();
          resolve();
        });
      });
    });
  }

  public destroy(): void {
    if (this.traceService) {
      this.traceService.ngOnDestroy();
    }

    jest.clearAllMocks();
  }
}

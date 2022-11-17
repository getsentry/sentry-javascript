import { Component, NgModule, ViewContainerRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, Routes } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { Transaction } from '@sentry/types';

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
        : [
            {
              provide: ViewContainerRef,
              useValue: new TestViewContainerRef(),
            },
          ],
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

// create the test class
export class TestViewContainerRef extends ViewContainerRef {
  get element(): import('@angular/core').ElementRef<any> {
    throw new Error('Method not implemented.');
  }
  get injector(): import('@angular/core').Injector {
    throw new Error('Method not implemented.');
  }
  get parentInjector(): import('@angular/core').Injector {
    throw new Error('Method not implemented.');
  }
  clear(): void {
    throw new Error('Method not implemented.');
  }
  get(_index: number): import('@angular/core').ViewRef {
    throw new Error('Method not implemented.');
  }
  get length(): number {
    throw new Error('Method not implemented.');
  }
  createEmbeddedView<C>(
    _templateRef: import('@angular/core').TemplateRef<C>,
    _context?: C,
    _index?: number,
  ): import('@angular/core').EmbeddedViewRef<C> {
    throw new Error('Method not implemented.');
  }
  createComponent<C>(
    _componentFactory: import('@angular/core').ComponentFactory<C>,
    _index?: number,
    _injector?: import('@angular/core').Injector,
    _projectableNodes?: any[][],
    _ngModule?: import('@angular/core').NgModuleRef<any>,
  ): import('@angular/core').ComponentRef<C> {
    throw new Error('Method not implemented.');
  }
  insert(_viewRef: import('@angular/core').ViewRef, _index?: number): import('@angular/core').ViewRef {
    throw new Error('Method not implemented.');
  }
  move(_viewRef: import('@angular/core').ViewRef, _currentIndex: number): import('@angular/core').ViewRef {
    throw new Error('Method not implemented.');
  }
  indexOf(_viewRef: import('@angular/core').ViewRef): number {
    throw new Error('Method not implemented.');
  }
  remove(_index?: number): void {
    throw new Error('Method not implemented.');
  }
  detach(_index?: number): import('@angular/core').ViewRef {
    throw new Error('Method not implemented.');
  }
}

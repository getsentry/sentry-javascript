<p align="center">
  <a href="https://sentry.io" target="_blank" align="center">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-logo-black.png" width="280">
  </a>
  <br />
</p>

# Official Sentry SDK for Angular

## Links

- [Official SDK Docs](https://docs.sentry.io/platforms/javascript/angular/)
- [TypeDoc](http://getsentry.github.io/sentry-javascript/)

## General

This package is a wrapper around `@sentry/browser`, with added functionality related to Angular. All methods available
in `@sentry/browser` can be imported from `@sentry/angular`.

To use this SDK, call `Sentry.init(options)` before you bootstrap your Angular application.

```javascript
import { enableProdMode } from '@angular/core';
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import { init } from '@sentry/angular';

import { AppModule } from './app/app.module';

init({
  dsn: '__DSN__',
  // ...
});

// ...

enableProdMode();
platformBrowserDynamic()
  .bootstrapModule(AppModule)
  .then(success => console.log(`Bootstrap success`))
  .catch(err => console.error(err));
```

### ErrorHandler

`@sentry/angular` exports a function to instantiate ErrorHandler provider that will automatically send Javascript errors
captured by the Angular's error handler.

```javascript
import { NgModule, ErrorHandler } from '@angular/core';
import { createErrorHandler } from '@sentry/angular';

@NgModule({
  // ...
  providers: [
    {
      provide: ErrorHandler,
      useValue: createErrorHandler({
        showDialog: true,
      }),
    },
  ],
  // ...
})
export class AppModule {}
```

Additionally, `createErrorHandler` accepts a set of options that allows you to configure its behavior. For more details
see `ErrorHandlerOptions` interface in `src/errorhandler.ts`.

### Tracing

`@sentry/angular` exports a Trace Service, Directive and Decorators that leverage the `@sentry/tracing` Tracing
integration to add Angular related spans to transactions. If the Tracing integration is not enabled, this functionality
will not work. The service itself tracks route changes and durations, where directive and decorators are tracking
components initializations.

#### Install

Registering a Trace Service is a 3-step process.

1. Register and configure the `BrowserTracing` integration from `@sentry/tracing`, including custom Angular routing
   instrumentation:

```javascript
import { init, routingInstrumentation } from '@sentry/angular';
import { Integrations as TracingIntegrations } from '@sentry/tracing';

init({
  dsn: '__DSN__',
  integrations: [
    new TracingIntegrations.BrowserTracing({
      tracingOrigins: ['localhost', 'https://yourserver.io/api'],
      routingInstrumentation: routingInstrumentation,
    }),
  ],
  tracesSampleRate: 1,
});
```

2. Register `SentryTrace` as a provider in Angular's DI system, with a `Router` as its dependency:

```javascript
import { NgModule } from '@angular/core';
import { Router } from '@angular/router';
import { TraceService } from '@sentry/angular';

@NgModule({
  // ...
  providers: [
    {
      provide: TraceService,
      deps: [Router],
    },
  ],
  // ...
})
export class AppModule {}
```

3. Either require the `TraceService` from inside `AppModule` or use `APP_INITIALIZER` to force-instantiate Tracing.

```javascript
@NgModule({
  // ...
})
export class AppModule {
  constructor(trace: TraceService) {}
}
```

or

```javascript
import { APP_INITIALIZER } from '@angular/core';

@NgModule({
  // ...
  providers: [
    {
      provide: APP_INITIALIZER,
      useFactory: () => () => {},
      deps: [TraceService],
      multi: true,
    },
  ],
  // ...
})
export class AppModule {}
```

#### Use

To track Angular components as part of your transactions, you have 3 options.

_TraceDirective:_ used to track a duration between `OnInit` and `AfterViewInit` lifecycle hooks in template:

```javascript
import { TraceDirective } from '@sentry/angular';

@NgModule({
  // ...
  declarations: [TraceDirective],
  // ...
})
export class AppModule {}
```

Then inside your components template (keep in mind that directive name attribute is required):

```html
<app-header [trace]="'header'"></app-header>
<articles-list [trace]="'articles-list'"></articles-list>
<app-footer [trace]="'footer'"></app-footer>
```

_TraceClassDecorator:_ used to track a duration between `OnInit` and `AfterViewInit` lifecycle hooks in components:

```javascript
import { Component } from '@angular/core';
import { TraceClassDecorator } from '@sentry/angular';

@Component({
  selector: 'layout-header',
  templateUrl: './header.component.html',
})
@TraceClassDecorator()
export class HeaderComponent {
  // ...
}
```

_TraceMethodDecorator:_ used to track a specific lifecycle hooks as point-in-time spans in components:

```javascript
import { Component, OnInit } from '@angular/core';
import { TraceMethodDecorator } from '@sentry/angular';

@Component({
  selector: 'app-footer',
  templateUrl: './footer.component.html',
})
export class FooterComponent implements OnInit {
  @TraceMethodDecorator()
  ngOnInit() {}
}
```

You can also add your own custom spans by attaching them to the current active transaction using `getActiveTransaction`
helper. For example, if you'd like to track the duration of Angular boostraping process, you can do it as follows:

```javascript
import { enableProdMode } from '@angular/core';
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import { init, getActiveTransaction } from '@sentry/angular';

import { AppModule } from './app/app.module';

// ...

const activeTransaction = getActiveTransaction();
const boostrapSpan =
  activeTransaction &&
  activeTransaction.startChild({
    description: 'platform-browser-dynamic',
    op: 'angular.bootstrap',
  });

platformBrowserDynamic()
  .bootstrapModule(AppModule)
  .then(() => console.log(`Bootstrap success`))
  .catch(err => console.error(err));
  .finally(() => {
    if (bootstrapSpan) {
      boostrapSpan.finish();
    }
  })
```

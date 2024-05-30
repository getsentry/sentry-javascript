import { APP_INITIALIZER, ApplicationConfig, ErrorHandler } from '@angular/core';
import { Router, provideRouter } from '@angular/router';

import { TraceService, createErrorHandler } from '@sentry/angular';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    {
      provide: ErrorHandler,
      useValue: createErrorHandler(),
    },
    {
      provide: TraceService,
      deps: [Router],
    },
    {
      provide: APP_INITIALIZER,
      useFactory: () => () => {},
      deps: [TraceService],
      multi: true,
    },
  ],
};

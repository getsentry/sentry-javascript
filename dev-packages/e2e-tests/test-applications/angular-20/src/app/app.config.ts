import {
  ApplicationConfig,
  ErrorHandler,
  inject,
  provideAppInitializer,
  provideZoneChangeDetection,
} from '@angular/core';
import { Router, provideRouter } from '@angular/router';

import { TraceService, createErrorHandler } from '@sentry/angular';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    {
      provide: ErrorHandler,
      useValue: createErrorHandler(),
    },
    {
      provide: TraceService,
      deps: [Router],
    },
    provideAppInitializer(() => {
      inject(TraceService);
    }),
  ],
};

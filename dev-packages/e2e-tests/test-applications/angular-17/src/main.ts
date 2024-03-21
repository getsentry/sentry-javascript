import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';

import * as Sentry from '@sentry/angular';

Sentry.init({
  dsn: 'https://3b6c388182fb435097f41d181be2b2ba@o4504321058471936.ingest.sentry.io/4504321066008576',
  tracesSampleRate: 1.0,
  integrations: [Sentry.browserTracingIntegration({})],
  tunnel: `http://localhost:3031/`, // proxy server
  debug: true,
});

bootstrapApplication(AppComponent, appConfig).catch(err => console.error(err));

// Loaded via `node --import ./dist/instrument.js` so Sentry's ESM instrumentation
// hooks register before any application module is linked. Kept here too so the
// file is part of the build output (ESM caches it, so it is not re-executed).
import './instrument.js';

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

const PORT = 3030;

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(PORT);
}

bootstrap();

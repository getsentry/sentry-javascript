// Import this first
import './instrument';

// Import other modules
import { NestFactory } from '@nestjs/core';
import * as Sentry from '@sentry/nestjs';
import { AppModule1, AppModule2 } from './app.module';

const app1Port = 3030;
const app2Port = 3040;

async function bootstrap() {
  let app1 = await NestFactory.create(AppModule1);

  Sentry.setupNestErrorHandler(app1);

  await app1.listen(app1Port);

  const app2 = await NestFactory.create(AppModule2);
  await app2.listen(app2Port);
}

bootstrap();

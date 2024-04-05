import { NestFactory } from '@nestjs/core';
import * as Sentry from '@sentry/node';
import { AppModule1, AppModule2 } from './app.module';

const app1Port = 3030;
const app2Port = 3040;

async function bootstrap() {
  Sentry.init({
    environment: 'qa', // dynamic sampling bias to keep transactions
    dsn: process.env.E2E_TEST_DSN,
    tunnel: `http://localhost:3031/`, // proxy server
    tracesSampleRate: 1,
    tracePropagationTargets: ['http://localhost:3030', '/external-allowed'],
  });

  const app1 = await NestFactory.create(AppModule1);
  Sentry.setupNestErrorHandler(app1);

  await app1.listen(app1Port);

  const app2 = await NestFactory.create(AppModule2);
  await app2.listen(app2Port);
}

bootstrap();

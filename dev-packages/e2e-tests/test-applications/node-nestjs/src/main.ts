// Import this first
import './instrument';

// Import other modules
import { BaseExceptionFilter, HttpAdapterHost, NestFactory } from '@nestjs/core';
import * as Sentry from '@sentry/node';
import { AppModule1, AppModule2 } from './app.module';

const app1Port = 3030;
const app2Port = 3040;

async function bootstrap() {
  const app1 = await NestFactory.create(AppModule1);

  const { httpAdapter } = app1.get(HttpAdapterHost);
  Sentry.setupNestErrorHandler(app1, new BaseExceptionFilter(httpAdapter));

  await app1.listen(app1Port);

  const app2 = await NestFactory.create(AppModule2);
  await app2.listen(app2Port);
}

bootstrap();

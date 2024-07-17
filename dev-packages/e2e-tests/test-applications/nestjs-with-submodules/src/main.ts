// Import this first
import './instrument';

// Import other modules
import { BaseExceptionFilter, HttpAdapterHost, NestFactory } from '@nestjs/core';
import * as Sentry from '@sentry/nestjs';
import { AppModule } from './app.module';

const app1Port = 3030;

async function bootstrap() {
  const app1 = await NestFactory.create(AppModule);

  const { httpAdapter } = app1.get(HttpAdapterHost);
  Sentry.setupNestErrorHandler(app1, new BaseExceptionFilter(httpAdapter));

  await app1.listen(app1Port);
}

bootstrap();

// Import this first
import './instrument';

// Import other modules
import {BaseExceptionFilter, HttpAdapterHost, NestFactory} from '@nestjs/core';
import { AppModule } from './app.module';
import * as Sentry from "@sentry/nestjs";

const PORT = 3030;

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const { httpAdapter } = app.get(HttpAdapterHost);
  Sentry.setupNestErrorHandler(app, new BaseExceptionFilter(httpAdapter));

  await app.listen(PORT);
}

bootstrap();

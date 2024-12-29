// Import this first
import './instrument';

// Import other modules
import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import { SentryGlobalFilter } from '@sentry/nestjs/setup';
import { AppModule } from './app.module';

const PORT = 3030;

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const { httpAdapter } = app.get(HttpAdapterHost);
  app.useGlobalFilters(new SentryGlobalFilter(httpAdapter as any));

  await app.listen(PORT);
}

bootstrap();

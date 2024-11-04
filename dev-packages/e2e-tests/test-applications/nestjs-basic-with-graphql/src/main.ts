// Import this first
import './instrument';

// Import other modules
import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import { SentryGlobalGenericFilter } from '@sentry/nestjs/setup';
import { AppModule } from './app.module';

const PORT = 3030;

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const { httpAdapter } = app.get(HttpAdapterHost);
  app.useGlobalFilters(new SentryGlobalGenericFilter(httpAdapter as any));

  await app.listen(PORT);
}

bootstrap();

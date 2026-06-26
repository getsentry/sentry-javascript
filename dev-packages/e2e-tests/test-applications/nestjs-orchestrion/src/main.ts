// Import this first. It opts into diagnostics-channel injection and installs
// the module hooks before any `@nestjs/*` module is loaded below.
import './instrument';

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

const PORT = 3030;

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  await app.listen(PORT);
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
bootstrap();

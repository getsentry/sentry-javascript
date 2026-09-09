// Import this first
import './instrument';

// Import other modules
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

const PORT = 3030;

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(PORT);
}

bootstrap();

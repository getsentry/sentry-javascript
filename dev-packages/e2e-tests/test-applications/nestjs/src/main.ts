// Import this first
import './instrument';

// Import other modules
import { NestFactory } from '@nestjs/core';
import { AppModule1, AppModule2 } from './app.module';

const app1Port = 3030;
const app2Port = 3040;

async function bootstrap() {
  const app1 = await NestFactory.create(AppModule1);
  await app1.listen(app1Port);

  const app2 = await NestFactory.create(AppModule2);
  await app2.listen(app2Port);
}

bootstrap();

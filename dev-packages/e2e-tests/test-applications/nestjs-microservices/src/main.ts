// Import this first
import './instrument';

// Import other modules
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AppModule } from './app.module';

const PORT = 3030;
const MICROSERVICE_PORT = 3040;

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.TCP,
    options: {
      host: '127.0.0.1',
      port: MICROSERVICE_PORT,
    },
  });

  await app.startAllMicroservices();
  await app.listen(PORT);
}

bootstrap();

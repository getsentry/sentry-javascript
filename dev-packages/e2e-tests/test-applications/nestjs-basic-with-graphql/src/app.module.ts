import { ApolloDriver } from '@nestjs/apollo';
import { Logger, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { GraphQLModule } from '@nestjs/graphql';
import { SentryGlobalGenericFilter, SentryModule } from '@sentry/nestjs/setup';
import { AppController } from './app.controller';
import { AppResolver } from './app.resolver';

@Module({
  imports: [
    SentryModule.forRoot(),
    GraphQLModule.forRoot({
      driver: ApolloDriver,
      autoSchemaFile: true,
      playground: true, // sets up a playground on https://localhost:3000/graphql
    }),
  ],
  controllers: [AppController],
  providers: [
    AppResolver,
    {
      provide: APP_FILTER,
      useClass: SentryGlobalGenericFilter,
    },
    {
      provide: Logger,
      useClass: Logger,
    },
  ],
})
export class AppModule {}

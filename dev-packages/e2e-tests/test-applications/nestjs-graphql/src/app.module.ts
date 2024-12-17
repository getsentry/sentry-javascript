import { ApolloDriver } from '@nestjs/apollo';
import { Logger, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { GraphQLModule } from '@nestjs/graphql';
import { SentryGlobalFilter, SentryModule } from '@sentry/nestjs/setup';
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
  controllers: [],
  providers: [
    AppResolver,
    {
      provide: APP_FILTER,
      useClass: SentryGlobalFilter,
    },
    {
      provide: Logger,
      useClass: Logger,
    },
  ],
})
export class AppModule {}

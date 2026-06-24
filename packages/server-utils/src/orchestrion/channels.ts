/**
 * Fully-qualified `diagnostics_channel` names that orchestrion publishes to.
 *
 * Orchestrion's transform always prefixes the configured `channelName` with
 * `orchestrion:${module.name}:`. So a config of
 *   `{ channelName: 'query', module: { name: 'mysql' } }`
 * publishes to `orchestrion:mysql:query`.
 *
 * Subscribers (`integrations/<lib>/tracing-channel.ts`) consume the full
 * prefixed string from this map; the config files set only the unprefixed
 * suffix in `channelName`. Keeping both pieces in one file is what guarantees
 * they don't drift apart and silently stop firing.
 */
export const CHANNELS = {
  MYSQL_QUERY: 'orchestrion:mysql:query',
  NESTJS_APP_CREATION: 'orchestrion:@nestjs/core:nestFactoryCreate',
  NESTJS_ROUTER_CONTEXT: 'orchestrion:@nestjs/core:routerExecutionContextCreate',
  NESTJS_INJECTABLE: 'orchestrion:@nestjs/common:injectableDecorator',
  NESTJS_CATCH: 'orchestrion:@nestjs/common:catchDecorator',
  NESTJS_SCHEDULE_CRON: 'orchestrion:@nestjs/schedule:cronDecorator',
  NESTJS_SCHEDULE_INTERVAL: 'orchestrion:@nestjs/schedule:intervalDecorator',
  NESTJS_SCHEDULE_TIMEOUT: 'orchestrion:@nestjs/schedule:timeoutDecorator',
  NESTJS_ONEVENT: 'orchestrion:@nestjs/event-emitter:onEventDecorator',
  NESTJS_PROCESSOR: 'orchestrion:@nestjs/bullmq:processorDecorator',
} as const;

export type ChannelName = (typeof CHANNELS)[keyof typeof CHANNELS];

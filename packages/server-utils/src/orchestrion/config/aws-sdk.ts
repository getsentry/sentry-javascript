import type { InstrumentationConfig } from '../apmTypes';
import { getModuleNames } from './module-names';

// The AWS SDK (v3) routes every command through the smithy `Client.prototype.send` method. Which
// package hosts that `Client` class changed across versions, so we target all of them; only the one
// the app's client actually extends is ever invoked.
//
// - `@smithy/core` >= 3.24.0: the `Client` class moved into the `client` submodule bundle.
// - `@smithy/smithy-client`: the `Client` class for aws-sdk v3.363.0+ (pre-`@smithy/core` stack).
// - `@aws-sdk/smithy-client`: the `Client` class for older aws-sdk v3 releases.
//
// `send` is `async send(command, options)` (returns a promise), so `kind: 'Async'`.
export const awsSdkConfig = [
  {
    channelName: 'send',
    module: { name: '@smithy/core', versionRange: '>=3.24.0 <4', filePath: 'dist-cjs/submodules/client/index.js' },
    functionQuery: { className: 'Client', methodName: 'send', kind: 'Async' },
  },
  {
    channelName: 'send',
    module: { name: '@smithy/smithy-client', versionRange: '>=1.0.3 <5', filePath: 'dist-cjs/index.js' },
    functionQuery: { className: 'Client', methodName: 'send', kind: 'Async' },
  },
  {
    channelName: 'send',
    module: { name: '@aws-sdk/smithy-client', versionRange: '^3.1.0', filePath: 'dist-cjs/index.js' },
    functionQuery: { className: 'Client', methodName: 'send', kind: 'Async' },
  },
] satisfies InstrumentationConfig[];

export const awsSdkModuleNames = getModuleNames(awsSdkConfig);

export const awsSdkChannels = {
  AWS_SMITHY_CORE_SEND: 'orchestrion:@smithy/core:send',
  AWS_SMITHY_CLIENT_SEND: 'orchestrion:@smithy/smithy-client:send',
  AWS_SDK_SMITHY_CLIENT_SEND: 'orchestrion:@aws-sdk/smithy-client:send',
} as const;

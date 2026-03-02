import { NodeRuntime } from '@effect/platform-node';
import { Layer } from 'effect';
import { effectLayer } from '@sentry/core/effect';
import { HttpLive } from './Http.js';

const MainLive = HttpLive.pipe(Layer.provide(effectLayer));

MainLive.pipe(Layer.launch, NodeRuntime.runMain);

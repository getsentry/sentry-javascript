/*
 * Copyright The OpenTelemetry Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import type { Span } from '@opentelemetry/api';
import type { FastifyReply } from 'fastify';

export interface HookHandlerDoneFunction {
  (): void;
}
// biome-ignore lint/nursery/noUnusedImports:
import type { spanRequestSymbol } from './constants';

export type HandlerOriginal = (() => Promise<unknown>) & (() => void);

export type PluginFastifyReply = FastifyReply & {
  [spanRequestSymbol]?: Span[];
};

// Vendored from https://github.com/open-telemetry/opentelemetry-js-contrib/blob/407f61591ba69a39a6908264379d4d98a48dbec4/plugins/node/opentelemetry-instrumentation-fastify/src/enums/AttributeNames.ts
//
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

export enum AttributeNames {
  FASTIFY_NAME = 'fastify.name',
  FASTIFY_TYPE = 'fastify.type',
  HOOK_NAME = 'hook.name',
  PLUGIN_NAME = 'plugin.name',
}

export enum FastifyTypes {
  MIDDLEWARE = 'middleware',
  REQUEST_HANDLER = 'request_handler',
}

export enum FastifyNames {
  MIDDLEWARE = 'middleware',
  REQUEST_HANDLER = 'request handler',
}

/*
 * Copyright Prisma
 * SPDX-License-Identifier: Apache-2.0
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/prisma/prisma/tree/b6feea5565ec577545a79547d24273ccdd11b4c7/packages/instrumentation
 * - Upstream version: @prisma/instrumentation@7.8.0
 * - Replaced `import packageJson from '../package.json'` with hardcoded values
 */
/* eslint-disable */

import { SDK_VERSION } from '@sentry/core';

export const VERSION = SDK_VERSION;

export const NAME = '@sentry/instrumentation-prisma';

export const MODULE_NAME = '@prisma/client';

export const SUPPORTED_MODULE_VERSIONS = ['>=5.0.0'];

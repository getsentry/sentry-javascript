/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 *
 * NOTICE from the Sentry authors:
 * - Vendored from: https://github.com/open-telemetry/opentelemetry-js-contrib/tree/15ef7506553f631ea4181391e0c5725a56f0d082/packages/instrumentation-fs
 * - Upstream version: @opentelemetry/instrumentation-fs@0.37.0
 */
/* eslint-disable */

import type { FunctionPropertyNames, FMember } from './types';
import type * as fs from 'fs';
type FS = typeof fs;

export function splitTwoLevels<FSObject>(
  functionName: FMember,
): [FunctionPropertyNames<FSObject> & string] | [FunctionPropertyNames<FSObject> & string, string] {
  const memberParts = functionName.split('.');
  if (memberParts.length > 1) {
    if (memberParts.length !== 2) throw Error(`Invalid member function name ${functionName}`);
    return memberParts as [FunctionPropertyNames<FSObject> & string, string];
  } else {
    return [functionName as FunctionPropertyNames<FSObject> & string];
  }
}

export function indexFs<FSObject extends FS | FS['promises']>(
  fs: FSObject,
  member: FMember,
): { objectToPatch: any; functionNameToPatch: string } {
  if (!member) throw new Error(JSON.stringify({ member }));
  const splitResult = splitTwoLevels<FSObject>(member);
  const [functionName1, functionName2] = splitResult;
  if (functionName2) {
    return {
      objectToPatch: fs[functionName1],
      functionNameToPatch: functionName2,
    };
  } else {
    return {
      objectToPatch: fs,
      functionNameToPatch: functionName1,
    };
  }
}

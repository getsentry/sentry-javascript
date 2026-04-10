/**
 * RequireInTheMiddle singleton for efficient CJS module patching.
 *
 * Provides a single `require-in-the-middle` hook with trie-based module name matching
 * for better performance when using many module wrappers.
 *
 * This file is a derivative work based on OpenTelemetry's `RequireInTheMiddleSingleton`
 * and `ModuleNameTrie` implementations.
 *
 * <https://github.com/open-telemetry/opentelemetry-js/tree/main/experimental/packages/opentelemetry-instrumentation/src/platform/node>
 *
 * Extended under the terms of the Apache 2.0 license linked below:
 *
 * ----
 *
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

/* eslint-disable no-param-reassign */

import * as path from 'node:path';
import { Hook } from 'require-in-the-middle';

/** Separator used in module names and paths */
export const MODULE_NAME_SEPARATOR = '/';

/** Information about a registered module hook */
export interface ModuleHook {
  moduleName: string;
  onRequire: OnRequireFn;
}

/** Function signature for require hooks */
export type OnRequireFn = (exports: unknown, name: string, basedir: string | undefined) => unknown;

/**
 * Node in the ModuleNameTrie.
 * Each node represents a part of a module name (split by '/').
 */
class ModuleNameTrieNode {
  hooks: Array<{ hook: ModuleHook; insertedId: number }> = [];
  children: Map<string, ModuleNameTrieNode> = new Map();
}

/** Options for searching the trie */
interface ModuleNameTrieSearchOptions {
  /** Whether to return results in insertion order */
  maintainInsertionOrder?: boolean;
  /** Whether to return only full matches (not partial/prefix matches) */
  fullOnly?: boolean;
}

/**
 * Trie data structure for efficient module name matching.
 *
 * Module names are split by '/' and each part becomes a node in the trie.
 * This allows efficient matching of both exact module names and sub-paths.
 */
class ModuleNameTrie {
  private _trie: ModuleNameTrieNode = new ModuleNameTrieNode();
  private _counter: number = 0;

  /**
   * Insert a module hook into the trie.
   *
   * @param hook - The hook to insert
   */
  insert(hook: ModuleHook): void {
    let trieNode = this._trie;

    for (const moduleNamePart of hook.moduleName.split(MODULE_NAME_SEPARATOR)) {
      let nextNode = trieNode.children.get(moduleNamePart);
      if (!nextNode) {
        nextNode = new ModuleNameTrieNode();
        trieNode.children.set(moduleNamePart, nextNode);
      }
      trieNode = nextNode;
    }
    trieNode.hooks.push({ hook, insertedId: this._counter++ });
  }

  /**
   * Search for matching hooks in the trie.
   *
   * @param moduleName - Module name to search for
   * @param options - Search options
   * @returns Array of matching hooks
   */
  search(moduleName: string, options: ModuleNameTrieSearchOptions = {}): ModuleHook[] {
    const { maintainInsertionOrder, fullOnly } = options;
    let trieNode = this._trie;
    const results: ModuleNameTrieNode['hooks'] = [];
    let foundFull = true;

    for (const moduleNamePart of moduleName.split(MODULE_NAME_SEPARATOR)) {
      const nextNode = trieNode.children.get(moduleNamePart);
      if (!nextNode) {
        foundFull = false;
        break;
      }
      if (!fullOnly) {
        results.push(...nextNode.hooks);
      }
      trieNode = nextNode;
    }

    if (fullOnly && foundFull) {
      results.push(...trieNode.hooks);
    }

    if (results.length === 0) {
      return [];
    }
    if (results.length === 1) {
      // Safe to access [0] since we just checked length === 1
      return [results[0]!.hook];
    }
    if (maintainInsertionOrder) {
      results.sort((a, b) => a.insertedId - b.insertedId);
    }
    return results.map(({ hook }) => hook);
  }
}

/**
 * Normalize path separators to forward slash.
 * This is needed for Windows where path.sep is backslash.
 *
 * @param moduleNameOrPath - Module name or path to normalize
 * @returns Normalized module name or path with forward slashes
 */
function normalizePathSeparators(moduleNameOrPath: string): string {
  return path.sep !== MODULE_NAME_SEPARATOR
    ? moduleNameOrPath.split(path.sep).join(MODULE_NAME_SEPARATOR)
    : moduleNameOrPath;
}

/**
 * Singleton class for require-in-the-middle.
 *
 * Instead of creating a separate require patch for each module wrapper,
 * this creates a single patch that uses a trie to efficiently look up
 * registered hooks for each required module.
 *
 * WARNING: Multiple instances of this singleton (e.g., from multiple versions
 * of the SDK) will result in multiple RITM hooks, which impacts performance.
 */
export class RequireInTheMiddleSingleton {
  private _moduleNameTrie: ModuleNameTrie = new ModuleNameTrie();
  private static _instance?: RequireInTheMiddleSingleton;

  private constructor() {
    this._initialize();
  }

  private _initialize(): void {
    new Hook(
      // Intercept all `require` calls; we filter matching ones in the callback
      null,
      { internals: true },
      (exports, name, basedir) => {
        // For internal files on Windows, `name` will use backslash
        const normalizedModuleName = normalizePathSeparators(name);

        const matches = this._moduleNameTrie.search(normalizedModuleName, {
          maintainInsertionOrder: true,
          // For core modules (e.g. `fs`), do not match on sub-paths (e.g. `fs/promises`).
          // This matches the behavior of require-in-the-middle.
          // `basedir` is always `undefined` for core modules.
          fullOnly: basedir === undefined,
        });

        for (const { onRequire } of matches) {
          exports = onRequire(exports, name, basedir) as typeof exports;
        }

        return exports;
      },
    );
  }

  /**
   * Register a hook with require-in-the-middle.
   *
   * @param moduleName - Module name to intercept (e.g., 'express', 'pg')
   * @param onRequire - Hook function called when the module is required
   * @returns The registered hook information
   */
  register(moduleName: string, onRequire: OnRequireFn): ModuleHook {
    const hooked = { moduleName, onRequire };
    this._moduleNameTrie.insert(hooked);
    return hooked;
  }

  /**
   * Get the RequireInTheMiddleSingleton singleton instance.
   *
   * @returns The singleton instance
   */
  static getInstance(): RequireInTheMiddleSingleton {
    return (this._instance = this._instance ?? new RequireInTheMiddleSingleton());
  }
}

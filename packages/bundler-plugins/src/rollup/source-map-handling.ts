import * as path from 'node:path';
import type { SentryBuildPluginManager, SourceMapDecision, SourceMapKind, UploadStaging } from '../core';
import { isJsFile } from '../core';
import type { OutputBundle } from './debug-id-stamping';

export type RollupSourceMapSetting = boolean | 'inline' | 'hidden' | undefined;

export type OutputDestinationOptions = { dir?: string; file?: string };

/**
 * The output options that tell outputs of one directory apart. Several outputs can write into the
 * same directory at once, for example an ES and a CJS build, each with its own `sourcemap` setting.
 * `sourcemap` holds the setting as the plugin left it, so an output it switched to hidden maps
 * differs from one the user set.
 */
export type OutputMatch = {
  dir?: unknown;
  file?: unknown;
  format?: unknown;
  entryFileNames?: unknown;
  chunkFileNames?: unknown;
  preserveModules?: unknown;
  sourcemap?: unknown;
};

export type OutputOptions = OutputDestinationOptions & OutputMatch & { sourcemap?: RollupSourceMapSetting };

/** Maps Rollup's (and Vite's) `sourcemap` setting onto the plugin's source map kinds. */
export function sourceMapKindFromRollupSetting(setting: RollupSourceMapSetting): SourceMapKind {
  switch (setting) {
    case undefined:
      return 'unset';
    case false:
      return 'off';
    case true:
      return 'visible';
    default:
      return setting;
  }
}

/** The directory an output writes to. Decisions and stagings are keyed by it. */
export function getOutputDestination(outputOptions: OutputDestinationOptions): string {
  return path.resolve(outputOptions.dir ?? path.dirname(outputOptions.file ?? '.'));
}

const MATCH_KEYS = [
  'dir',
  'file',
  'format',
  'entryFileNames',
  'chunkFileNames',
  'preserveModules',
  'sourcemap',
] as const;

/** The raw options accept aliases that the normalized options do not carry. */
function normalizeFormat(format: unknown): unknown {
  switch (format) {
    case 'esm':
    case 'module':
      return 'es';
    case 'commonjs':
      return 'cjs';
    case 'systemjs':
      return 'system';
    default:
      return format;
  }
}

/** The fields of `OutputMatch` an output sets, in the form the normalized options carry them. */
export function getOutputMatch(outputOptions: OutputMatch): OutputMatch {
  const match: OutputMatch = {};
  for (const key of MATCH_KEYS) {
    const value = outputOptions[key];
    if (value === undefined) {
      continue;
    }
    match[key] =
      key === 'format' ? normalizeFormat(value) : key === 'dir' || key === 'file' ? path.resolve(String(value)) : value;
  }
  return match;
}

function matchesOutput(match: OutputMatch, outputOptions: OutputMatch): boolean {
  const actual = getOutputMatch(outputOptions);
  return MATCH_KEYS.every(key => match[key] === undefined || match[key] === actual[key]);
}

function isSameMatch(a: OutputMatch, b: OutputMatch): boolean {
  return MATCH_KEYS.every(key => a[key] === b[key]);
}

function countMatchFields(match: OutputMatch): number {
  return MATCH_KEYS.filter(key => match[key] !== undefined).length;
}

const DEBUG_ID_PATTERN = /sentry-dbid-([0-9a-f-]{36})|\/\/# debugId=([0-9a-f-]{36})/i;

/** Identifies the chunks of a bundle by name and debug ID, so a staging can be matched to its write. */
function getBundleSignature(bundle: OutputBundle): string {
  const entries: string[] = [];
  for (const output of Object.values(bundle)) {
    if (output.type === 'chunk' && isJsFile(output.fileName)) {
      const match = output.code.match(DEBUG_ID_PATTERN);
      entries.push(`${output.fileName}:${match?.[1] ?? match?.[2] ?? ''}`);
    }
  }
  return entries.sort().join('\n');
}

function getSourceMapFileName(output: { fileName: string; sourcemapFileName?: string | null }): string {
  return output.sourcemapFileName ?? `${output.fileName}.map`;
}

type PendingStaging = { staging: UploadStaging; signature: string; match: OutputMatch };

export type DecisionRecord = { match: OutputMatch; kind: SourceMapKind; decision: SourceMapDecision };

export type SourceMapHandling = {
  /** Rollup's `outputOptions` hook: decides for the output and switches it to hidden source maps when needed. */
  outputOptions: (rawOutputOptions: OutputOptions) => OutputOptions | null;
  /** Records the decision for an output, for bundlers that decide outside `outputOptions`. */
  setDecision: (destination: string, record: DecisionRecord) => void;
  /**
   * `generateBundle` with `order: 'post'`: copies each chunk and its source map into a staging folder
   * and drops the map asset from the bundle, so the bundler never writes it.
   */
  stageSourceMaps: (outputOptions: OutputOptions, bundle: OutputBundle, isWrite?: boolean) => Promise<void>;
  /**
   * Hands the staging of this bundle to `writeBundle`. Without a bundle (SvelteKit calls the hook
   * with output options only) the oldest staging is taken.
   */
  takeStaging: (
    outputOptions: OutputDestinationOptions,
    bundle: OutputBundle | undefined,
  ) => Promise<UploadStaging | undefined>;
};

/**
 * Source map decisions and upload stagings of one plugin instance. Keyed by output destination
 * because one instance can serve several outputs, and watch mode or several `write()` calls
 * rebuild the same one. Outputs that share a directory are told apart by `OutputMatch`.
 */
export function createSourceMapHandling(sentryBuildPluginManager: SentryBuildPluginManager): SourceMapHandling {
  const decisions = new Map<string, DecisionRecord[]>();
  const pendingStagings = new Map<string, PendingStaging[]>();

  function setDecision(destination: string, record: DecisionRecord): void {
    const records = decisions.get(destination) ?? [];
    const index = records.findIndex(existing => isSameMatch(existing.match, record.match));
    if (index === -1) {
      records.push(record);
    } else {
      records[index] = record;
    }
    decisions.set(destination, records);
  }

  function findDecision(destination: string, outputOptions: OutputOptions): DecisionRecord | undefined {
    const candidates = (decisions.get(destination) ?? []).filter(record => matchesOutput(record.match, outputOptions));
    // The record that sets the most fields describes this output best. Equal
    // candidates keep their order, so the first one recorded wins.
    return candidates.sort((a, b) => countMatchFields(b.match) - countMatchFields(a.match))[0];
  }

  function dropSourceMaps(bundle: OutputBundle): void {
    for (const output of Object.values(bundle)) {
      if (output.type === 'chunk' && isJsFile(output.fileName)) {
        // oxlint-disable-next-line typescript/no-dynamic-delete -- Rollup drops an asset when its key is deleted from the bundle
        delete bundle[getSourceMapFileName(output)];
      }
    }
  }

  return {
    outputOptions: rawOutputOptions => {
      const kind = sourceMapKindFromRollupSetting(rawOutputOptions.sourcemap);
      // Logged in `generateBundle`, which knows whether the output is written.
      const decision = sentryBuildPluginManager.sourceMaps.decide(kind, { log: false });
      const outputOptions = decision.enableHidden
        ? { ...rawOutputOptions, sourcemap: 'hidden' as const }
        : rawOutputOptions;
      setDecision(getOutputDestination(rawOutputOptions), { match: getOutputMatch(outputOptions), kind, decision });

      return decision.enableHidden ? outputOptions : null;
    },

    setDecision,

    stageSourceMaps: async (outputOptions, bundle, isWrite) => {
      const destination = getOutputDestination(outputOptions);
      const record = findDecision(destination, outputOptions);
      if (!record) {
        return;
      }

      // `generate()` never reaches `writeBundle`, so nothing would upload a staging. Maps the
      // plugin turned on are dropped, so the result holds what the user configured.
      if (isWrite === false) {
        if (record.kind === 'unset' && record.decision.enableHidden) {
          dropSourceMaps(bundle);
        }
        return;
      }

      sentryBuildPluginManager.sourceMaps.logDecision(record.decision);
      if (!record.decision.deleteAfterUpload) {
        return;
      }

      const staging = await sentryBuildPluginManager.createUploadStaging();

      try {
        for (const output of Object.values(bundle)) {
          if (output.type !== 'chunk' || !isJsFile(output.fileName)) {
            continue;
          }

          const mapFileName = getSourceMapFileName(output);
          const mapAsset = bundle[mapFileName];
          if (mapAsset?.type !== 'asset' || typeof mapAsset.source !== 'string') {
            continue;
          }

          const result = await staging.stage({
            code: output.code,
            mapSource: mapAsset.source,
            mapDir: path.join(destination, path.dirname(mapFileName)),
            chunkPath: path.join(destination, output.fileName),
          });

          if (result === 'staged') {
            // oxlint-disable-next-line typescript/no-dynamic-delete -- Rollup drops an asset when its key is deleted from the bundle
            delete bundle[mapFileName];
          } else if (result !== 'excluded') {
            sentryBuildPluginManager.logger.warn(
              `Could not prepare ${output.fileName} for upload, so its source map ${mapFileName} stays in the build output.`,
            );
          }
        }
      } catch (e) {
        // The error fails the build before anything is written.
        await staging.discard();
        throw e;
      }

      // A staging of the same output that no `writeBundle` took belongs to a
      // write that never finished. Stagings of other outputs to this directory
      // may still be in flight, so the shared list changes in place and without
      // an await in between.
      const stagings = pendingStagings.get(destination) ?? [];
      pendingStagings.set(destination, stagings);
      const superseded = stagings.filter(pending => isSameMatch(pending.match, record.match));
      for (const pending of superseded) {
        stagings.splice(stagings.indexOf(pending), 1);
      }
      stagings.push({ staging, signature: getBundleSignature(bundle), match: record.match });

      for (const pending of superseded) {
        sentryBuildPluginManager.logger.debug(
          `Discarding staged source maps of an earlier build of ${destination} that was never written.`,
        );
        await pending.staging.discard();
      }
    },

    takeStaging: async (outputOptions, bundle) => {
      const destination = getOutputDestination(outputOptions);
      const stagings = pendingStagings.get(destination) ?? [];

      if (!bundle) {
        return stagings.shift()?.staging;
      }

      const signature = getBundleSignature(bundle);
      const index = stagings.findIndex(pending => pending.signature === signature);
      return index === -1 ? undefined : stagings.splice(index, 1)[0]?.staging;
    },
  };
}

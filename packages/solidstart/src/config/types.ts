import type { defineConfig } from '@solidjs/start/config';
import type { Nitro } from 'nitropack';

// Nitro does not export this type
export type RollupConfig = {
  plugins: unknown[];
};

export type SolidStartInlineConfig = NonNullable<Parameters<typeof defineConfig>[0]>;

export type SolidStartInlineServerConfig = {
  plugins?: string[];
  hooks?: {
    close?: () => unknown;
    'rollup:before'?: (nitro: Nitro) => unknown;
  };
};

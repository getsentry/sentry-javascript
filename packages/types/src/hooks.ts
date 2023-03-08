import type { Envelope } from './envelope';
import type { Transaction } from './transaction';

export type TransactionHookName = 'startTransaction' | 'transactionFinish';
export type TransactionHookCallback = (transaction: Transaction) => void;

export type EnvelopeHookName = 'beforeEnvelope';
export type EnvelopeHookCallback = (envelope: Envelope) => void;

export type HookName = TransactionHookName | EnvelopeHookName;
export type HookCallback = TransactionHookCallback | EnvelopeHookCallback;

export type HookStoreItem<N extends HookName, C extends HookCallback> = Partial<{ [key in N]: C[] }>;

export type HookStore =
  // Hooks related to transaction start/finish
  HookStoreItem<TransactionHookName, TransactionHookCallback> &
    // Hooks related to envelope create and send
    HookStoreItem<EnvelopeHookName, EnvelopeHookCallback>;

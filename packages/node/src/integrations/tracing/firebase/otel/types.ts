import type { Span } from '@opentelemetry/api';
import type { InstrumentationConfig } from '@opentelemetry/instrumentation';

// Inlined types from 'firebase/app'
export interface FirebaseOptions {
  [key: string]: any;
  apiKey?: string;
  authDomain?: string;
  databaseURL?: string;
  projectId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
  measurementId?: string;
}

export interface FirebaseApp {
  name: string;
  options: FirebaseOptions;
  automaticDataCollectionEnabled: boolean;
  delete(): Promise<void>;
}

// Inlined types from 'firebase/firestore'
export interface DocumentData {
  [field: string]: any;
}

export type WithFieldValue<T> = T;

export type PartialWithFieldValue<T> = Partial<T>;

export interface SetOptions {
  merge?: boolean;
  mergeFields?: (string | number | symbol)[];
}

export interface DocumentReference<T = DocumentData, U extends DocumentData = DocumentData> {
  id: string;
  firestore: {
    app: FirebaseApp;
    settings: FirestoreSettings;
    useEmulator: (host: string, port: number) => void;
    toJSON: () => {
      app: FirebaseApp;
      settings: FirestoreSettings;
    };
  };
  type: 'collection' | 'document' | string;
  path: string;
  parent: CollectionReference<T, U>;
}

export interface CollectionReference<T = DocumentData, U extends DocumentData = DocumentData> {
  id: string;
  firestore: {
    app: FirebaseApp;
    settings: FirestoreSettings;
    useEmulator: (host: string, port: number) => void;
    toJSON: () => {
      app: FirebaseApp;
      settings: FirestoreSettings;
    };
  };
  type: string; // 'collection' or 'document'
  path: string;
  parent: DocumentReference<T, U> | null;
}

export interface QuerySnapshot<T = DocumentData, U extends DocumentData = DocumentData> {
  docs: Array<DocumentReference<T, U>>;
  size: number;
  empty: boolean;
}

export interface FirestoreSettings {
  host?: string;
  ssl?: boolean;
  ignoreUndefinedProperties?: boolean;
  cacheSizeBytes?: number;
  experimentalForceLongPolling?: boolean;
  experimentalAutoDetectLongPolling?: boolean;
  useFetchStreams?: boolean;
}

/**
 * Firebase Auto Instrumentation
 */
export interface FirebaseInstrumentationConfig extends InstrumentationConfig {
  firestoreSpanCreationHook?: FirestoreSpanCreationHook;
  functions?: FunctionsConfig;
}

export interface FunctionsConfig {
  requestHook?: RequestHook;
  responseHook?: ResponseHook;
  errorHook?: ErrorHook;
}

export type RequestHook = (span: Span) => void;
export type ResponseHook = (span: Span, error?: unknown) => void;
export type ErrorHook = (span: Span, error?: unknown) => Promise<void> | void;

export interface FirestoreSpanCreationHook {
  (span: Span): void;
}

// Function types (addDoc, getDocs, setDoc, deleteDoc) are defined below as types
export type GetDocsType<AppModelType = DocumentData, DbModelType extends DocumentData = DocumentData> = (
  query: CollectionReference<AppModelType, DbModelType>,
) => Promise<QuerySnapshot<AppModelType, DbModelType>>;

export type SetDocType<AppModelType = DocumentData, DbModelType extends DocumentData = DocumentData> = ((
  reference: DocumentReference<AppModelType, DbModelType>,
  data: WithFieldValue<AppModelType>,
) => Promise<void>) &
  ((
    reference: DocumentReference<AppModelType, DbModelType>,
    data: PartialWithFieldValue<AppModelType>,
    options: SetOptions,
  ) => Promise<void>);

export type AddDocType<AppModelType, DbModelType extends DocumentData> = (
  reference: CollectionReference<AppModelType, DbModelType>,
  data: WithFieldValue<AppModelType>,
) => Promise<DocumentReference<AppModelType, DbModelType>>;

export type DeleteDocType<AppModelType, DbModelType extends DocumentData> = (
  reference: DocumentReference<AppModelType, DbModelType>,
) => Promise<void>;

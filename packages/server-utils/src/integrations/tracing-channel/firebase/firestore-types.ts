/* eslint-disable @typescript-eslint/no-explicit-any */

// Minimal structural types inlined from `firebase/app` and `firebase/firestore`, kept just wide enough
// for the attributes the subscriber reads off a Firestore reference. Inlined (rather than imported) so
// `@sentry/server-utils` needs no firebase dependency.

export interface FirebaseOptions {
  [key: string]: any;
  apiKey?: string;
  projectId?: string;
  appId?: string;
  messagingSenderId?: string;
  storageBucket?: string;
}

export interface FirebaseApp {
  name: string;
  options: FirebaseOptions;
}

export interface FirestoreSettings {
  host?: string;
  ssl?: boolean;
}

interface FirestoreLike {
  app: FirebaseApp;
  settings: FirestoreSettings;
  toJSON: () => { app: FirebaseApp; settings: FirestoreSettings };
}

export interface DocumentData {
  [field: string]: any;
}

export interface DocumentReference {
  id: string;
  firestore: FirestoreLike;
  type: string;
  path: string;
  parent: CollectionReference | null;
}

export interface CollectionReference {
  id: string;
  firestore: FirestoreLike;
  type: string;
  path: string;
  parent: DocumentReference | null;
}

export type FirestoreReference = CollectionReference | DocumentReference;

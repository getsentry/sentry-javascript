import TestSection from 'ember-vite/components/test-section';

function createError(): void {
  const obj: Record<string, unknown> = {};
  (obj as { nonExistentFunction: () => void }).nonExistentFunction();
}

function createEmberError(): void {
  throw new Error('Whoops, looks like you have an EmberError');
}

function createFetchError(): void {
  void fetch('http://doesntexist.example');
}

<template>
  <TestSection @title="Throw Generic Javascript Error" @buttonLabel="Break Things!" @buttonFunction={{createError}} />
  <TestSection @title="Throw EmberError" @buttonLabel="Break Things!" @buttonFunction={{createEmberError}} />
  <TestSection @title="Error From Fetch" @buttonLabel="Break Things!" @buttonFunction={{createFetchError}} />
</template>

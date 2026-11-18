'use client';

import { useState } from 'react';

import { api } from '../trpc/react';

export function LatestPost() {
  const [latestPost] = api.post.getLatest.useSuspenseQuery();

  const utils = api.useUtils();
  const [name, setName] = useState('');
  const createPost = api.post.create.useMutation({
    onSuccess: async () => {
      await utils.post.invalidate();
      setName('');
    },
  });

  const throwingMutation = api.post.throwError.useMutation({
    onSuccess: async () => {
      await utils.post.invalidate();
      setName('');
    },
  });

  return (
    <div>
      {latestPost ? <p>Your most recent post: {latestPost.name}</p> : <p>You have no posts yet.</p>}
      <form
        onSubmit={e => {
          e.preventDefault();
          createPost.mutate({ name });
        }}
      >
        <input type="text" placeholder="Title" value={name} onChange={e => setName(e.target.value)} id="createInput" />
        <button
          type="submit"
          id="createButton"

          disabled={createPost.isPending}
        >
          {createPost.isPending ? 'Submitting...' : 'Submit'}
        </button>
      </form>
      <form
        onSubmit={e => {
          e.preventDefault();
          throwingMutation.mutate({ name: 'I love dogs' });
        }}
      >
        <button
          id="error-button"
          type="submit"

          disabled={throwingMutation.isPending}
        >
          THROW TRPC
        </button>
      </form>
    </div>
  );
}

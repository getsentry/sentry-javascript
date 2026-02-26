'use client';
import * as Sentry from '@sentry/nextjs';
import { useEffect, useState } from 'react';

export default function ThemeSwitcher() {
  const [feedback, setFeedback] = useState<ReturnType<typeof Sentry.getFeedback>>();
  useEffect(() => {
    setFeedback(Sentry.getFeedback());
  }, []);

  return (
    <div>
      <button
        className="hover:bg-hover px-4 py-2 rounded-md"
        type="button"
        data-testid="set-light-theme"
        onClick={() => feedback?.setTheme('light')}
      >
        Set Light Theme
      </button>
      <button
        className="hover:bg-hover px-4 py-2 rounded-md"
        type="button"
        data-testid="set-dark-theme"
        onClick={() => feedback?.setTheme('dark')}
      >
        Set Dark Theme
      </button>
      <button
        className="hover:bg-hover px-4 py-2 rounded-md"
        type="button"
        data-testid="set-system-theme"
        onClick={() => feedback?.setTheme('system')}
      >
        Set System Theme
      </button>
    </div>
  );
}

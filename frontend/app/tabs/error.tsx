'use client';

import { useEffect } from 'react';

interface PageErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function TabsError({ error, reset }: PageErrorProps) {
  useEffect(() => {
    console.error('[TabsError]', error);
  }, [error]);

  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3">
      <h2 className="text-lg font-semibold text-gray-900">Tab 管理加载失败</h2>
      <p className="text-sm text-gray-500">{error.message}</p>
      <button
        onClick={reset}
        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
      >
        重试
      </button>
    </div>
  );
}

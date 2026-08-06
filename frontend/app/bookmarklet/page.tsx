'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, XCircle, Loader2, ArrowLeft } from 'lucide-react';
import { cardsApi } from '@/services/api';
import type { Card } from '@/types';

type Status = 'loading' | 'success' | 'error';

export default function BookmarkletPage() {
  const [status, setStatus] = useState<Status>('loading');
  const [card, setCard] = useState<Card | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const url = params.get('url') || '';
    setSourceUrl(url);

    if (!url) {
      setStatus('error');
      setErrorMsg('缺少 url 参数，请通过 Bookmarklet 进入此页面');
      return;
    }

    cardsApi
      .create(url)
      .then((c) => {
        setCard(c);
        setStatus('success');
      })
      .catch((e: Error) => {
        setErrorMsg(e.message || '收藏失败');
        setStatus('error');
      });
  }, []);

  return (
    <div className="mx-auto max-w-lg py-16">
      <div className="card text-center">
        {status === 'loading' && (
          <>
            <Loader2 className="mx-auto mb-4 h-12 w-12 animate-spin text-primary" />
            <h1 className="text-xl font-semibold mb-2">正在收藏到 FlowShelf</h1>
            <p className="text-sm text-muted-foreground break-all">{sourceUrl}</p>
            <p className="mt-4 text-xs text-muted-foreground">
              AI 正在抓取正文并生成知识卡片，请稍候…
            </p>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-green-500" />
            <h1 className="text-xl font-semibold mb-2">收藏成功</h1>
            <p className="text-sm text-muted-foreground mb-1">已生成知识卡片：</p>
            <p className="font-medium mb-6 line-clamp-2">{card?.title}</p>
            <div className="flex justify-center gap-3">
              <Link href="/cards" className="button button-primary">
                查看卡片库
              </Link>
              <button
                onClick={() => window.close()}
                className="button button-outline"
              >
                关闭
              </button>
            </div>
          </>
        )}

        {status === 'error' && (
          <>
            <XCircle className="mx-auto mb-4 h-12 w-12 text-destructive" />
            <h1 className="text-xl font-semibold mb-2">收藏失败</h1>
            <p className="text-sm text-muted-foreground mb-6 break-all">{errorMsg}</p>
            <div className="flex justify-center gap-3">
              <Link href="/cards" className="button button-outline">
                <ArrowLeft className="mr-1 h-4 w-4" /> 返回卡片库
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

'use client';

import { useEffect } from 'react';

/**
 * 当 open=true 时，监听键盘 ESC 事件，触发 onClose。
 * 所有 Modal 共用，避免重复写 useEffect + addEventListener 模板代码。
 * 逻辑等效于原各 Modal 中的：
 *   useEffect(() => { if (!open) return; const h = (e)=>{if(e.key==='Escape')onClose()}; ... })
 */
export function useEscClose(open: boolean | undefined, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);
}

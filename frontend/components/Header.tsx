'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  { href: '/tabs', label: '🗂️ Tab 管理' },
  { href: '/cards', label: '📚 卡片库' },
  { href: '/toolbox', label: '🛠️ 工具箱' },
  { href: '/learning', label: '📥 暂存区' },
  { href: '/search', label: '🔍 全局搜索' },
];

export default function Header() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-14 items-center justify-between gap-4 px-4">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-2xl">🧩</span>
          <span className="text-lg font-bold">FlowShelf</span>
        </Link>
        <nav className="flex items-center gap-4">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href || pathname?.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`text-sm font-medium transition-colors ${
                  active
                    ? 'text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}

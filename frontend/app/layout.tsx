import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'FlowShelf - AI 数字信息管家',
  description: '你的 AI 数字信息管家——从信息洪流中沉淀个人知识资产，永不丢失常用工具。',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50">
        <div className="flex min-h-screen flex-col">
          {/* Header */}
          <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="container mx-auto flex h-14 items-center justify-between gap-4 px-4">
              <div className="flex items-center gap-2">
                <span className="text-2xl">🧩</span>
                <span className="text-lg font-bold">FlowShelf</span>
              </div>
              <nav className="flex items-center gap-4">
                <a href="/cards" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                  📚 卡片库
                </a>
                <a href="/toolbox" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                  🛠️ 工具箱
                </a>
                {/* 全局搜索：GET 表单跳转到 /search?q=...，跨卡片库+工具箱 */}
                <form action="/search" method="get" className="flex items-center">
                  <input
                    type="text"
                    name="q"
                    placeholder="🔍 搜索卡片 / 工具"
                    className="input h-9 w-44 md:w-56"
                    aria-label="全局搜索"
                  />
                </form>
              </nav>
            </div>
          </header>

          {/* Main Content */}
          <main className="flex-1">
            <div className="container mx-auto px-4 py-8">
              {children}
            </div>
          </main>

          {/* Footer */}
          <footer className="border-t border-border bg-background">
            <div className="container mx-auto flex h-14 items-center justify-center px-4 text-sm text-muted-foreground">
              FlowShelf © 2026 - AI 原生的数字资产管家
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
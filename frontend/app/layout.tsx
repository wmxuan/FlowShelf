import type { Metadata } from 'next';
import './globals.css';
import Header from '@/components/Header';
import Providers from '@/components/Providers';

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
        <Providers>
        <div className="flex min-h-screen flex-col">
          <Header />

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
        </Providers>
      </body>
    </html>
  );
}
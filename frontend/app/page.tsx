'use client';

import Link from 'next/link';
import { FileText, Wrench, Search, Sparkles, ArrowRight } from 'lucide-react';

export default function HomePage() {
  return (
    <div className="space-y-12">
      {/* Hero Section */}
      <section className="text-center py-16">
        <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-2 text-sm font-medium text-primary mb-6">
          <Sparkles className="h-4 w-4" />
          AI 原生知识管理
        </div>
        <h1 className="text-4xl font-bold tracking-tight sm:text-6xl mb-6">
          你的 AI 数字信息管家
        </h1>
        <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
          从信息洪流中沉淀个人知识资产，永不丢失常用工具。
          <br />
          <span className="text-sm">
            用 AI 解决"90% 书签永不访问"的结构性失败问题
          </span>
        </p>
        <div className="mt-8 flex justify-center gap-4">
          <Link href="/cards" className="button button-primary">
            📚 探索卡片库
          </Link>
          <Link href="/toolbox" className="button button-outline">
            🛠️ 进入工具箱
          </Link>
        </div>
      </section>

      {/* Features Section */}
      <section className="grid gap-6 md:grid-cols-3">
        <div className="card">
          <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <FileText className="h-6 w-6" />
          </div>
          <h3 className="text-lg font-semibold mb-2">AI 知识卡片</h3>
          <p className="text-sm text-muted-foreground">
            一键收藏文章，AI 自动生成摘要、关键观点和标签。让读过的内容不再遗忘。
          </p>
        </div>

        <div className="card">
          <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Wrench className="h-6 w-6" />
          </div>
          <h3 className="text-lg font-semibold mb-2">智能工具箱</h3>
          <p className="text-sm text-muted-foreground">
            抛弃文件夹，用 AI 多标签 + 语义检索管理工具。"我收藏过一个能去图片背景的网站"秒出。
          </p>
        </div>

        <div className="card">
          <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Search className="h-6 w-6" />
          </div>
          <h3 className="text-lg font-semibold mb-2">语义搜索</h3>
          <p className="text-sm text-muted-foreground">
            用自然语言描述你要找的内容，AI 语义匹配，让检索更智能、更精准。
          </p>
        </div>
      </section>

      {/* Stats Section */}
      <section className="card bg-gradient-to-r from-primary/5 to-primary/10">
        <div className="grid gap-8 md:grid-cols-3 text-center">
          <div>
            <div className="text-3xl font-bold text-primary">90%</div>
            <div className="mt-2 text-sm text-muted-foreground">
              用户书签保存后不再访问
            </div>
          </div>
          <div>
            <div className="text-3xl font-bold text-primary">2.5小时</div>
            <div className="mt-2 text-sm text-muted-foreground">
              知识工作者每周浪费在重复搜索上
            </div>
          </div>
          <div>
            <div className="text-3xl font-bold text-primary">85%</div>
            <div className="mt-2 text-sm text-muted-foreground">
              FlowShelf 语义搜索准确率
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="text-center">
        <h2 className="text-2xl font-bold mb-4">开始你的知识沉淀之旅</h2>
        <p className="text-muted-foreground mb-6">
          Phase 1 MVP：AI 卡片生成 + 语义检索 + 工具箱
        </p>
        <Link href="/cards" className="button button-primary text-base px-6 py-3">
          立即体验 <ArrowRight className="ml-2 h-4 w-4" />
        </Link>
      </section>
    </div>
  );
}
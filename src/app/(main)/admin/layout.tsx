'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, LayoutDashboard, ChevronLeft, Menu } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ADMIN_NAV_GROUPS, adminPathActive } from '@/lib/admin/nav';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, session, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [role, setRole] = useState<string>('admin');
  const [denyReason, setDenyReason] = useState<string | null>(null);

  // Admin UI is always Simplified Chinese (independent of site EN/ZH switch)
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = 'zh-CN';
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push('/login?next=/admin');
      return;
    }
    const token = session?.access_token || '';
    if (!token) {
      setIsAdmin(false);
      setDenyReason('登录会话无效，请重新登录后再试。');
      return;
    }

    fetch('/api/admin/check-role', {
      headers: { 'x-session': token },
    })
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        return { ok: r.ok, status: r.status, data };
      })
      .then(({ ok, status, data }) => {
        if (data?.isAdmin) {
          setIsAdmin(true);
          setRole(data.role || 'admin');
          setDenyReason(null);
          return;
        }
        setIsAdmin(false);
        if (status === 401 || data?.reason === 'unauthorized') {
          setDenyReason('未登录或会话过期。请重新登录。');
        } else if (data?.profileError) {
          setDenyReason(
            `无法读取 profiles 表：${data.profileError}。请检查 COZE_SUPABASE_SERVICE_ROLE_KEY 与数据库连接。`,
          );
        } else if (!data?.hasProfile) {
          setDenyReason(
            '未找到用户档案（profiles）。请先在站内完成一次登录/注册，或在 Supabase 为你的 user_id 插入 profiles 行。',
          );
        } else {
          setDenyReason(
            `当前账号无管理员权限（role=${data?.role || 'user'}）。` +
              (data?.whitelistConfigured
                ? ' 邮箱不在 ALLOWED_ADMIN_EMAILS 白名单中。'
                : ' 请在 Supabase 将 profiles.role 设为 admin，或在 Vercel 配置 ALLOWED_ADMIN_EMAILS=你的邮箱。'),
          );
        }
      })
      .catch(() => {
        setIsAdmin(false);
        setDenyReason('权限校验请求失败，请稍后重试或检查网络。');
      });
  }, [user, session, router, authLoading]);

  if (authLoading || (user && isAdmin === null && !denyReason)) {
    return (
      <div className="admin-layout flex h-screen items-center justify-center bg-[#F5F7FA]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-[#2563EB]" />
          <p className="text-xs text-[#64748B]">验证管理员权限…</p>
        </div>
      </div>
    );
  }

  if (!user || isAdmin === false) {
    return (
      <div className="admin-layout flex min-h-screen items-center justify-center bg-[#F5F7FA] p-6">
        <div className="max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-sm text-center">
          <h1 className="text-lg font-bold text-[#1E293B]">无法进入后台</h1>
          <p className="mt-3 text-sm text-[#64748B] leading-relaxed">
            {denyReason || '请先登录管理员账号。'}
          </p>
          <div className="mt-5 flex flex-col sm:flex-row gap-2 justify-center">
            <Button onClick={() => router.push('/login?next=/admin')} className="bg-[#2563EB]">
              去登录
            </Button>
            <Button variant="outline" onClick={() => router.push('/')}>
              返回首页
            </Button>
          </div>
          <p className="mt-4 text-[11px] text-left text-[#94A3B8] bg-slate-50 rounded-lg p-3">
            <b className="text-[#64748B]">快速开通管理员：</b>
            <br />
            1) Vercel 环境变量增加
            <code className="mx-1 text-[10px]">ALLOWED_ADMIN_EMAILS=你的邮箱</code>
            后 Redeploy
            <br />
            2) 或在 Supabase SQL 执行：
            <code className="block mt-1 text-[10px] break-all">
              UPDATE profiles SET role = &apos;admin&apos; WHERE email = &apos;你的邮箱&apos;;
            </code>
            （若无 email 列则用 user_id）
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-layout flex h-full min-h-screen bg-[#F5F7FA]" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      <button
        className="fixed bottom-6 right-4 z-50 flex h-11 w-11 items-center justify-center rounded-full bg-[#2563EB] shadow-lg text-white lg:hidden"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        aria-label="菜单"
      >
        <Menu className="h-5 w-5" />
      </button>

      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-black/30 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 w-64 transform border-r border-[#E2E8F0] bg-white transition-transform duration-200 lg:relative lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-14 items-center justify-between border-b border-[#E2E8F0] px-5">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#2563EB]">
              <LayoutDashboard className="h-4 w-4 text-white" />
            </div>
            <div>
              <div className="text-sm font-semibold text-[#1E293B]">SoulMate 后台</div>
              <div className="text-[10px] text-[#94A3B8] uppercase tracking-wide">{role}</div>
            </div>
          </div>
        </div>

        <ScrollArea className="h-[calc(100%-56px-56px)] p-3">
          <nav className="flex flex-col gap-4">
            {ADMIN_NAV_GROUPS.map((group) => (
              <div key={group.title}>
                <div className="px-3 mb-1">
                  <div className="text-[10px] font-bold tracking-wider text-[#94A3B8] uppercase">
                    {group.title}
                  </div>
                  {group.description ? (
                    <div className="mt-0.5 text-[10px] leading-snug text-[#CBD5E1]">{group.description}</div>
                  ) : null}
                </div>
                <div className="flex flex-col gap-0.5">
                  {group.items.map((item) => {
                    const active = adminPathActive(pathname, item);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setSidebarOpen(false)}
                        title={item.hint}
                        className={cn(
                          'flex items-start gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                          active
                            ? 'bg-[#EFF6FF] text-[#2563EB]'
                            : 'text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#1E293B]',
                        )}
                      >
                        <item.icon className="mt-0.5 h-4 w-4 shrink-0" />
                        <span className="min-w-0">
                          <span className="block leading-tight">{item.label}</span>
                          {item.hint ? (
                            <span className={cn('mt-0.5 block text-[10px] font-normal leading-snug', active ? 'text-blue-400' : 'text-[#94A3B8]')}>
                              {item.hint}
                            </span>
                          ) : null}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        </ScrollArea>

        <div className="absolute bottom-0 left-0 right-0 border-t border-[#E2E8F0] p-3 bg-white">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-[#64748B]"
            onClick={() => router.push('/')}
          >
            <ChevronLeft className="mr-2 h-4 w-4" />
            返回前台
          </Button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <div className="min-h-full">{children}</div>
      </main>
    </div>
  );
}

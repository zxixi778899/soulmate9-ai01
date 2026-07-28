'use client';

/** 后台只保留业务域入口；细分工具统一从系统总控或业务页进入。 */
import {
  LayoutDashboard,
  Heart,
  Sparkles,
  ShoppingBag,
  Users,
  Brain,
  Settings,
  type LucideIcon,
} from 'lucide-react';

export type AdminNavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  hint?: string;
  /** 被合并的旧路径仍用于保持侧栏高亮。 */
  aliases?: string[];
};

export type AdminNavGroup = {
  title: string;
  description?: string;
  items: AdminNavItem[];
};

export const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  {
    title: '管理',
    items: [
      {
        label: '系统总控',
        href: '/admin/control',
        icon: LayoutDashboard,
        hint: '状态、管理和新建入口',
        aliases: ['/admin'],
      },
      {
        label: '用户管理',
        href: '/admin/users',
        icon: Users,
        hint: '账户、会员、积分与代币',
        aliases: ['/admin/tokens', '/admin/credits'],
      },
      {
        label: '伴侣管理',
        href: '/admin/girlfriends',
        icon: Heart,
        hint: '资料、媒体、发布与审核',
        aliases: [
          '/admin/review',
          '/admin/images',
          '/admin/videos',
          '/admin/character-cards',
          '/admin/featured',
          '/admin/lore',
        ],
      },
      {
        label: '对话与 AI',
        href: '/admin/models',
        icon: Brain,
        hint: '模型、方案、路由和服务状态',
        aliases: ['/admin/ai-modules', '/admin/ai-hub', '/admin/provider-routes'],
      },
      {
        label: '创建与素材',
        href: '/admin/studio',
        icon: Sparkles,
        hint: '生成、预设、模型与素材库',
        aliases: [
          '/admin/comfy',
          '/admin/generate-cards',
          '/admin/model-library',
          '/admin/assets',
          '/admin/creator-previews',
          '/admin/presets',
        ],
      },
      {
        label: '商城管理',
        href: '/admin/shop',
        icon: ShoppingBag,
        hint: '商品、礼物与支付',
        aliases: ['/admin/gifts', '/admin/crypto'],
      },
      {
        label: '网站设置',
        href: '/admin/homepage',
        icon: Settings,
        hint: '页面、导航、广告和全站配置',
        aliases: ['/admin/pages', '/admin/navigation', '/admin/ads', '/admin/settings'],
      },
    ],
  },
];

export function adminPathActive(pathname: string | null | undefined, item: AdminNavItem): boolean {
  if (!pathname) return false;
  const paths = [item.href, ...(item.aliases || [])];
  return paths.some((href) =>
    href === '/admin' ? pathname === '/admin' : pathname === href || pathname.startsWith(`${href}/`),
  );
}

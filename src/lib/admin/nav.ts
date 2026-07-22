'use client';

/**
 * 后台导航信息架构（中文）
 * 1. 女友资源库：卡片资料 + 图/视频/音频绑定（无生图）
 * 2. 创作中心：Comfy 出图/出视频 + Civitai 模型/LoRA + 公共资产
 * 3. 商城：服装/道具/礼物
 * 其余：运营 / 用户与权限 / 系统
 */
import {
  LayoutDashboard,
  Heart,
  CheckSquare,
  Sparkles,
  Library,
  FolderOpen,
  ShoppingBag,
  Gift,
  Bitcoin,
  Image as ImageIcon,
  Users,
  Home,
  LayoutTemplate,
  Brain,
  Settings,
  type LucideIcon,
} from 'lucide-react';

export type AdminNavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** 侧栏副标题 */
  hint?: string;
  /** 合并后的旧路径，高亮时视为同一入口 */
  aliases?: string[];
};

export type AdminNavGroup = {
  title: string;
  description?: string;
  items: AdminNavItem[];
};

export const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  {
    title: '总览',
    items: [{ label: '仪表盘', href: '/admin', icon: LayoutDashboard }],
  },
  {
    title: '女友资源库',
    description: '站内女友卡片 · 图/视频/音频绑定 · 不含生图',
    items: [
      {
        label: '女友与媒体',
        href: '/admin/girlfriends',
        icon: Heart,
        hint: '资料 + 头像/肖像/视频/音频',
        aliases: ['/admin/images', '/admin/videos', '/admin/character-cards', '/admin/featured'],
      },
      {
        label: '审核队列',
        href: '/admin/review',
        icon: CheckSquare,
        hint: '用户投稿公开审核',
      },
    ],
  },
  {
    title: '创作中心',
    description: 'Comfy 生成 · 模型/LoRA · 公共图库',
    items: [
      {
        label: '创作工作台',
        href: '/admin/studio',
        icon: Sparkles,
        hint: '出图 / 出视频 / 音频 · 按女友归档',
        aliases: ['/admin/comfy', '/admin/generate-cards'],
      },
      {
        label: '模型与 LoRA',
        href: '/admin/model-library',
        icon: Library,
        hint: 'Civitai 搜索入库 · 下载清单',
      },
      {
        label: '公共资产库',
        href: '/admin/assets',
        icon: FolderOpen,
        hint: '生成结果保留 · 选用到女友',
      },
    ],
  },
  {
    title: '商城',
    description: '服装 · 道具 · 直播礼物特效',
    items: [
      {
        label: '商品管理',
        href: '/admin/shop',
        icon: ShoppingBag,
        hint: '图/视频 · 价格 · 亲密加成',
      },
      {
        label: '礼物与特效',
        href: '/admin/gifts',
        icon: Gift,
        hint: '对话送礼 · 全屏特效配置',
      },
      {
        label: '加密货币',
        href: '/admin/crypto',
        icon: Bitcoin,
      },
      {
        label: '广告位',
        href: '/admin/ads',
        icon: ImageIcon,
      },
    ],
  },
  {
    title: '运营与系统',
    items: [
      { label: '用户管理', href: '/admin/users', icon: Users, hint: '账户 · 积分 · 会员 · 代币套餐', aliases: ['/admin/tokens', '/admin/credits'] },
      { label: '全站模块', href: '/admin/homepage', icon: Home },
      { label: '页面/导航', href: '/admin/pages', icon: LayoutTemplate, aliases: ['/admin/navigation'] },
      { label: 'AI 对话模型', href: '/admin/models', icon: Brain },
      { label: 'AI 模块方案', href: '/admin/ai-modules', icon: Brain },
      { label: '站点设置', href: '/admin/settings', icon: Settings },
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

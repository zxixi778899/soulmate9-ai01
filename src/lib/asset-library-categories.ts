/**
 * 公共资产库 - 四大分类系统
 * 服装库 | 动作库 | 场景库 | 广告库
 */

export const ASSET_LIBRARY_CATEGORIES = [
  {
    id: 'outfit',
    label: '服装库',
    description: '管理所有服装、服饰、配饰等资源',
    icon: 'Shirt',
    color: 'violet',
    roles: ['outfit-top', 'outfit-bottom', 'outfit-full', 'outfit-accessory'] as const,
  },
  {
    id: 'action',
    label: '动作库',
    description: '管理所有姿势、动作、手势等资源',
    icon: 'Activity',
    color: 'emerald',
    roles: ['pose-reference', 'action-sequence', 'gesture-detail'] as const,
  },
  {
    id: 'scene',
    label: '场景库',
    description: '管理所有背景、环境、场所等资源',
    icon: 'Map',
    color: 'cyan',
    roles: ['scene-background', 'scene-interior', 'scene-exterior', 'scene-environment'] as const,
  },
  {
    id: 'advertising',
    label: '广告库',
    description: '管理广告素材、Banner、宣传图等资源',
    icon: 'Sparkles',
    color: 'amber',
    roles: ['ad-banner', 'ad-poster', 'ad-promo', 'ad-thumbnail'] as const,
  },
] as const;

export type AssetLibraryCategoryId = (typeof ASSET_LIBRARY_CATEGORIES)[number]['id'];
export type AssetLibraryCategory = (typeof ASSET_LIBRARY_CATEGORIES)[number];

export const ASSET_LIBRARY_CATEGORY_ROLES = [
  'outfit-top',
  'outfit-bottom',
  'outfit-full',
  'outfit-accessory',
  'pose-reference',
  'action-sequence',
  'gesture-detail',
  'scene-background',
  'scene-interior',
  'scene-exterior',
  'scene-environment',
  'ad-banner',
  'ad-poster',
  'ad-promo',
  'ad-thumbnail',
] as const;

export type AssetLibraryCategoryRole = (typeof ASSET_LIBRARY_CATEGORY_ROLES)[number];

export interface AssetLibraryFolder {
  id: string;
  category: AssetLibraryCategoryId;
  name: string;
  description?: string;
  assetCount: number;
  coverUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AssetLibraryItem extends Asset {
  folderId: string | null; // null = 未分类
  libraryCategory: AssetLibraryCategoryId;
  libraryRole: AssetLibraryCategoryRole;
}

// 合并原有 Asset 类型
type Asset = {
  id?: string | null;
  url?: string;
  preview_url?: string;
  name?: string;
  created_at?: string;
  girlfriend_id?: string | null;
  kind?: string;
  storage_key?: string;
  meta?: { 
    asset_role?: import('./character-asset-production').CharacterAssetRole;
    reference_role?: string;
    library_role?: AssetLibraryCategoryRole;
    library_category?: AssetLibraryCategoryId;
  } | null;
};

// 快捷操作配置
export const LIBRARY_QUICK_ACTIONS = {
  outfit: {
    label: '换装',
    description: '应用此服装到当前角色',
    defaultDenoise: 0.72,
    recommendedSteps: 28,
  },
  action: {
    label: '换动作',
    description: '复制此姿势到当前角色',
    defaultDenoise: 0.62,
    recommendedSteps: 24,
  },
  scene: {
    label: '换场景',
    description: '应用此背景到当前场景',
    defaultDenoise: 0.5,
    recommendedSteps: 28,
  },
  advertising: {
    label: '广告素材',
    description: '用于广告宣传生成',
    defaultDenoise: 0.55,
    recommendedSteps: 30,
  },
};

export type QuickActionType = keyof typeof LIBRARY_QUICK_ACTIONS;

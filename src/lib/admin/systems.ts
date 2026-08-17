export type AdminSystemId =
  | 'users'
  | 'companions'
  | 'conversations'
  | 'commerce'
  | 'creation'
  | 'site';

export type AdminSystemDefinition = {
  id: AdminSystemId;
  name: string;
  description: string;
  manageHref: string;
  createHref?: string;
  relatedHrefs: Array<{ label: string; href: string }>;
};

/** 后台模块的单一事实源；预设与生成能力统一归入创建系统。 */
export const ADMIN_SYSTEMS: readonly AdminSystemDefinition[] = [
  {
    id: 'users',
    name: '用户系统',
    description: '账户、会员、积分、代币与权限',
    manageHref: '/admin/users',
    relatedHrefs: [],
  },
  {
    id: 'companions',
    name: '伴侣系统',
    description: '伴侣资料、媒体、公开状态与审核',
    manageHref: '/admin/girlfriends',
    createHref: '/admin/girlfriends?mode=create',
    relatedHrefs: [{ label: '审核队列', href: '/admin/review' }],
  },
  {
    id: 'conversations',
    name: '对话与 AI',
    description: '模型、提示词、路由与服务健康',
    manageHref: '/admin/models',
    relatedHrefs: [
      { label: 'AI 方案', href: '/admin/ai-modules' },
      { label: '服务状态', href: '/admin/ai-hub' },
      { label: '路由线路', href: '/admin/provider-routes' },
    ],
  },
  {
    id: 'creation',
    name: '创建与素材',
    description: '生成工作台、预设、模型与公共素材',
    manageHref: '/admin/studio',
    relatedHrefs: [
      { label: '生成预设', href: '/admin/presets' },
      { label: '模型与 LoRA', href: '/admin/model-library' },
      { label: '公共资产', href: '/admin/assets' },
      { label: '捏脸预览', href: '/admin/creator-previews' },
    ],
  },
  {
    id: 'commerce',
    name: '商城系统',
    description: '商品、服装、礼物、价格与支付',
    manageHref: '/admin/shop',
    createHref: '/admin/shop?mode=create',
    relatedHrefs: [
      { label: '礼物与特效', href: '/admin/gifts' },
      { label: '加密支付', href: '/admin/crypto' },
    ],
  },
  {
    id: 'site',
    name: '网站设置',
    description: '首页、页面、导航、广告和全站配置',
    manageHref: '/admin/homepage',
    relatedHrefs: [
      { label: '页面管理', href: '/admin/pages' },
      { label: '站点设置', href: '/admin/settings' },
      { label: '广告位', href: '/admin/ads' },
      { label: '文案管理', href: '/admin/copywriting' },
      { label: '图片资源库', href: '/admin/site-assets' },
    ],
  },
] as const;

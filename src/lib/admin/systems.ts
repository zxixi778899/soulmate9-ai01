export type AdminSystemId =
  | 'users'
  | 'companions'
  | 'conversations'
  | 'commerce'
  | 'presets'
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

/** 后台模块的单一事实源。 */
export const ADMIN_SYSTEMS: readonly AdminSystemDefinition[] = [
  {
    id: 'users',
    name: '用户系统',
    description: '账户、会员、积分、代币与权限',
    manageHref: '/admin/users',
    relatedHrefs: [
      { label: '代币经济', href: '/admin/tokens' },
      { label: '支付记录', href: '/admin/credits' },
    ],
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
    name: '对话系统',
    description: '模型、提示词、路由与服务健康',
    manageHref: '/admin/models',
    relatedHrefs: [
      { label: 'AI 模块方案', href: '/admin/ai-modules' },
      { label: '服务中心', href: '/admin/ai-hub' },
      { label: '路由线路', href: '/admin/provider-routes' },
    ],
  },
  {
    id: 'commerce',
    name: '商城系统',
    description: '商品、服装、礼物、价格与库存状态',
    manageHref: '/admin/shop',
    createHref: '/admin/shop?mode=create',
    relatedHrefs: [{ label: '礼物与特效', href: '/admin/gifts' }],
  },
  {
    id: 'presets',
    name: '预设系统',
    description: '场景模板、角色参考、生成参数与队列',
    manageHref: '/admin/presets',
    createHref: '/admin/presets?mode=create',
    relatedHrefs: [{ label: '捏脸预览', href: '/admin/creator-previews' }],
  },
  {
    id: 'creation',
    name: '创建系统',
    description: '图片、视频、音频生成与公共资产',
    manageHref: '/admin/studio',
    relatedHrefs: [
      { label: '模型与 LoRA', href: '/admin/model-library' },
      { label: '公共资产', href: '/admin/assets' },
    ],
  },
  {
    id: 'site',
    name: '网站与管理系统',
    description: '首页、页面、导航、广告和全站设置',
    manageHref: '/admin/homepage',
    relatedHrefs: [
      { label: '页面管理', href: '/admin/pages' },
      { label: '站点设置', href: '/admin/settings' },
      { label: '广告位', href: '/admin/ads' },
    ],
  },
] as const;

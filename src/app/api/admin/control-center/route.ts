import { NextResponse } from 'next/server';
import { ADMIN_SYSTEMS, type AdminSystemId } from '@/lib/admin/systems';
import { requireAdmin } from '@/lib/require-admin';
import { loggerFromRequest } from '@/lib/logger';

export const dynamic = 'force-dynamic';

type SystemMetric = { total: number; secondary?: number; secondaryLabel?: string };
type MetricResult = { id: AdminSystemId; metric: SystemMetric };

export async function GET(request: Request): Promise<NextResponse> {
  const authorization = await requireAdmin(request, 'reviewer');
  if (authorization.error) return authorization.error;
  const { supabase } = authorization;
  const log = loggerFromRequest(request);

  const tasks: Array<Promise<MetricResult>> = [
    (async () => {
      const [{ count: total }, { count: paid }] = await Promise.all([
        supabase.from('profiles').select('*', { count: 'exact', head: true }),
        supabase.from('profiles').select('*', { count: 'exact', head: true })
          .in('membership_tier', ['basic', 'pro', 'unlimited']),
      ]);
      return { id: 'users', metric: { total: total ?? 0, secondary: paid ?? 0, secondaryLabel: '付费会员' } };
    })(),
    (async () => {
      const [{ count: total }, { count: pending }] = await Promise.all([
        supabase.from('girlfriends').select('*', { count: 'exact', head: true }),
        supabase.from('girlfriends').select('*', { count: 'exact', head: true })
          .eq('review_status', 'pending'),
      ]);
      return { id: 'companions', metric: { total: total ?? 0, secondary: pending ?? 0, secondaryLabel: '待审核' } };
    })(),
    (async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count } = await supabase.from('chat_messages')
        .select('*', { count: 'exact', head: true }).gte('created_at', since);
      return { id: 'conversations', metric: { total: count ?? 0, secondaryLabel: '近 24 小时消息' } };
    })(),
    (async () => {
      const [{ count: total }, { count: active }] = await Promise.all([
        supabase.from('products').select('*', { count: 'exact', head: true }),
        supabase.from('products').select('*', { count: 'exact', head: true }).eq('is_active', true),
      ]);
      return { id: 'commerce', metric: { total: total ?? 0, secondary: active ?? 0, secondaryLabel: '上架商品' } };
    })(),
    (async () => {
      const [scenes, references, presets] = await Promise.all([
        supabase.from('pregen_scene_templates').select('*', { count: 'exact', head: true }),
        supabase.from('character_references').select('*', { count: 'exact', head: true }),
        supabase.from('generation_presets').select('*', { count: 'exact', head: true }),
      ]);
      return {
        id: 'presets',
        metric: {
          total: (scenes.count ?? 0) + (references.count ?? 0) + (presets.count ?? 0),
          secondary: presets.count ?? 0,
          secondaryLabel: '生成参数',
        },
      };
    })(),
    Promise.resolve({ id: 'creation', metric: { total: 0, secondaryLabel: '工作台可用' } }),
    (async () => {
      const [{ count: pages }, { count: ads }] = await Promise.all([
        supabase.from('cms_pages').select('*', { count: 'exact', head: true }),
        supabase.from('admin_ads').select('*', { count: 'exact', head: true }).eq('active', true),
      ]);
      return { id: 'site', metric: { total: pages ?? 0, secondary: ads ?? 0, secondaryLabel: '启用广告' } };
    })(),
  ];

  const settled = await Promise.allSettled(tasks);
  const metrics = new Map<AdminSystemId, SystemMetric>();
  const degraded: AdminSystemId[] = [];

  for (let index = 0; index < settled.length; index += 1) {
    const result = settled[index];
    const system = ADMIN_SYSTEMS[index];
    if (result.status === 'fulfilled') {
      metrics.set(result.value.id, result.value.metric);
    } else {
      degraded.push(system.id);
      log.warn('admin control-center metric failed', {
        system: system.id,
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
    }
  }

  return NextResponse.json({
    systems: ADMIN_SYSTEMS.map((system) => ({
      ...system,
      status: degraded.includes(system.id) ? 'degraded' : 'ready',
      metric: metrics.get(system.id) ?? { total: 0 },
    })),
    summary: {
      totalSystems: ADMIN_SYSTEMS.length,
      readySystems: ADMIN_SYSTEMS.length - degraded.length,
      attentionSystems: degraded.length,
    },
    generatedAt: new Date().toISOString(),
  });
}

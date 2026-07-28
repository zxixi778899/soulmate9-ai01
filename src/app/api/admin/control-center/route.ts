import { NextResponse } from 'next/server';
import { ADMIN_SYSTEMS, type AdminSystemId } from '@/lib/admin/systems';
import { requireAdmin } from '@/lib/require-admin';
import { loggerFromRequest } from '@/lib/logger';

export const dynamic = 'force-dynamic';

type SystemMetric = { total: number; secondary?: number; secondaryLabel?: string };
type MetricResult = { id: AdminSystemId; metric: SystemMetric };
type CountResult = { count: number | null; error: { message: string } | null };

async function checkedCount(query: PromiseLike<CountResult>, label: string): Promise<number> {
  const result = await query;
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.count ?? 0;
}

export async function GET(request: Request): Promise<NextResponse> {
  const authorization = await requireAdmin(request, 'reviewer');
  if (authorization.error) return authorization.error;
  const { supabase } = authorization;
  const log = loggerFromRequest(request);

  const tasks: Array<Promise<MetricResult>> = [
    (async () => {
      const [total, paid] = await Promise.all([
        checkedCount(
          supabase.from('profiles').select('*', { count: 'exact', head: true }),
          'profiles',
        ),
        checkedCount(
          supabase.from('profiles').select('*', { count: 'exact', head: true })
            .in('membership_tier', ['basic', 'pro', 'unlimited']),
          'paid profiles',
        ),
      ]);
      return { id: 'users', metric: { total, secondary: paid, secondaryLabel: '付费会员' } };
    })(),
    (async () => {
      const [total, pending] = await Promise.all([
        checkedCount(
          supabase.from('girlfriends').select('*', { count: 'exact', head: true }),
          'girlfriends',
        ),
        checkedCount(
          supabase.from('girlfriends').select('*', { count: 'exact', head: true })
            .eq('review_status', 'pending'),
          'pending girlfriends',
        ),
      ]);
      return { id: 'companions', metric: { total, secondary: pending, secondaryLabel: '待审核' } };
    })(),
    (async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const total = await checkedCount(
        supabase.from('chat_messages').select('*', { count: 'exact', head: true })
          .gte('created_at', since),
        'recent chat messages',
      );
      return { id: 'conversations', metric: { total, secondaryLabel: '近 24 小时消息' } };
    })(),
    (async () => {
      const [scenes, references, presets] = await Promise.all([
        checkedCount(
          supabase.from('pregen_scene_templates').select('*', { count: 'exact', head: true }),
          'scene templates',
        ),
        checkedCount(
          supabase.from('character_references').select('*', { count: 'exact', head: true }),
          'character references',
        ),
        checkedCount(
          supabase.from('generation_presets').select('*', { count: 'exact', head: true }),
          'generation presets',
        ),
      ]);
      return {
        id: 'creation',
        metric: {
          total: scenes + references + presets,
          secondary: presets,
          secondaryLabel: '生成预设',
        },
      };
    })(),
    (async () => {
      const [total, active] = await Promise.all([
        checkedCount(
          supabase.from('products').select('*', { count: 'exact', head: true }),
          'products',
        ),
        checkedCount(
          supabase.from('products').select('*', { count: 'exact', head: true }).eq('is_active', true),
          'active products',
        ),
      ]);
      return { id: 'commerce', metric: { total, secondary: active, secondaryLabel: '上架商品' } };
    })(),
    (async () => {
      const [pages, ads] = await Promise.all([
        checkedCount(
          supabase.from('cms_pages').select('*', { count: 'exact', head: true }),
          'CMS pages',
        ),
        checkedCount(
          supabase.from('admin_ads').select('*', { count: 'exact', head: true }).eq('active', true),
          'active ads',
        ),
      ]);
      return { id: 'site', metric: { total: pages, secondary: ads, secondaryLabel: '启用广告' } };
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

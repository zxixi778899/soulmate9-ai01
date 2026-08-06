'use client';

export const dynamic = 'force-dynamic';

/**
 * 后台 · 社区排行榜管理
 * - 维护 15 条虚拟账号数据（互动值 / 粉丝 / 作品数 / 头像 / 简介 / 排序 / 启用）
 * - 将系统伴侣（已上架）分配到虚拟账号名下（榜单卡片点击跳转到代表作）
 * - 实时预览：虚拟 + 真实用户合并后的 Top15（真实用户数值超过虚拟数据自动顶替）
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { authedFetch } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Trophy, Flame, Users, Plus, Pencil, Trash2, Loader2, Search, Eye, Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface VirtualEntry {
  id: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  interaction_score: number;
  fans_count: number;
  works_count: number;
  sort_order: number;
  is_active: boolean;
}

interface CompanionLite {
  id: string;
  name: string;
  slug?: string;
  portrait_url: string | null;
  avatar_url: string | null;
  hot_score: number;
  interaction_count: number;
  user_id?: string | null;
}

interface PreviewEntry {
  kind: 'user' | 'virtual';
  id: string;
  name: string;
  avatar: string | null;
  score: number;
  fans: number;
  works: number;
  rank: number;
}

interface LeaderboardData {
  entries: VirtualEntry[];
  links: Array<{ virtual_user_id: string; girlfriend_id: string }>;
  companions: CompanionLite[];
  pool: CompanionLite[];
  preview: PreviewEntry[];
}

interface EditState {
  id: string | null;
  display_name: string;
  avatar_url: string;
  bio: string;
  interaction_score: number;
  fans_count: number;
  works_count: number;
  sort_order: number;
  is_active: boolean;
  companion_ids: string[];
}

const EMPTY_EDIT: EditState = {
  id: null,
  display_name: '',
  avatar_url: '',
  bio: '',
  interaction_score: 0,
  fans_count: 0,
  works_count: 0,
  sort_order: 0,
  is_active: true,
  companion_ids: [],
};

export default function AdminLeaderboardPage() {
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [search, setSearch] = useState('');
  const [previewOpen, setPreviewOpen] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await authedFetch('/api/admin/leaderboard');
      const json = (await res.json().catch(() => ({}))) as LeaderboardData;
      if (res.ok) setData(json);
      else toast.error((json as unknown as { error?: string }).error || '加载失败');
    } catch {
      toast.error('网络错误');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const companionById = useMemo(() => {
    const map = new Map<string, CompanionLite>();
    for (const c of data?.companions || []) map.set(c.id, c);
    for (const c of data?.pool || []) if (!map.has(c.id)) map.set(c.id, c);
    return map;
  }, [data]);

  const assignedOf = useCallback(
    (vuId: string): CompanionLite[] =>
      (data?.links || [])
        .filter((l) => l.virtual_user_id === vuId)
        .map((l) => companionById.get(l.girlfriend_id))
        .filter((c): c is CompanionLite => Boolean(c)),
    [data, companionById],
  );

  const openCreate = () => {
    const nextOrder = (data?.entries.length || 0) + 1;
    setEdit({ ...EMPTY_EDIT, sort_order: nextOrder });
  };

  const openEdit = (e: VirtualEntry) => {
    setEdit({
      id: e.id,
      display_name: e.display_name,
      avatar_url: e.avatar_url || '',
      bio: e.bio || '',
      interaction_score: e.interaction_score,
      fans_count: e.fans_count,
      works_count: e.works_count,
      sort_order: e.sort_order,
      is_active: e.is_active,
      companion_ids: assignedOf(e.id).map((c) => c.id),
    });
  };

  const save = async () => {
    if (!edit) return;
    if (!edit.display_name.trim()) {
      toast.error('昵称不能为空');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...(edit.id ? { id: edit.id } : {}),
        display_name: edit.display_name.trim(),
        avatar_url: edit.avatar_url.trim(),
        bio: edit.bio.trim(),
        interaction_score: Number(edit.interaction_score || 0),
        fans_count: Number(edit.fans_count || 0),
        works_count: Number(edit.works_count || 0),
        sort_order: Number(edit.sort_order || 0),
        is_active: edit.is_active,
        companion_ids: edit.companion_ids,
      };
      const res = await authedFetch('/api/admin/leaderboard', {
        method: edit.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(json.error || '保存失败');
        return;
      }
      toast.success(edit.id ? '已更新' : '已创建');
      setEdit(null);
      await load();
    } catch {
      toast.error('网络错误');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (e: VirtualEntry) => {
    if (!window.confirm(`删除虚拟账号「${e.display_name}」？分配关系会一并移除。`)) return;
    try {
      const res = await authedFetch(`/api/admin/leaderboard?id=${e.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      toast.success('已删除');
      await load();
    } catch {
      toast.error('删除失败');
    }
  };

  const toggleActive = async (e: VirtualEntry) => {
    try {
      const res = await authedFetch('/api/admin/leaderboard', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: e.id, is_active: !e.is_active }),
      });
      if (!res.ok) throw new Error();
      await load();
    } catch {
      toast.error('操作失败');
    }
  };

  const filteredPool = useMemo(() => {
    const kw = search.trim().toLowerCase();
    const list = data?.pool || [];
    return kw ? list.filter((c) => c.name.toLowerCase().includes(kw)) : list;
  }, [data, search]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-pink-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Trophy className="h-5 w-5 text-amber-400" /> 社区排行榜管理
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            维护虚拟账号数据并分配系统伴侣。真实用户互动值超过虚拟数据后会自动顶替上榜（Top15）。
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPreviewOpen((v) => !v)}
          >
            <Eye className="h-4 w-4 mr-1" /> {previewOpen ? '收起' : '查看'}实时榜单
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" /> 新增虚拟账号
          </Button>
        </div>
      </div>

      {/* 实时合并榜单预览 */}
      {previewOpen && (
        <Card className="border-slate-800 bg-[#12121a]">
          <CardContent className="pt-5">
            <div className="mb-3 text-sm font-semibold text-white flex items-center gap-2">
              <Flame className="h-4 w-4 text-pink-500" /> 实时榜单 Top15（虚拟 + 真实用户合并）
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
              {(data?.preview || []).map((p) => (
                <div
                  key={`${p.kind}-${p.id}`}
                  className="flex items-center gap-2 rounded-lg bg-slate-800/60 border border-slate-700/60 px-2 py-1.5"
                >
                  <span
                    className={cn(
                      'shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black',
                      p.rank === 1 && 'bg-amber-400 text-black',
                      p.rank === 2 && 'bg-slate-300 text-black',
                      p.rank === 3 && 'bg-orange-400 text-black',
                      p.rank > 3 && 'bg-slate-700 text-slate-300',
                    )}
                  >
                    {p.rank}
                  </span>
                  {p.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.avatar} alt="" className="h-7 w-7 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="h-7 w-7 rounded-full bg-slate-700 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-white truncate flex items-center gap-1">
                      <span className="truncate">{p.name}</span>
                      {p.kind === 'user' ? (
                        <Badge className="bg-pink-600/30 text-pink-300 border-0 px-1 py-0 text-[9px]">真实</Badge>
                      ) : (
                        <Badge className="bg-slate-600/40 text-slate-300 border-0 px-1 py-0 text-[9px]">虚拟</Badge>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-400 tabular-nums">{p.score} 互动</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 虚拟账号列表 */}
      <div className="space-y-2">
        {(data?.entries || []).map((e) => {
          const assigned = assignedOf(e.id);
          return (
            <Card key={e.id} className={cn('border-slate-800 bg-[#12121a]', !e.is_active && 'opacity-55')}>
              <CardContent className="pt-5 flex flex-wrap items-center gap-4">
                {e.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={e.avatar_url} alt="" className="h-12 w-12 rounded-full object-cover ring-2 ring-slate-700 shrink-0" />
                ) : (
                  <div className="h-12 w-12 rounded-full bg-gradient-to-br from-pink-600/50 to-purple-600/50 flex items-center justify-center text-white font-bold shrink-0">
                    {e.display_name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-white">{e.display_name}</span>
                    <Badge variant="secondary" className="text-[10px]">#{e.sort_order}</Badge>
                    {!e.is_active && <Badge variant="outline" className="text-[10px] text-slate-400">已停用</Badge>}
                  </div>
                  {e.bio && <div className="mt-0.5 text-xs text-slate-400 truncate">{e.bio}</div>}
                  {assigned.length > 0 && (
                    <div className="mt-1 flex items-center gap-1 flex-wrap">
                      <span className="text-[10px] text-slate-500">名下伴侣:</span>
                      {assigned.map((c) => (
                        <span key={c.id} className="text-[10px] text-pink-300 bg-pink-600/15 border border-pink-600/25 rounded px-1.5 py-0.5">
                          {c.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-4 text-center shrink-0">
                  <div>
                    <div className="text-sm font-bold text-pink-400 tabular-nums">{e.interaction_score}</div>
                    <div className="text-[10px] text-slate-500">互动值</div>
                  </div>
                  <div>
                    <div className="text-sm font-bold text-slate-200 tabular-nums">{e.fans_count}</div>
                    <div className="text-[10px] text-slate-500">粉丝</div>
                  </div>
                  <div>
                    <div className="text-sm font-bold text-slate-200 tabular-nums">{e.works_count}</div>
                    <div className="text-[10px] text-slate-500">作品</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Switch checked={e.is_active} onCheckedChange={() => void toggleActive(e)} />
                  <Button variant="ghost" size="icon" onClick={() => openEdit(e)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => void remove(e)}>
                    <Trash2 className="h-4 w-4 text-red-400" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* 编辑 / 新建弹窗 */}
      <Dialog open={!!edit} onOpenChange={(open) => { if (!open) setEdit(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto bg-[#14141d] border-slate-800 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-pink-400" />
              {edit?.id ? '编辑虚拟账号' : '新增虚拟账号'}
            </DialogTitle>
          </DialogHeader>

          {edit && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-slate-300">昵称 *</Label>
                  <Input
                    value={edit.display_name}
                    onChange={(ev) => setEdit({ ...edit, display_name: ev.target.value })}
                    placeholder="如 Luna"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-slate-300">排序（越小越靠前）</Label>
                  <Input
                    type="number"
                    value={edit.sort_order}
                    onChange={(ev) => setEdit({ ...edit, sort_order: Number(ev.target.value) })}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-slate-300">头像 URL</Label>
                <Input
                  value={edit.avatar_url}
                  onChange={(ev) => setEdit({ ...edit, avatar_url: ev.target.value })}
                  placeholder="https://...（留空时展示页用首字母占位）"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-slate-300">简介</Label>
                <Textarea
                  value={edit.bio}
                  onChange={(ev) => setEdit({ ...edit, bio: ev.target.value })}
                  rows={2}
                  placeholder="一句话人设"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-slate-300">互动值</Label>
                  <Input
                    type="number"
                    value={edit.interaction_score}
                    onChange={(ev) => setEdit({ ...edit, interaction_score: Number(ev.target.value) })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-slate-300">粉丝数</Label>
                  <Input
                    type="number"
                    value={edit.fans_count}
                    onChange={(ev) => setEdit({ ...edit, fans_count: Number(ev.target.value) })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-slate-300">作品数</Label>
                  <Input
                    type="number"
                    value={edit.works_count}
                    onChange={(ev) => setEdit({ ...edit, works_count: Number(ev.target.value) })}
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  checked={edit.is_active}
                  onCheckedChange={(v) => setEdit({ ...edit, is_active: v })}
                />
                <Label className="text-slate-300">启用（停用后不参与榜单）</Label>
              </div>

              {/* 系统伴侣分配 */}
              <div className="rounded-lg border border-slate-800 bg-[#101018] p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-slate-300 flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5" /> 分配系统伴侣（{edit.companion_ids.length} 已选）
                  </Label>
                  <div className="relative w-44">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
                    <Input
                      value={search}
                      onChange={(ev) => setSearch(ev.target.value)}
                      placeholder="搜索伴侣..."
                      className="h-8 pl-7 text-xs"
                    />
                  </div>
                </div>
                <div className="max-h-52 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {filteredPool.map((c) => {
                    const selected = edit.companion_ids.includes(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() =>
                          setEdit({
                            ...edit,
                            companion_ids: selected
                              ? edit.companion_ids.filter((x) => x !== c.id)
                              : [...edit.companion_ids, c.id],
                          })
                        }
                        className={cn(
                          'flex items-center gap-2 rounded-md border px-2 py-1.5 text-left transition-colors',
                          selected
                            ? 'border-pink-500/60 bg-pink-600/15'
                            : 'border-slate-800 bg-slate-900/40 hover:border-slate-600',
                        )}
                      >
                        {c.portrait_url || c.avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={(c.portrait_url || c.avatar_url) as string}
                            alt=""
                            className="h-8 w-8 rounded-full object-cover shrink-0"
                          />
                        ) : (
                          <div className="h-8 w-8 rounded-full bg-slate-700 shrink-0" />
                        )}
                        <div className="min-w-0">
                          <div className="text-xs text-white truncate">{c.name}</div>
                          <div className="text-[10px] text-slate-500 tabular-nums">
                            热度 {c.hot_score}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                  {filteredPool.length === 0 && (
                    <div className="col-span-full py-4 text-center text-xs text-slate-500">
                      没有匹配的已上架伴侣
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)}>取消</Button>
            <Button onClick={() => void save()} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

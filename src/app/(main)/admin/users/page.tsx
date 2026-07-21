'use client';

import { useEffect, useState } from 'react';
import { authedFetch } from '@/lib/supabase';
import { useAuth } from '@/components/AuthProvider';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Loader2, Search, User, Coins, Plus, Pencil, Star, KeyRound, Users } from 'lucide-react';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import { cn } from '@/lib/utils';

type UserData = {
  id: string;
  user_id: string;
  display_name: string | null;
  email: string;
  membership_tier: string;
  credits: number;
  avatar_url: string | null;
  created_at: string;
  is_disabled: boolean;
};

type TokenPkg = {
  id: string;
  name: string;
  token_count: number;
  price_cents: number;
  discount_percent?: number;
  description?: string | null;
  is_featured?: boolean;
  is_active?: boolean;
  sort_order?: number;
  bonus_tokens?: number;
};

const emptyTokenForm = {
  name: '',
  token_count: '1000',
  price_cents: '999',
  discount_percent: '0',
  description: '',
  is_featured: false,
  is_active: true,
  sort_order: '0',
};

export default function AdminUsersPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<'users' | 'tokens'>('users');

  // Users Tab State
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [tierFilter, setTierFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [totalPages, setTotalPages] = useState(1);
  const [selectedUser, setSelectedUser] = useState<UserData | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTier, setEditTier] = useState('free');
  const [editCredits, setEditCredits] = useState('0');
  const [saving, setSaving] = useState(false);
  const [newPassword, setNewPassword] = useState('');

  // Tokens Tab State
  const [packages, setPackages] = useState<TokenPkg[]>([]);
  const [tokensLoading, setTokensLoading] = useState(false);
  const [tokenDialogOpen, setTokenDialogOpen] = useState(false);
  const [editingToken, setEditingToken] = useState<TokenPkg | null>(null);
  const [tokenForm, setTokenForm] = useState(emptyTokenForm);
  const [tokenSaving, setTokenSaving] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', '20');
      if (search.trim()) params.set('search', search.trim());
      if (tierFilter !== 'all') params.set('tier', tierFilter);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);
      const res = await authedFetch(`/api/admin/users?${params.toString()}`);
      const data = await res.json();
      if (data.users) setUsers(data.users);
      if (data.totalPages) setTotalPages(data.totalPages);
    } catch (err) {
      logger.error(String(err));
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const fetchTokens = async () => {
    setTokensLoading(true);
    try {
      const res = await authedFetch('/api/admin/tokens');
      const data = await res.json();
      setPackages(data.packages || []);
    } catch {
      toast.error('加载代币套餐失败');
    } finally {
      setTokensLoading(false);
    }
  };

  useEffect(() => {
    if (tab === 'users') fetchUsers();
    else fetchTokens();
  }, [tab, page, tierFilter, statusFilter]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchUsers();
  };

  const openUserDialog = (u: UserData) => {
    setSelectedUser(u);
    setEditTier(u.membership_tier);
    setEditCredits(String(u.credits));
    setNewPassword('');
    setDialogOpen(true);
  };

  const saveUserChanges = async () => {
    if (!selectedUser) return;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        id: selectedUser.id,
        membership_tier: editTier,
        credits: parseInt(editCredits, 10) || 0,
      };
      if (newPassword.trim().length >= 6) {
        payload.new_password = newPassword.trim();
      }
      const res = await authedFetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed to update');
      toast.success('用户已更新');
      setDialogOpen(false);
      fetchUsers();
    } catch (err) {
      logger.error(String(err));
      toast.error('更新失败');
    } finally {
      setSaving(false);
    }
  };

  // Token CRUD
  const openTokenCreate = () => {
    setEditingToken(null);
    setTokenForm(emptyTokenForm);
    setTokenDialogOpen(true);
  };

  const openTokenEdit = (p: TokenPkg) => {
    setEditingToken(p);
    setTokenForm({
      name: p.name,
      token_count: String(p.token_count),
      price_cents: String(p.price_cents),
      discount_percent: String(p.discount_percent || 0),
      description: p.description || '',
      is_featured: Boolean(p.is_featured),
      is_active: p.is_active !== false,
      sort_order: String(p.sort_order || 0),
    });
    setTokenDialogOpen(true);
  };

  const saveToken = async () => {
    setTokenSaving(true);
    try {
      const payload = {
        name: tokenForm.name.trim(),
        token_count: Number(tokenForm.token_count),
        price_cents: Number(tokenForm.price_cents),
        discount_percent: Number(tokenForm.discount_percent),
        description: tokenForm.description,
        is_featured: tokenForm.is_featured,
        is_active: tokenForm.is_active,
        sort_order: Number(tokenForm.sort_order),
      };
      const res = await authedFetch('/api/admin/tokens', {
        method: editingToken ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingToken ? { id: editingToken.id, ...payload } : payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '保存失败');
      toast.success(editingToken ? '已更新' : '已创建');
      setTokenDialogOpen(false);
      fetchTokens();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setTokenSaving(false);
    }
  };

  const toggleTokenActive = async (p: TokenPkg) => {
    const res = await authedFetch('/api/admin/tokens', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: p.id, is_active: !p.is_active }),
    });
    if (res.ok) {
      toast.success(p.is_active ? '已下架' : '已上架');
      fetchTokens();
    } else toast.error('操作失败');
  };

  const getInitials = (name: string | null) => {
    if (!name) return '?';
    return name.charAt(0).toUpperCase();
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Users className="h-6 w-6 text-[#FF2D78]" /> 用户管理
        </h1>
        <p className="text-sm text-[#8B8BA3] mt-1">管理用户账户、积分、会员等级和代币套餐</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setTab('users')}
          className={cn(
            'flex items-center gap-1.5 h-9 px-4 rounded-full text-sm font-medium transition-all',
            tab === 'users' ? 'bg-[#FF2D78] text-white' : 'bg-white/[0.05] text-[#8B8BA3] hover:text-white',
          )}
        >
          <User className="h-3.5 w-3.5" /> 用户列表
        </button>
        <button
          onClick={() => setTab('tokens')}
          className={cn(
            'flex items-center gap-1.5 h-9 px-4 rounded-full text-sm font-medium transition-all',
            tab === 'tokens' ? 'bg-[#FF2D78] text-white' : 'bg-white/[0.05] text-[#8B8BA3] hover:text-white',
          )}
        >
          <Coins className="h-3.5 w-3.5" /> 代币套餐
        </button>
      </div>

      {/* USERS TAB */}
      {tab === 'users' && (
        <>
          <div className="mb-6 space-y-3">
            <form onSubmit={handleSearch} className="flex gap-2 max-w-md">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8B8BA3]" />
                <Input placeholder="搜索用户名 / 邮箱..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
              </div>
              <Button type="submit" size="sm">搜索</Button>
            </form>
            <div className="flex flex-wrap gap-2">
              <Select value={tierFilter} onValueChange={(v) => { setTierFilter(v); setPage(1); }}>
                <SelectTrigger className="w-[130px] h-8 text-xs"><SelectValue placeholder="All Tiers" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部等级</SelectItem>
                  <SelectItem value="free">Free</SelectItem>
                  <SelectItem value="basic">Basic</SelectItem>
                  <SelectItem value="pro">Pro</SelectItem>
                  <SelectItem value="unlimited">Unlimited</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
                <SelectTrigger className="w-[130px] h-8 text-xs"><SelectValue placeholder="All Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部状态</SelectItem>
                  <SelectItem value="active">正常</SelectItem>
                  <SelectItem value="disabled">已禁用</SelectItem>
                </SelectContent>
              </Select>
              <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} className="w-[140px] h-8 text-xs" />
              <span className="text-xs text-[#8B8BA3] self-center">至</span>
              <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} className="w-[140px] h-8 text-xs" />
              {(tierFilter !== 'all' || statusFilter !== 'all' || dateFrom || dateTo) && (
                <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setTierFilter('all'); setStatusFilter('all'); setDateFrom(''); setDateTo(''); setPage(1); }}>重置</Button>
              )}
            </div>
          </div>

          <Card className="border-white/[0.05] bg-card/40 backdrop-blur-sm">
            <CardContent className="p-0">
              {loading ? (
                <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-[#FF2D78]" /></div>
              ) : users.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-[#8B8BA3]"><User className="h-12 w-12 mb-2 opacity-30" /><p>未找到用户</p></div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-white/[0.06]">
                        <th className="text-left text-xs font-medium text-[#8B8BA3] px-4 py-3">用户</th>
                        <th className="text-left text-xs font-medium text-[#8B8BA3] px-4 py-3">邮箱</th>
                        <th className="text-left text-xs font-medium text-[#8B8BA3] px-4 py-3">会员</th>
                        <th className="text-left text-xs font-medium text-[#8B8BA3] px-4 py-3">积分</th>
                        <th className="text-left text-xs font-medium text-[#8B8BA3] px-4 py-3">状态</th>
                        <th className="text-left text-xs font-medium text-[#8B8BA3] px-4 py-3">注册</th>
                        <th className="text-left text-xs font-medium text-[#8B8BA3] px-4 py-3">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((u) => (
                        <tr key={u.id} className="border-b border-border/20 hover:bg-muted/20 transition-colors cursor-pointer" onClick={() => openUserDialog(u)}>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#FF2D78]/10 text-sm font-semibold text-[#FF2D78]">{getInitials(u.display_name)}</div>
                              <span className="text-sm font-medium">{u.display_name || 'Anonymous'}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-[#8B8BA3]">{u.email}</td>
                          <td className="px-4 py-3"><Badge variant={u.membership_tier === 'unlimited' ? 'default' : 'outline'} className="text-[10px] capitalize">{u.membership_tier}</Badge></td>
                          <td className="px-4 py-3 text-sm font-mono text-amber-400">{u.credits}</td>
                          <td className="px-4 py-3"><Badge variant={u.is_disabled ? 'destructive' : 'default'} className="text-[10px]">{u.is_disabled ? '禁用' : '正常'}</Badge></td>
                          <td className="px-4 py-3 text-sm text-[#8B8BA3]">{new Date(u.created_at).toLocaleDateString()}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); openUserDialog(u); }}>编辑</Button>
                              <Button variant="ghost" size="sm" className={u.is_disabled ? 'text-green-500 hover:text-green-400' : 'text-red-500 hover:text-red-400'}
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  if (!confirm(u.is_disabled ? '启用此用户?' : '禁用此用户?')) return;
                                  try {
                                    const res = await authedFetch('/api/admin/users', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: u.id, is_disabled: !u.is_disabled }) });
                                    if (!res.ok) throw new Error('Failed');
                                    fetchUsers();
                                  } catch { toast.error('操作失败'); }
                                }}
                              >{u.is_disabled ? '启用' : '禁用'}</Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-4">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>上一页</Button>
              <span className="text-sm text-[#8B8BA3]">{page} / {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>下一页</Button>
            </div>
          )}
        </>
      )}

      {/* TOKENS TAB */}
      {tab === 'tokens' && (
        <>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-[#8B8BA3]">管理 Stripe 充值档位 · 同步到前台商城</p>
            <Button onClick={openTokenCreate} className="gap-1.5 bg-[#FF2D78] hover:bg-[#e0266c]"><Plus className="h-4 w-4" /> 新建套餐</Button>
          </div>

          {tokensLoading ? (
            <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-[#FF2D78]" /></div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {packages.map((p) => (
                <Card key={p.id} className="border-white/[0.06] bg-card/40">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="font-semibold flex items-center gap-1.5">
                          {p.name}
                          {p.is_featured && <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />}
                        </div>
                        <div className="text-xs text-[#8B8BA3] mt-0.5 font-mono">{p.id}</div>
                      </div>
                      <Badge variant={p.is_active ? 'default' : 'outline'} className="text-[10px]">{p.is_active ? '上架' : '下架'}</Badge>
                    </div>
                    <div className="text-3xl font-bold text-amber-400">{p.token_count}</div>
                    <div className="text-xs text-[#8B8BA3] mb-2">积分{p.bonus_tokens ? ` · +${p.bonus_tokens} 赠送` : ''}</div>
                    <div className="text-lg font-semibold">${(p.price_cents / 100).toFixed(2)}
                      {!!p.discount_percent && <span className="ml-2 text-xs text-emerald-400">-{p.discount_percent}%</span>}
                    </div>
                    {p.description && <p className="text-xs text-[#8B8BA3] mt-2 line-clamp-2">{p.description}</p>}
                    <div className="flex gap-2 mt-4">
                      <Button size="sm" variant="outline" className="flex-1 gap-1" onClick={() => openTokenEdit(p)}><Pencil className="h-3.5 w-3.5" /> 编辑</Button>
                      <Button size="sm" variant="ghost" onClick={() => void toggleTokenActive(p)}>{p.is_active ? '下架' : '上架'}</Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* USER EDIT DIALOG */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>编辑用户</DialogTitle>
            <DialogDescription>管理 {selectedUser?.display_name || selectedUser?.email} 的账户设置</DialogDescription>
          </DialogHeader>
          {selectedUser && (
            <div className="space-y-5 py-2">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/20">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#FF2D78]/10 text-base font-semibold text-[#FF2D78]">{getInitials(selectedUser.display_name)}</div>
                <div>
                  <p className="text-sm font-medium">{selectedUser.display_name || 'Anonymous'}</p>
                  <p className="text-xs text-[#8B8BA3]">{selectedUser.email}</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label>会员等级</Label>
                <Select value={editTier} onValueChange={setEditTier}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Select tier" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="free">Free</SelectItem>
                    <SelectItem value="basic">Basic</SelectItem>
                    <SelectItem value="pro">Pro</SelectItem>
                    <SelectItem value="unlimited">Unlimited</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>积分余额</Label>
                <Input type="number" value={editCredits} onChange={(e) => setEditCredits(e.target.value)} min="0" />
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-1.5"><KeyRound className="h-3.5 w-3.5" /> 重置密码</Label>
                <Input type="text" placeholder="留空则不修改 (至少6位)" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                <p className="text-xs text-[#8B8BA3]">设置后用户下次登录需使用新密码</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button onClick={saveUserChanges} disabled={saving} className="bg-[#FF2D78] hover:bg-[#e0266c]">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} 保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* TOKEN EDIT DIALOG */}
      <Dialog open={tokenDialogOpen} onOpenChange={setTokenDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingToken ? '编辑套餐' : '新建套餐'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div><Label>名称</Label><Input value={tokenForm.name} onChange={(e) => setTokenForm({ ...tokenForm, name: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>积分数量</Label><Input type="number" value={tokenForm.token_count} onChange={(e) => setTokenForm({ ...tokenForm, token_count: e.target.value })} /></div>
              <div><Label>价格（美分）</Label><Input type="number" value={tokenForm.price_cents} onChange={(e) => setTokenForm({ ...tokenForm, price_cents: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>折扣 %</Label><Input type="number" value={tokenForm.discount_percent} onChange={(e) => setTokenForm({ ...tokenForm, discount_percent: e.target.value })} /></div>
              <div><Label>排序</Label><Input type="number" value={tokenForm.sort_order} onChange={(e) => setTokenForm({ ...tokenForm, sort_order: e.target.value })} /></div>
            </div>
            <div><Label>描述</Label><Input value={tokenForm.description} onChange={(e) => setTokenForm({ ...tokenForm, description: e.target.value })} /></div>
            <div className="flex items-center justify-between"><Label>推荐标签</Label><Switch checked={tokenForm.is_featured} onCheckedChange={(v) => setTokenForm({ ...tokenForm, is_featured: v })} /></div>
            <div className="flex items-center justify-between"><Label>上架</Label><Switch checked={tokenForm.is_active} onCheckedChange={(v) => setTokenForm({ ...tokenForm, is_active: v })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTokenDialogOpen(false)}>取消</Button>
            <Button onClick={() => void saveToken()} disabled={tokenSaving || !tokenForm.name} className="bg-[#FF2D78] hover:bg-[#e0266c]">
              {tokenSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

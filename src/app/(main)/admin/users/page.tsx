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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Search, User, X } from 'lucide-react';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';

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

export default function AdminUsersPage() {
  const { user } = useAuth();
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

  // Edit user form state
  const [editTier, setEditTier] = useState('free');
  const [editCredits, setEditCredits] = useState('0');
  const [saving, setSaving] = useState(false);

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

  useEffect(() => {
    fetchUsers();
  }, [page, tierFilter, statusFilter]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchUsers();
  };

  const openUserDialog = (u: UserData) => {
    setSelectedUser(u);
    setEditTier(u.membership_tier);
    setEditCredits(String(u.credits));
    setDialogOpen(true);
  };

  const saveUserChanges = async () => {
    if (!selectedUser) return;
    setSaving(true);
    try {
      const res = await authedFetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedUser.id,
          membership_tier: editTier,
          credits: parseInt(editCredits, 10) || 0,
        }),
      });
      if (!res.ok) throw new Error('Failed to update');
      toast.success('User updated');
      setDialogOpen(false);
      fetchUsers();
    } catch (err) {
      logger.error(String(err));
      toast.error('Failed to update user');
    } finally {
      setSaving(false);
    }
  };

  const getInitials = (name: string | null) => {
    if (!name) return '?';
    return name.charAt(0).toUpperCase();
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">用户管理</h1>
        <p className="text-sm text-[#8B8BA3] mt-1">查看和管理所有注册用户</p>
      </div>

      {/* Search + Filters */}
      <div className="mb-6 space-y-3">
        <form onSubmit={handleSearch} className="flex gap-2 max-w-md">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8B8BA3]" />
            <Input
              placeholder="Search by name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button type="submit" size="sm">Search</Button>
        </form>
        <div className="flex flex-wrap gap-2">
          <Select value={tierFilter} onValueChange={(v) => { setTierFilter(v); setPage(1); }}>
            <SelectTrigger className="w-[130px] h-8 text-xs"><SelectValue placeholder="All Tiers" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Tiers</SelectItem>
              <SelectItem value="free">Free</SelectItem>
              <SelectItem value="pro">Pro</SelectItem>
              <SelectItem value="unlimited">Unlimited</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
            <SelectTrigger className="w-[130px] h-8 text-xs"><SelectValue placeholder="All Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="disabled">Disabled</SelectItem>
            </SelectContent>
          </Select>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
            className="w-[140px] h-8 text-xs"
            placeholder="From date"
          />
          <span className="text-xs text-[#8B8BA3] self-center">—</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
            className="w-[140px] h-8 text-xs"
            placeholder="To date"
          />
          {(tierFilter !== 'all' || statusFilter !== 'all' || dateFrom || dateTo) && (
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setTierFilter('all'); setStatusFilter('all'); setDateFrom(''); setDateTo(''); setPage(1); }}>
              Reset
            </Button>
          )}
        </div>
      </div>

      {/* Users Table */}
      <Card className="border-white/[0.05] bg-card/40 backdrop-blur-sm">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-[#FF2D78]" />
            </div>
          ) : users.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-[#8B8BA3]">
              <User className="h-12 w-12 mb-2 opacity-30" />
              <p>No users found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    <th className="text-left text-xs font-medium text-[#8B8BA3] px-4 py-3">User</th>
                    <th className="text-left text-xs font-medium text-[#8B8BA3] px-4 py-3">Email</th>
                    <th className="text-left text-xs font-medium text-[#8B8BA3] px-4 py-3">Membership</th>
                    <th className="text-left text-xs font-medium text-[#8B8BA3] px-4 py-3">Credits</th>
                    <th className="text-left text-xs font-medium text-[#8B8BA3] px-4 py-3">Status</th>
                    <th className="text-left text-xs font-medium text-[#8B8BA3] px-4 py-3">Joined</th>
                    <th className="text-left text-xs font-medium text-[#8B8BA3] px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr
                      key={u.id}
                      className="border-b border-border/20 hover:bg-muted/20 transition-colors cursor-pointer"
                      onClick={() => openUserDialog(u)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#FF2D78]/[10] text-sm font-semibold text-[#FF2D78]">
                            {getInitials(u.display_name)}
                          </div>
                          <span className="text-sm font-medium">{u.display_name || 'Anonymous'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-[#8B8BA3]">{u.email}</td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={u.membership_tier === 'unlimited' ? 'default' : 'outline'}
                          className="text-[10px] capitalize"
                        >
                          {u.membership_tier}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-sm">{u.credits}</td>
                      <td className="px-4 py-3">
                        <Badge variant={u.is_disabled ? 'destructive' : 'default'} className="text-[10px]">
                          {u.is_disabled ? 'Disabled' : 'Active'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-sm text-[#8B8BA3]">
                        {new Date(u.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              openUserDialog(u);
                            }}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className={u.is_disabled ? 'text-green-500 hover:text-green-400' : 'text-red-500 hover:text-red-400'}
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (!confirm(u.is_disabled ? 'Enable this user?' : 'Disable this user?')) return;
                              try {
                                const res = await authedFetch('/api/admin/users', {
                                  method: 'PATCH',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ user_id: u.id, is_disabled: !u.is_disabled }),
                                });
                                if (!res.ok) throw new Error('Failed');
                                fetchUsers();
                              } catch { toast.error('Failed to update status'); }
                            }}
                          >
                            {u.is_disabled ? 'Enable' : 'Disable'}
                          </Button>
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

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Prev
          </Button>
          <span className="text-sm text-[#8B8BA3]">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}

      {/* User Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>
              Manage settings for {selectedUser?.display_name || selectedUser?.email}
            </DialogDescription>
          </DialogHeader>

          {selectedUser && (
            <div className="space-y-6 py-2">
              {/* User Info Summary */}
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/20">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#FF2D78]/[10] text-base font-semibold text-[#FF2D78]">
                  {getInitials(selectedUser.display_name)}
                </div>
                <div>
                  <p className="text-sm font-medium">{selectedUser.display_name || 'Anonymous'}</p>
                  <p className="text-xs text-[#8B8BA3]">{selectedUser.email}</p>
                </div>
              </div>

              {/* Membership Tier */}
              <div className="space-y-2">
                <Label htmlFor="edit-tier">Membership Tier</Label>
                <Select value={editTier} onValueChange={setEditTier}>
                  <SelectTrigger className="w-full" id="edit-tier">
                    <SelectValue placeholder="Select tier" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="free">Free</SelectItem>
                    <SelectItem value="pro">Pro</SelectItem>
                    <SelectItem value="unlimited">Unlimited</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Credits */}
              <div className="space-y-2">
                <Label htmlFor="edit-credits">Credits</Label>
                <Input
                  id="edit-credits"
                  type="number"
                  value={editCredits}
                  onChange={(e) => setEditCredits(e.target.value)}
                  min="0"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveUserChanges} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
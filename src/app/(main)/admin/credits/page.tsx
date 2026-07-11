'use client';

import { useEffect, useState } from 'react';
import { authedFetch } from '@/lib/supabase';
import { useAuth } from '@/components/AuthProvider';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Loader2, Search, CreditCard, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';

type UserCredit = {
  id: string;
  display_name: string | null;
  email: string;
  membership_tier: string;
  credits_remaining: number;
  total_credits_earned?: number;
  created_at: string;
};

export default function AdminCreditsPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<UserCredit[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserCredit | null>(null);
  const [addAmount, setAddAmount] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchCredits = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', '20');
      if (search.trim()) params.set('search', search.trim());

      const res = await authedFetch(`/api/admin/credits?${params.toString()}`);
      const data = await res.json();
      if (data.users) setUsers(data.users);
      else if (Array.isArray(data)) setUsers(data);
      if (data.totalPages) setTotalPages(data.totalPages);
    } catch (err) {
      logger.error(String(err));
      toast.error('Failed to load credits');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCredits();
  }, [page]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchCredits();
  };

  const openAdjustDialog = (u: UserCredit) => {
    setSelectedUser(u);
    setAddAmount('');
    setReason('');
    setDialogOpen(true);
  };

  const handleAdjust = async () => {
    if (!selectedUser) return;
    const amount = parseInt(addAmount, 10);
    if (isNaN(amount) || amount <= 0) {
      toast.error('Please enter a valid positive number');
      return;
    }

    setSaving(true);
    try {
      const res = await authedFetch('/api/admin/credits', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: selectedUser.id,
          credits_remaining: selectedUser.credits_remaining + amount,
          operation: 'add',
          amount,
          reason: reason || 'Manual adjustment',
        }),
      });
      if (!res.ok) throw new Error('Failed to adjust credits');
      toast.success(`Added ${amount} credits to ${selectedUser.display_name || selectedUser.email}`);
      setDialogOpen(false);
      setSelectedUser(null);
      fetchCredits();
    } catch (err) {
      logger.error(String(err));
      toast.error('Failed to adjust credits');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
    <div className="mx-6 mt-4 mb-0 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
      提示：代币套餐请在 <a className="underline font-medium" href="/admin/tokens">代币与积分</a> 统一管理；本页保留积分流水与调账工具。
    </div>

    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Credit Management</h1>
        <p className="text-sm text-[#8B8BA3] mt-1">View and adjust user credit balances</p>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="mb-6 flex gap-2 max-w-md">
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

      {/* Credits Table */}
      <Card className="border-white/[0.05] bg-card/40 backdrop-blur-sm">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-[#FF2D78]" />
            </div>
          ) : users.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-[#8B8BA3]">
              <CreditCard className="h-12 w-12 mb-2 opacity-30" />
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
                    <th className="text-left text-xs font-medium text-[#8B8BA3] px-4 py-3">Current Credits</th>
                    <th className="text-left text-xs font-medium text-[#8B8BA3] px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#FF2D78]/10 text-sm font-semibold text-[#FF2D78]">
                            {u.display_name ? u.display_name.charAt(0).toUpperCase() : '?'}
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
                      <td className="px-4 py-3">
                        <span className="text-sm font-semibold">{u.credits_remaining}</span>
                      </td>
                      <td className="px-4 py-3">
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5"
                          onClick={() => openAdjustDialog(u)}
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Adjust Credits
                        </Button>
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

      {/* Adjust Credits Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Adjust Credits</DialogTitle>
            <DialogDescription>
              Add credits to {selectedUser?.display_name || selectedUser?.email}
            </DialogDescription>
          </DialogHeader>

          {selectedUser && (
            <div className="space-y-4 py-2">
              {/* Current balance */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/20">
                <span className="text-sm text-[#8B8BA3]">Current Credits</span>
                <span className="text-lg font-bold">{selectedUser.credits_remaining}</span>
              </div>

              <div className="space-y-2">
                <Label htmlFor="add-credits">Add Credits</Label>
                <Input
                  id="add-credits"
                  type="number"
                  value={addAmount}
                  onChange={(e) => setAddAmount(e.target.value)}
                  placeholder="Enter amount to add..."
                  min="1"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="credit-reason">Reason (optional)</Label>
                <Input
                  id="credit-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Bonus, compensation, purchase"
                />
              </div>

              {/* Preview */}
              {addAmount && parseInt(addAmount) > 0 && (
                <div className="flex items-center justify-between p-3 rounded-lg bg-[#FF2D78]/5 border border-primary/10">
                  <span className="text-sm">New balance will be</span>
                  <span className="text-lg font-bold text-[#FF2D78]">
                    {selectedUser.credits_remaining + parseInt(addAmount)}
                  </span>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAdjust} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add Credits
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </>
  );
}

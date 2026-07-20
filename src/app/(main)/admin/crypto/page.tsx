'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { authedFetch } from '@/lib/supabase';
import { Loader2, Search, CheckCircle, XCircle, Clock, AlertCircle, ExternalLink, RefreshCw, DollarSign, Users, CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

interface CryptoPayment {
  id: string;
  user_id: string;
  plan_id: string;
  amount_usd: number;
  currency: string;
  wallet_address: string;
  tx_hash: string | null;
  status: string;
  screenshot_url: string | null;
  admin_notes: string | null;
  created_at: string;
  confirmed_at: string | null;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  awaiting_payment: { label: 'Awaiting Payment', color: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20', icon: Clock },
  pending_verification: { label: 'Pending Verification', color: 'bg-blue-500/10 text-blue-400 border-blue-500/20', icon: AlertCircle },
  confirmed: { label: 'Confirmed', color: 'bg-green-500/10 text-green-400 border-green-500/20', icon: CheckCircle },
  rejected: { label: 'Rejected', color: 'bg-red-500/10 text-red-400 border-red-500/20', icon: XCircle },
};

const PROVIDER_CONFIG: Record<string, { label: string; color: string }> = {
  NowPayments: { label: 'NOWPayments', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  NexaPay: { label: 'NexaPay', color: 'bg-sky-500/10 text-sky-400 border-sky-500/20' },
  Stripe: { label: 'Stripe', color: 'bg-violet-500/10 text-violet-400 border-violet-500/20' },
  Crypto: { label: 'Crypto', color: 'bg-orange-500/10 text-orange-400 border-orange-500/20' },
};

function getProvider(payment: CryptoPayment): string {
  if (payment.tx_hash?.startsWith('np_')) return 'NowPayments';
  if (payment.tx_hash?.startsWith('nxp_')) return 'NexaPay';
  if (payment.tx_hash?.startsWith('stripe_') || payment.tx_hash?.startsWith('cs_')) return 'Stripe';
  return 'Crypto';
}

export default function AdminCryptoPage() {
  const [payments, setPayments] = useState<CryptoPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [providerFilter, setProviderFilter] = useState<string | null>(null);
  const [actionDialog, setActionDialog] = useState<{
    payment: CryptoPayment;
    action: 'confirm' | 'reject';
  } | null>(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (providerFilter) params.set('provider', providerFilter);
      const res = await authedFetch(`/api/admin/crypto?${params}`);
      const data = await res.json();
      if (data.success) {
        setPayments(data.payments);
      }
    } catch {
      toast.error('Failed to load payments');
    }
    setLoading(false);
  }, [statusFilter, providerFilter]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  // Compute stats from loaded payments
  const stats = useMemo(() => {
    const total = payments.length;
    const pending = payments.filter(p => p.status === 'pending_verification' || p.status === 'awaiting_payment').length;
    const confirmed = payments.filter(p => p.status === 'confirmed').length;
    const revenue = payments.filter(p => p.status === 'confirmed').reduce((sum, p) => sum + (p.amount_usd || 0), 0);
    return { total, pending, confirmed, revenue };
  }, [payments]);

  const handleConfirm = async () => {
    if (!actionDialog) return;
    setActionLoading(true);
    try {
      const res = await authedFetch('/api/admin/crypto', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: actionDialog.payment.id,
          action: actionDialog.action,
          admin_notes: adminNotes || null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(
          actionDialog.action === 'confirm'
            ? 'Payment confirmed! Membership upgraded.'
            : 'Payment rejected.'
        );
        setActionDialog(null);
        setAdminNotes('');
        fetchPayments();
      } else {
        toast.error(data.error || 'Action failed');
      }
    } catch {
      toast.error('Network error');
    }
    setActionLoading(false);
  };

  const formatAmount = (usd: number) => `$${usd.toFixed(2)}`;
  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  const statusTabs = [
    { label: 'All', value: null },
    { label: 'Pending', value: 'pending_verification' },
    { label: 'Awaiting', value: 'awaiting_payment' },
    { label: 'Confirmed', value: 'confirmed' },
    { label: 'Rejected', value: 'rejected' },
  ];

  const providerTabs = [
    { label: 'All', value: null },
    { label: 'Crypto', value: 'crypto' },
    { label: 'NOWPayments', value: 'nowpayments' },
    { label: 'NexaPay', value: 'nexapay' },
    { label: 'Stripe', value: 'stripe' },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Payment Management</h1>
          <p className="text-sm text-[#8B8BA3] mt-1">
            Manage all payment verifications — Crypto, NOWPayments, NexaPay, Stripe
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchPayments} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-white/[0.04] border-white/[0.06]">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-white/[0.06] flex items-center justify-center">
              <CreditCard className="h-5 w-5 text-white/60" />
            </div>
            <div>
              <div className="text-xl font-bold">{stats.total}</div>
              <div className="text-[11px] text-[#8B8BA3]">Total Payments</div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white/[0.04] border-white/[0.06]">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-yellow-500/10 flex items-center justify-center">
              <Clock className="h-5 w-5 text-yellow-400" />
            </div>
            <div>
              <div className="text-xl font-bold">{stats.pending}</div>
              <div className="text-[11px] text-[#8B8BA3]">Pending</div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white/[0.04] border-white/[0.06]">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-green-500/10 flex items-center justify-center">
              <CheckCircle className="h-5 w-5 text-green-400" />
            </div>
            <div>
              <div className="text-xl font-bold">{stats.confirmed}</div>
              <div className="text-[11px] text-[#8B8BA3]">Confirmed</div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white/[0.04] border-white/[0.06]">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
              <DollarSign className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <div className="text-xl font-bold">${stats.revenue.toFixed(0)}</div>
              <div className="text-[11px] text-[#8B8BA3]">Revenue</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Provider filter */}
      <div className="flex gap-2 flex-wrap">
        {providerTabs.map((tab) => (
          <Button
            key={tab.label}
            variant={providerFilter === tab.value ? 'default' : 'outline'}
            size="sm"
            onClick={() => setProviderFilter(tab.value)}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      {/* Status filter */}
      <div className="flex gap-2 flex-wrap">
        {statusTabs.map((tab) => (
          <Button
            key={tab.label}
            variant={statusFilter === tab.value ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter(tab.value)}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      {/* Payments list */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-[#FF2D78]" />
        </div>
      ) : payments.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Search className="h-12 w-12 mx-auto mb-4 text-[#8B8BA3]/40" />
            <p className="text-[#8B8BA3]">No payments found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {payments.map((payment) => {
            const statusCfg = STATUS_CONFIG[payment.status] || STATUS_CONFIG.awaiting_payment;
            const StatusIcon = statusCfg.icon;
            const provider = getProvider(payment);
            const providerCfg = PROVIDER_CONFIG[provider] || PROVIDER_CONFIG.Crypto;

            return (
              <Card key={payment.id} className="bg-white/[0.04] backdrop-blur-xl border-white/[0.06]">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className="font-semibold capitalize">{payment.plan_id}</span>
                        <span className="text-sm text-[#8B8BA3]">
                          {formatAmount(payment.amount_usd)}
                        </span>
                        <Badge
                          variant="outline"
                          className={`${providerCfg.color} border text-[10px] px-2 py-0`}
                        >
                          {providerCfg.label}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={`${statusCfg.color} border text-[10px] px-2 py-0`}
                        >
                          <StatusIcon className="h-3 w-3 mr-1 inline" />
                          {statusCfg.label}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                        <div>
                          <span className="text-[#8B8BA3]">Currency: </span>
                          <span>{payment.currency}</span>
                        </div>
                        <div>
                          <span className="text-[#8B8BA3]">User ID: </span>
                          <span className="font-mono text-xs">{payment.user_id.slice(0, 8)}...</span>
                        </div>
                        <div>
                          <span className="text-[#8B8BA3]">Date: </span>
                          <span>{formatDate(payment.created_at)}</span>
                        </div>
                        {payment.tx_hash && (
                          <div>
                            <span className="text-[#8B8BA3]">TX: </span>
                            <span className="font-mono text-xs">{payment.tx_hash.slice(0, 20)}...</span>
                          </div>
                        )}
                      </div>

                      {payment.admin_notes && (
                        <div className="mt-2 text-xs text-[#8B8BA3] bg-white/[0.04] rounded-md px-3 py-1.5">
                          Notes: {payment.admin_notes}
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    {(payment.status === 'pending_verification' || payment.status === 'awaiting_payment') && (
                      <div className="flex gap-2 shrink-0">
                        <Button
                          size="sm"
                          className="bg-green-600 hover:bg-green-700 text-white"
                          onClick={() => setActionDialog({ payment, action: 'confirm' })}
                        >
                          <CheckCircle className="h-4 w-4 mr-1" />
                          Confirm
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => setActionDialog({ payment, action: 'reject' })}
                        >
                          <XCircle className="h-4 w-4 mr-1" />
                          Reject
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Action confirmation dialog */}
      <Dialog
        open={!!actionDialog}
        onOpenChange={(open) => {
          if (!open) setActionDialog(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionDialog?.action === 'confirm' ? 'Confirm Payment' : 'Reject Payment'}
            </DialogTitle>
            <DialogDescription>
              {actionDialog?.action === 'confirm'
                ? 'This will mark the payment as confirmed and upgrade the user\'s membership.'
                : 'This will mark the payment as rejected. The user will not be upgraded.'}
            </DialogDescription>
          </DialogHeader>

          {actionDialog && (
            <div className="space-y-3 py-2 text-sm">
              <div className="flex justify-between">
                <span className="text-[#8B8BA3]">Plan:</span>
                <span className="font-semibold capitalize">{actionDialog.payment.plan_id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#8B8BA3]">Amount:</span>
                <span className="font-semibold">
                  {formatAmount(actionDialog.payment.amount_usd)} ({actionDialog.payment.currency})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#8B8BA3]">Provider:</span>
                <span>{getProvider(actionDialog.payment)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#8B8BA3]">TX Hash:</span>
                <span className="font-mono text-xs max-w-[200px] truncate">
                  {actionDialog.payment.tx_hash || 'N/A'}
                </span>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm text-[#8B8BA3]">Admin Notes (optional)</label>
            <Textarea
              placeholder="Add notes about this decision..."
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              rows={3}
            />
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setActionDialog(null)} disabled={actionLoading}>
              Cancel
            </Button>
            <Button
              variant={actionDialog?.action === 'confirm' ? 'default' : 'destructive'}
              onClick={handleConfirm}
              disabled={actionLoading}
            >
              {actionLoading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              {actionDialog?.action === 'confirm' ? 'Yes, Confirm' : 'Yes, Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
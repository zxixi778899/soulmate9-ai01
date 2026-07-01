'use client';

import { authedFetch } from '@/lib/supabase';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ArrowLeft,
  CreditCard,
  Bitcoin,
  ShoppingBag,
  CheckCircle,
  Clock,
  XCircle,
  AlertCircle,
  Package,
} from 'lucide-react';
import { useTranslation } from '@/lib/i18n/context';

interface Purchase {
  id: string;
  type: 'crypto' | 'shop';
  amount_usd?: number;
  amount?: number;
  currency: string;
  plan?: string;
  item_name?: string;
  item_type?: string;
  status: string;
  tx_hash?: string;
  created_at: string;
}

export default function PurchasesPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [membership, setMembership] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPurchases();
  }, []);

  const fetchPurchases = async () => {
    try {
      const res = await authedFetch('/api/purchases');
      const data = await res.json();
      if (data.success) {
        setPurchases(data.purchases || []);
        setMembership(data.membership);
      }
    } catch (e) {
      console.error('Failed to fetch purchases', e);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
      case 'confirmed':
        return { label: 'Completed', icon: CheckCircle, class: 'bg-green-500/15 text-green-500' };
      case 'pending':
      case 'awaiting_payment':
        return { label: 'Awaiting', icon: Clock, class: 'bg-amber-500/15 text-amber-500' };
      case 'rejected':
      case 'failed':
        return { label: 'Failed', icon: XCircle, class: 'bg-red-500/15 text-red-500' };
      default:
        return { label: status, icon: AlertCircle, class: 'bg-muted text-muted-foreground' };
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'crypto':
        return <Bitcoin className="h-4 w-4 text-purple-400" />;
      case 'shop':
        return <ShoppingBag className="h-4 w-4 text-blue-400" />;
      default:
        return <CreditCard className="h-4 w-4 text-muted-foreground" />;
    }
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto pb-20">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-border/20 bg-background/80 px-4 sm:px-8 py-5 backdrop-blur-xl">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{t('purchases.title')}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">{t('purchases.subtitle')}</p>
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-6 p-4 sm:p-8">
        {/* Membership Card */}
        {membership && (
          <Card className="border-primary/20 bg-gradient-to-br from-primary/5 via-background to-background">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Package className="h-5 w-5 text-primary" />
                Current Plan
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <Badge className="mb-2 bg-primary/20 text-primary hover:bg-primary/30">
                    {membership.membership_tier?.charAt(0).toUpperCase() + membership.membership_tier?.slice(1) || 'Free'}
                  </Badge>
                  <p className="text-sm text-muted-foreground mt-1">
                    {membership.credits_remaining} credits remaining
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => router.push('/pricing')}>
                  Upgrade
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Purchase History */}
        <div>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-muted-foreground" />
            {t('purchases.history')}
          </h2>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 w-full rounded-xl" />
              ))}
            </div>
          ) : purchases.length === 0 ? (
            <Card className="border-border/20 bg-card/40">
              <CardContent className="flex flex-col items-center py-12">
                <ShoppingBag className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">{t('purchases.empty')}</p>
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => router.push('/pricing')}
                >
                  Browse Plans
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {purchases.map((p) => {
                const badge = getStatusBadge(p.status);
                return (
                  <Card key={p.id} className="border-border/20 bg-card/40 transition-colors hover:border-border/40">
                    <CardContent className="flex items-center justify-between p-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                          {getTypeIcon(p.type)}
                        </div>
                        <div>
                          <p className="text-sm font-medium">
                            {p.type === 'crypto'
                              ? `${p.plan || 'Subscription'} — ${p.currency}`
                              : p.item_name || 'Shop Item'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(p.created_at).toLocaleDateString('en-US', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            })}
                            {p.tx_hash && ` · ${p.tx_hash.slice(0, 10)}...`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold">
                          {p.amount_usd
                            ? `$${p.amount_usd.toFixed(2)}`
                            : p.amount
                              ? `$${(p.amount / 100).toFixed(2)}`
                              : '-'}
                        </span>
                        <Badge className={`gap-1 rounded-full px-2 py-0.5 text-[10px] ${badge.class}`}>
                          <badge.icon className="h-3 w-3" />
                          {badge.label}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
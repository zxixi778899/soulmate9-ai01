'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Coins, TrendingUp, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TokenBalanceDisplayProps {
  userId: string;
  showUpgradeCTA?: boolean;
}

export function TokenBalanceDisplay({ userId, showUpgradeCTA = true }: TokenBalanceDisplayProps) {
  const [balance, setBalance] = useState<{
    remaining: number;
    purchased: number;
    consumed: number;
    tier: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadBalance();
  }, [userId]);

  const loadBalance = async () => {
    try {
      const res = await fetch(`/api/user/tokens`, {
        headers: { 'x-session': localStorage.getItem('sb-access-token') || '' },
      });
      if (res.ok) {
        const data = await res.json();
        setBalance(data);
      }
    } catch (err) {
      console.error('[TokenBalance] Load failed:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card className="w-full animate-pulse">
        <CardHeader className="pb-3">
          <div className="h-4 bg-gray-800 rounded w-1/3" />
        </CardHeader>
        <CardContent>
          <div className="h-6 bg-gray-800 rounded w-1/2" />
        </CardContent>
      </Card>
    );
  }

  if (!balance) return null;

  const percentage = balance.purchased > 0 
    ? (balance.consumed / balance.purchased) * 100 
    : 0;
  
  const isLow = balance.remaining < 50;
  const isFree = balance.tier === 'free';
  const isPro = balance.tier === 'pro';
  const isUnlimited = balance.tier === 'unlimited';

  return (
    <Card className={cn(
      "w-full",
      isLow && "border-red-500/50 bg-red-950/20"
    )}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium text-gray-400 flex items-center gap-2">
          <Coins className="h-4 w-4" />
          Generation Tokens
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Balance Display */}
        <div className="flex items-baseline justify-between">
          <div>
            <p className="text-3xl font-bold text-white">
              {balance.remaining.toLocaleString()}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              tokens remaining
            </p>
          </div>
          
          <Badge variant={isUnlimited ? 'default' : isPro ? 'secondary' : 'outline'}>
            {balance.tier.toUpperCase()}
          </Badge>
        </div>

        {/* Progress Bar */}
        {balance.purchased > 0 && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-gray-500">
              <span>Consumed</span>
              <span>{balance.consumed.toLocaleString()} / {balance.purchased.toLocaleString()}</span>
            </div>
            <div className="w-full bg-gray-800 rounded-full h-1.5">
              <div 
                className="bg-gradient-to-r from-purple-600 to-pink-600 h-1.5 rounded-full transition-all"
                style={{ width: `${Math.min(percentage, 100)}%` }}
              />
            </div>
          </div>
        )}

        {/* Low Balance Warning */}
        {isLow && showUpgradeCTA && (
          <div className="flex items-start gap-2 p-3 bg-red-950/30 border border-red-800/50 rounded-lg">
            <AlertCircle className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1 space-y-1">
              <p className="text-sm font-medium text-red-300">
                Running low on tokens
              </p>
              <p className="text-xs text-red-400/80">
                {isFree ? 'Upgrade to Pro for 500 tokens/month' : 
                 isPro ? 'Upgrade to Unlimited for 2000 tokens' :
                 'Purchase more tokens to continue'}
              </p>
            </div>
          </div>
        )}

        {/* Upgrade CTA */}
        {showUpgradeCTA && (balance.remaining < 100 || isFree) && (
          <Button 
            className="w-full" 
            size="sm"
            onClick={() => window.location.href = '/shop'}
          >
            <TrendingUp className="h-4 w-4 mr-2" />
            {isFree ? 'Upgrade Now' : 'Get More Tokens'}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

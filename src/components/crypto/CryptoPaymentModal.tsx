'use client';

import { useState, useEffect } from 'react';
import { X, Copy, Loader2, ExternalLink, Bitcoin, CheckCircle2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import QRCode from 'qrcode';

interface CryptoPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  paymentId?: string;
  address?: string;
  amount?: number;
  currency?: string;
  network?: string;
  priceAmount?: number;
}

export function CryptoPaymentModal({
  isOpen,
  onClose,
  paymentId,
  address,
  amount,
  currency,
  network,
  priceAmount,
}: CryptoPaymentModalProps) {
  const [qrCode, setQrCode] = useState<string>('');
  const [copyStatus, setCopyStatus] = useState<'idle' | 'success'>('idle');
  const [status, setStatus] = useState<'waiting' | 'paid' | 'expired'>('waiting');

  // Generate QR code when address is available
  useEffect(() => {
    if (address && isOpen) {
      QRCode.toDataURL(address, {
        width: 256,
        margin: 2,
      }).then(setQrCode).catch(console.error);
    }
  }, [address, isOpen]);

  // Check payment status periodically
  useEffect(() => {
    if (!paymentId || !isOpen) return;

    const checkStatus = async () => {
      try {
        const response = await fetch(`/api/crypto/status?id=${paymentId}`);
        const data = await response.json();

        if (data.confirmed) {
          setStatus('paid');
          setTimeout(() => {
            window.location.reload(); // Reload to show updated membership
          }, 2000);
        } else if (data.expired) {
          setStatus('expired');
        }
      } catch (err) {
        console.error('Failed to check payment status:', err);
      }
    };

    const interval = setInterval(checkStatus, 5000); // Check every 5 seconds
    return () => clearInterval(interval);
  }, [paymentId, isOpen]);

  if (!isOpen) return null;

  const handleCopyAddress = async () => {
    if (address) {
      await navigator.clipboard.writeText(address);
      setCopyStatus('success');
      setTimeout(() => setCopyStatus('idle'), 2000);
    }
  };

  const handleRefresh = () => {
    // Refresh page or reload payment state
    window.location.reload();
  };

  const currencySymbol = currency === 'btc' ? '₿' : 
                        currency === 'eth' ? 'Ξ' : '$';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="relative max-w-lg w-full mx-4">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
        >
          <X className="h-6 w-6" />
        </button>

        {/* Payment Modal */}
        <Card className="p-6 space-y-6">
          {/* Header */}
          <div className="text-center space-y-2">
            <div className="flex items-center justify-center gap-2 text-purple-500">
              <Bitcoin className="h-8 w-8" />
              <h2 className="text-2xl font-bold bg-gradient-to-r from-purple-500 to-pink-500 bg-clip-text text-transparent">
                Pay with Cryptocurrency
              </h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Send exactly {currencySymbol}{amount} {currency?.toUpperCase()} to complete your purchase
            </p>
          </div>

          {/* Status Tabs */}
          <Tabs defaultValue="scan" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="scan">Scan QR Code</TabsTrigger>
              <TabsTrigger value="manual">Manual Transfer</TabsTrigger>
            </TabsList>

            <TabsContent value="scan" className="space-y-4">
              {qrCode ? (
                <div className="flex justify-center">
                  <div className="bg-white p-4 rounded-xl shadow-inner">
                    <img src={qrCode} alt="QR Code" className="w-64 h-64" />
                  </div>
                </div>
              ) : (
                <div className="flex justify-center">
                  <Loader2 className="h-16 w-16 animate-spin text-muted-foreground" />
                </div>
              )}

              {status === 'paid' && (
                <div className="flex items-center justify-center text-green-500">
                  <CheckCircle2 className="h-6 w-6 mr-2" />
                  <span className="font-semibold">Payment Confirmed!</span>
                </div>
              )}
            </TabsContent>

            <TabsContent value="manual" className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-muted-foreground">
                    Recipient Address ({currency?.toUpperCase()})
                  </label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopyAddress}
                    disabled={!address}
                    className="gap-2"
                  >
                    {copyStatus === 'success' ? (
                      <>
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4" />
                        Copy
                      </>
                    )}
                  </Button>
                </div>

                <div className="relative">
                  <textarea
                    readOnly
                    value={address || ''}
                    className="w-full min-h-[80px] p-3 text-xs font-mono border rounded-lg bg-muted resize-none focus:outline-none"
                  />
                </div>

                {network && (
                  <div className="text-xs text-muted-foreground">
                    <strong>Network:</strong> {network.replace('_', ' ')}
                  </div>
                )}

                <div className="text-xs text-orange-500 mt-2">
                  ⚠️ Only send{' '}
                  <strong>{currency?.toUpperCase()}</strong> to this address. 
                  Sending other tokens may result in permanent loss.
                </div>
              </div>
            </TabsContent>
          </Tabs>

          {/* Payment Details */}
          <div className="space-y-2 pt-4 border-t">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Amount Due:</span>
              <span className="font-semibold">{currencySymbol}{amount}</span>
            </div>
            
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Order ID:</span>
              <span className="font-mono text-xs">{paymentId}</span>
            </div>

            <div className="flex justify-between text-sm text-orange-500">
              <span className="text-muted-foreground">Expires in:</span>
              <span className="font-semibold">14:59</span>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex gap-3 pt-4">
            <Button
              variant="outline"
              onClick={handleRefresh}
              className="flex-1"
              disabled={status === 'paid'}
            >
              Refresh
            </Button>
            
            <Button
              variant="default"
              className="flex-1 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
              disabled={status !== 'waiting'}
            >
              {status === 'paid' ? (
                <>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Paid - Redirecting...
                </>
              ) : (
                'I Have Sent Payment'
              )}
            </Button>
          </div>

          {/* Help Links */}
          <div className="text-center text-xs text-muted-foreground space-y-1">
            <p>Need help?</p>
            <div className="flex gap-4 justify-center">
              <a 
                href="https://docs.nowpayments.io" 
                target="_blank" 
                rel="noopener noreferrer"
                className="hover:text-primary flex items-center gap-1"
              >
                Documentation
                <ExternalLink className="h-3 w-3" />
              </a>
              <a 
                href="mailto:support@soulmate.ai"
                className="hover:text-primary"
              >
                Contact Support
              </a>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

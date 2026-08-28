'use client';

/**
 * AdminControlNetBatchUpload — Batch upload ControlNet resources for presets
 * 
 * Admin-only feature to bulk-generate ControlNet assets (OpenPose, Canny, Depth, etc.)
 * for multiple presets at once using ComfyUI preprocessing nodes.
 */

import { useState } from 'react';
import { useTranslation } from '@/lib/i18n/context';
import { authedFetch } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, RefreshCw, Upload, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';

interface PresetOption {
  id: string;
  slug: string;
  label_en: string;
  category: string;
}

export function AdminControlNetBatchUpload() {
  const { t } = useTranslation();
  const [presets, setPresets] = useState<PresetOption[]>([]);
  const [selectedPresetIds, setSelectedPresetIds] = useState<string[]>([]);
  const [selectedAssetTypes, setSelectedAssetTypes] = useState<string[]>(['openpose', 'canny']);
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  // ========== Load Presets on Mount ==========
  useState(() => {
    loadPresets();
  });

  const loadPresets = async () => {
    try {
      const res = await authedFetch('/api/admin/gen-custom-presets');
      if (!res.ok) return;
      
      const data = await res.json();
      const merged: PresetOption[] = [];
      
      if (data?.presets) {
        for (const cat of ['pose', 'outfit', 'scene'] as const) {
          const list = data.presets[cat];
          if (Array.isArray(list)) {
            for (const p of list) {
              merged.push({
                id: '', // Would need preset UUIDs
                slug: p.slug,
                label_en: p.label_en,
                category: cat,
              });
            }
          }
        }
      }
      
      setPresets(merged);
    } catch (err) {
      logger.warn('[AdminControlNetBatchUpload] Failed to load presets', { error: String(err) });
    }
  };

  const togglePresetSelection = (presetId: string) => {
    setSelectedPresetIds(prev => 
      prev.includes(presetId) 
        ? prev.filter(id => id !== presetId)
        : [...prev, presetId]
    );
  };

  const toggleAssetType = (type: string) => {
    setSelectedAssetTypes(prev =>
      prev.includes(type)
        ? prev.filter(t => t !== type)
        : [...prev, type]
    );
  };

  const startBatchUpload = async () => {
    if (selectedPresetIds.length === 0) {
      setError('Please select at least one preset');
      return;
    }
    
    if (selectedAssetTypes.length === 0) {
      setError('Please select at least one asset type');
      return;
    }

    setIsProcessing(true);
    setError(null);
    setResults([]);

    try {
      const res = await authedFetch('/api/admin/controlnet-assets/batch-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preset_ids: selectedPresetIds,
          asset_types: selectedAssetTypes,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Batch upload failed');
      }

      setResults(data.results);
    } catch (err) {
      setError(String(err));
      logger.error('[AdminControlNetBatchUpload] Upload error', { error: err });
    } finally {
      setIsProcessing(false);
    }
  };

  const summary = {
    total: results.length,
    success: results.filter(r => r.status === 'success').length,
    failed: results.filter(r => r.status === 'failed').length,
    skipped: results.filter(r => r.status === 'skipped').length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">{t('admin.controlNetBatchUpload')}</h2>
          <p className="text-sm text-white/50 mt-1">
            Bulk generate ControlNet resources (OpenPose, Canny, Depth, etc.) for presets
          </p>
        </div>
        
        <Button
          onClick={startBatchUpload}
          disabled={isProcessing || selectedPresetIds.length === 0 || selectedAssetTypes.length === 0}
          className="bg-gradient-to-r from-[#FD5FC2] to-[#8b5cf6] hover:from-[#fd74a8] hover:to-[#a78bfa]"
        >
          {isProcessing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <Upload className="mr-2 h-4 w-4" />
              Start Batch Upload
            </>
          )}
        </Button>
      </div>

      {/* Asset Type Selection */}
      <Card>
        <CardHeader>
          <CardTitle>Select Asset Types</CardTitle>
          <CardDescription>Choose which ControlNet resources to generate</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {['openpose', 'canny', 'depth', 'segmentation', 'ip_adapter'].map((type) => (
              <label
                key={type}
                className={`
                  flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-all
                  ${selectedAssetTypes.includes(type)
                    ? 'border-[#FD5FC2]/60 bg-[#FD5FC2]/10'
                    : 'border-white/10 hover:border-white/25'
                  }
                `}
              >
                <Checkbox
                  checked={selectedAssetTypes.includes(type)}
                  onCheckedChange={() => toggleAssetType(type)}
                  className="accent-[#FD5FC2]"
                />
                <span className="text-sm capitalize">{type}</span>
              </label>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Preset Selection */}
      <Card>
        <CardHeader>
          <CardTitle>Select Presets</CardTitle>
          <CardDescription>
            Choose presets to generate ControlNet resources for ({presets.length} total)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {presets.length === 0 ? (
            <p className="text-sm text-white/50">No presets available</p>
          ) : (
            <div className="max-h-96 overflow-y-auto space-y-2">
              {presets.map((preset) => (
                <label
                  key={preset.id || preset.slug}
                  className={`
                    flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all
                    ${selectedPresetIds.includes(preset.id || '')
                      ? 'border-[#FD5FC2]/60 bg-[#FD5FC2]/10'
                      : 'border-white/10 hover:border-white/25'
                    }
                  `}
                >
                  <Checkbox
                    checked={selectedPresetIds.includes(preset.id || '')}
                    onCheckedChange={() => togglePresetSelection(preset.id || '')}
                    className="mt-1 accent-[#FD5FC2]"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{preset.label_en}</span>
                      <Badge variant="outline" className="text-[9px]">
                        {preset.category}
                      </Badge>
                    </div>
                    <div className="text-xs text-white/40 mt-0.5">Slug: {preset.slug}</div>
                  </div>
                </label>
              ))}
            </div>
          )}
        </CardContent>
        <CardFooter className="text-sm text-white/50">
          Selected: {selectedPresetIds.length} preset(s)
        </CardFooter>
      </Card>

      {/* Results */}
      {results.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Upload Results</CardTitle>
            <CardDescription>
              Status: {summary.success} succeeded, {summary.failed} failed, {summary.skipped} skipped
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {results.map((result, idx) => (
                <div
                  key={idx}
                  className={`
                    flex items-center gap-3 p-3 rounded-lg border
                    ${result.status === 'success' ? 'border-green-500/30 bg-green-500/10' : ''}
                    ${result.status === 'failed' ? 'border-red-500/30 bg-red-500/10' : ''}
                    ${result.status === 'skipped' ? 'border-yellow-500/30 bg-yellow-500/10' : ''}
                  `}
                >
                  {result.status === 'success' && <CheckCircle2 className="h-5 w-5 text-green-500" />}
                  {result.status === 'failed' && <XCircle className="h-5 w-5 text-red-500" />}
                  {result.status === 'skipped' && <AlertTriangle className="h-5 w-5 text-yellow-500" />}
                  
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">
                      Preset: {result.preset_id.substring(0, 8)}...
                    </div>
                    {result.error && (
                      <div className="text-sm text-red-300">{result.error}</div>
                    )}
                    {result.assets && (
                      <div className="text-xs text-white/50 mt-1">
                        Generated: {Object.keys(result.assets).join(', ')}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error Banner */}
      {error && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-4">
          <div className="flex items-center gap-2 text-red-300">
            <AlertTriangle className="h-5 w-5" />
            <span className="font-medium">Error</span>
          </div>
          <p className="text-sm text-red-200 mt-1">{error}</p>
        </div>
      )}
    </div>
  );
}

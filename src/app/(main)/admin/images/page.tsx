'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Loader2, Plus, Trash2, RefreshCw, Sparkles, Check, X, ChevronDown, ChevronUp, SlidersHorizontal, ImageIcon, User, Shirt, Package, Upload, Search } from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';

// ─── Types ───────────────────────────────────────────
interface ImageItem {
  id: string;
  name: string;
  title?: string;
  imageUrl: string | null;
  hasImage: boolean;
  category?: string;
  tier?: string;
  itemCategory: string;
  field: string;
  slug?: string;
  isPublic?: boolean;
  reviewStatus?: string;
  personality?: string;
  appearance?: string;
  appearance_race?: string;
  appearance_hair?: string;
  appearance_hair_color?: string;
  appearance_eyes?: string;
  appearance_body?: string;
  appearance_style?: string;
  character_card?: Record<string, unknown>;
  tags?: string[] | string;
  createdAt?: string;
  // 服装库字段
  description?: string;
  // 道具库字段
  item_type?: string;
  intimacy_boost?: number;
}

interface PromptPreset {
  id: string;
  label: string;
  positivePrompt: string;
  negativePrompt: string;
}

// Per-girlfriend independent generation state
interface GirlfriendGenState {
  // Prompt
  positivePrompt: string;
  negativePrompt: string;
  activePreset: string | null;
  // Metadata
  generatedMeta: any | null;
  editTitle: string;
  editDescription: string;
  editTags: string;
  editAppearance: string;
  // Images
  generatedImages: {url: string; alt: string}[];
  selectedImages: Set<number>;
  genProgress: string;
  // Parameters
  genParams: {
    steps: number;
    cfg: number;
    seed: number;
    width: number;
    height: number;
    sampler: string;
    scheduler: string;
  };
  // Status
  metaGenerating: boolean;
  generating: boolean;
  useConsistency: boolean;
}

const DEFAULT_GEN_STATE: GirlfriendGenState = {
  positivePrompt: '',
  negativePrompt: 'worst quality, low quality, blurry, out of focus, soft focus, motion blur, depth of field, bokeh, deformed, disfigured, mutated, bad anatomy, bad hands, extra fingers, missing fingers, ugly, watermark, signature, text, logo, dark lighting, harsh shadows, oversaturated, undersaturated, grainy, noisy, jpeg artifacts, compression artifacts, lowres, pixelated, plastic skin, waxy skin, looking away, expressionless',
  activePreset: null,
  generatedMeta: null,
  editTitle: '',
  editDescription: '',
  editTags: '',
  editAppearance: '',
  generatedImages: [],
  selectedImages: new Set(),
  genProgress: '',
  genParams: {
    steps: 28,
    cfg: 3.5,
    seed: -1,
    width: 832,
    height: 1216,
    sampler: 'euler',
    scheduler: 'simple',
  },
  metaGenerating: false,
  generating: false,
  useConsistency: true,
};

interface Stats {
  totalGirlfriends: number;
  withPortrait: number;
  totalOutfits: number;
  withPreview: number;
  totalShopItems: number;
  shopItemsWithImage: number;
}

interface LogEntry {
  time: string;
  message: string;
  type: 'info' | 'success' | 'error' | 'progress';
}

// ─── Helpers ─────────────────────────────────────────
function authedFetch(url: string, options?: RequestInit) {
  const token = getSessionToken();
  return fetch(url, {
    ...options,
    headers: {
      ...options?.headers,
      ...(token ? { 'x-session': token } : {}),
      'Content-Type': 'application/json',
    },
  });
}

function getSessionToken(): string | null {
  if (typeof window === 'undefined') return null;
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
      try {
        const data = JSON.parse(localStorage.getItem(key) || '{}');
        return data.access_token || null;
      } catch { /* ignore */ }
    }
  }
  return null;
}

// ─── Main Page ───────────────────────────────────────
export default function AdminImagesPage() {
  const [activeTab, setActiveTab] = useState<'girlfriend' | 'outfit' | 'shop_item'>('girlfriend');
  const [stats, setStats] = useState<Stats | null>(null);
  const [girlfriends, setGirlfriends] = useState<ImageItem[]>([]);
  const [outfits, setOutfits] = useState<ImageItem[]>([]);
  const [shopItems, setShopItems] = useState<ImageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Selection
  const [selectedItem, setSelectedItem] = useState<ImageItem | null>(null);

  // Prompt (global presets only)
  const [presets, setPresets] = useState<PromptPreset[]>([]);

  // Per-girlfriend independent generation state
  const [genStates, setGenStates] = useState<Record<string, GirlfriendGenState>>({});

  // Helper to get state for current selected item
  const currentGenState = useMemo(() => {
    if (!selectedItem) return DEFAULT_GEN_STATE;
    return genStates[selectedItem.id] || DEFAULT_GEN_STATE;
  }, [selectedItem, genStates]);

  // Helper to update state for a specific girlfriend
  const updateGenState = useCallback((id: string, updates: Partial<GirlfriendGenState>) => {
    setGenStates(prev => ({
      ...prev,
      [id]: { ...prev[id] || DEFAULT_GEN_STATE, ...updates },
    }));
  }, []);

  // Batch
  const [batchRunning, setBatchRunning] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logEndRef = useRef<HTMLDivElement>(null);

  // New preset modal
  const [showAddPreset, setShowAddPreset] = useState(false);
  const [newPresetLabel, setNewPresetLabel] = useState('');
  const [newPresetPositive, setNewPresetPositive] = useState('');
  const [newPresetNegative, setNewPresetNegative] = useState('');

  // Collapsible sections
  const [promptExpanded, setPromptExpanded] = useState(true);
  const [logExpanded, setLogExpanded] = useState(true);

  // ─── Filters & Search ─────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'with_image' | 'without_image'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'created_at' | 'updated_at'>('name');

  // ─── Delete confirmation ─────────────────────────
  const [deleteTarget, setDeleteTarget] = useState<ImageItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadTarget, setUploadTarget] = useState<ImageItem | null>(null);
  const [uploading, setUploading] = useState(false);

  // Params expanded
  const [paramsExpanded, setParamsExpanded] = useState(false);

  // Saving
  const [saving, setSaving] = useState(false);

  // ─── Load data ──────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [listRes, presetsRes] = await Promise.all([
        authedFetch('/api/admin/images/list'),
        authedFetch('/api/admin/prompts'),
      ]);

      if (!listRes.ok) throw new Error('Failed to load image list');
      const listData = await listRes.json();
      setGirlfriends(listData.girlfriends || []);
      setOutfits(listData.outfits || []);
      setShopItems(listData.shopItems || []);

      // Compute stats
      setStats({
        totalGirlfriends: listData.girlfriends?.length || 0,
        withPortrait: listData.girlfriends?.filter((g: ImageItem) => g.hasImage).length || 0,
        totalOutfits: listData.outfits?.length || 0,
        withPreview: listData.outfits?.filter((o: ImageItem) => o.hasImage).length || 0,
        totalShopItems: listData.shopItems?.length || 0,
        shopItemsWithImage: listData.shopItems?.filter((s: ImageItem) => s.hasImage).length || 0,
      });

      if (presetsRes.ok) {
        const presetsData = await presetsRes.json();
        setPresets(presetsData.presets || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // ─── Delete item ─────────────────────────────────
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      // Determine the image URL field based on type
      let imageUrlField = '';
      if (deleteTarget.itemCategory === 'girlfriend') {
        imageUrlField = deleteTarget.imageUrl || '';
      } else if (deleteTarget.itemCategory === 'outfit') {
        imageUrlField = deleteTarget.imageUrl || '';
      } else if (deleteTarget.itemCategory === 'shop_item') {
        imageUrlField = deleteTarget.imageUrl || '';
      }

      const res = await authedFetch('/api/admin/images/delete', {
        method: 'POST',
        body: JSON.stringify({
          type: deleteTarget.itemCategory,
          id: deleteTarget.id,
          imageUrl: imageUrlField,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Delete failed');
      }
      addLog('success', `Deleted image for ${deleteTarget.name}`);
      setDeleteTarget(null);
      if (selectedItem?.id === deleteTarget.id) setSelectedItem(null);
      loadData();
    } catch (err) {
      addLog('error', `Delete failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setDeleting(false);
    }
  };

  // ─── Upload image ────────────────────────────────
  const handleUploadClick = (item: ImageItem) => {
    setUploadTarget(item);
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadTarget) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', uploadTarget.itemCategory);
      formData.append('id', uploadTarget.id);
      formData.append('field', uploadTarget.field);

      const token = getSessionToken();
      const res = await fetch('/api/admin/images/upload', {
        method: 'POST',
        headers: token ? { 'x-session': token } : {},
        body: formData,
      });
      const contentType = res.headers.get('content-type');
      if (!res.ok) {
        let errMsg = 'Upload failed';
        if (contentType?.includes('application/json')) {
          const err = await res.json();
          errMsg = err.error || errMsg;
        }
        throw new Error(errMsg);
      }

      addLog('success', `Uploaded image for ${uploadTarget.name}`);
      setUploadTarget(null);
      loadData();
    } catch (err) {
      addLog('error', `Upload failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setUploading(false);
      // Reset file input
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // ─── Get current items with filters ──────────────────────────
  const filteredItems = useMemo(() => {
    const items = activeTab === 'girlfriend' ? girlfriends
      : activeTab === 'outfit' ? outfits : shopItems;
    
    let filtered = items;
    
    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(item => 
        item.name.toLowerCase().includes(query) ||
        item.title?.toLowerCase().includes(query) ||
        (Array.isArray(item.tags) && item.tags.some((tag: string) => tag.toLowerCase().includes(query)))
      );
    }
    
    // Apply status filter
    if (filterStatus === 'with_image') {
      filtered = filtered.filter(item => item.hasImage);
    } else if (filterStatus === 'without_image') {
      filtered = filtered.filter(item => !item.hasImage);
    }
    
    // Apply sort
    return filtered.sort((a, b) => {
      if (sortBy === 'created_at') {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bTime - aTime;
      }
      return a.name.localeCompare(b.name);
    });
  }, [activeTab, girlfriends, outfits, shopItems, searchQuery, filterStatus, sortBy]);

  const currentItems = filteredItems;

  const currentLabel = activeTab === 'girlfriend' ? '女友' : activeTab === 'outfit' ? '服装' : '道具';

  // ─── Apply preset ───────────────────────────────
  const applyPreset = (preset: PromptPreset) => {
    if (!selectedItem) return;
    updateGenState(selectedItem.id, {
      positivePrompt: preset.positivePrompt,
      negativePrompt: preset.negativePrompt,
      activePreset: preset.id,
    });
  };

  // ─── Add/Delete Preset ──────────────────────────
  const addPreset = async () => {
    if (!newPresetLabel || !newPresetPositive) return;
    const res = await authedFetch('/api/admin/prompts', {
      method: 'POST',
      body: JSON.stringify({
        label: newPresetLabel,
        positivePrompt: newPresetPositive,
        negativePrompt: newPresetNegative,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      setPresets((prev) => [...prev, data.preset]);
      setShowAddPreset(false);
      setNewPresetLabel('');
      setNewPresetPositive('');
      setNewPresetNegative('');
    }
  };

  const deletePreset = async (id: string) => {
    const res = await authedFetch(`/api/admin/prompts?id=${id}`, { method: 'DELETE' });
    if (res.ok) {
      setPresets((prev) => prev.filter((p) => p.id !== id));
    }
  };

  // ─── Step 1: Generate Metadata (via LLM) ────────
  // Auto-generate metadata when selecting a card (girlfriend only)
  useEffect(() => {
    if (selectedItem?.itemCategory === 'girlfriend') {
      const state = genStates[selectedItem.id] || DEFAULT_GEN_STATE;
      if (!state.metaGenerating && !state.generatedMeta) {
        const timer = setTimeout(() => generateMetaData(true), 500);
        return () => clearTimeout(timer);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedItem?.id, selectedItem?.itemCategory]);

  const generateMetaData = async (isAuto = false) => {
    if (!selectedItem) return;
    const state = genStates[selectedItem.id] || DEFAULT_GEN_STATE;
    if (state.metaGenerating) return;
    
    updateGenState(selectedItem.id, {
      metaGenerating: true,
      generatedMeta: null,
      generatedImages: [],
      selectedImages: new Set(),
      genProgress: isAuto ? 'Auto-generating metadata from traits...' : 'Generating metadata via AI...',
    });

    try {
      // Build a rich concept from item's own traits — 服装库/道具库使用独立数据，不调用女友库
      let concept = state.positivePrompt;
      let girlfriendData: Record<string, unknown> | null = null;
      let outfitData: Record<string, unknown> | null = null;
      let propData: Record<string, unknown> | null = null;

      if (!concept && selectedItem.itemCategory === 'girlfriend') {
        const traits = [selectedItem.name];
        if (selectedItem.personality) traits.push(`personality: ${selectedItem.personality}`);
        const tagList = Array.isArray(selectedItem.tags) ? selectedItem.tags : (typeof selectedItem.tags === 'string' ? selectedItem.tags.split(',').map(t => t.trim()) : []);
        if (tagList.length) traits.push(`tags: ${tagList.slice(0, 3).join(', ')}`);
        if (selectedItem.appearance) traits.push(`appearance: ${selectedItem.appearance}`);
        concept = traits.join(' | ');
        
        // Pass FULL girlfriend data for personalized metadata generation
        girlfriendData = {
          name: selectedItem.name,
          personality: selectedItem.personality,
          tags: tagList,
          appearance: selectedItem.appearance,
          appearance_race: selectedItem.appearance_race,
          appearance_hair: selectedItem.appearance_hair,
          appearance_hair_color: selectedItem.appearance_hair_color,
          appearance_eyes: selectedItem.appearance_eyes,
          appearance_body: selectedItem.appearance_body,
          appearance_style: selectedItem.appearance_style,
          character_card: selectedItem.character_card,
        };
      } else if (!concept && selectedItem.itemCategory === 'outfit') {
        // 服装库：使用服装自身数据，不引入女友信息
        const traits = [selectedItem.name];
        if (selectedItem.category) traits.push(`category: ${selectedItem.category}`);
        if (selectedItem.tier) traits.push(`tier: ${selectedItem.tier}`);
        if (selectedItem.description) traits.push(`description: ${selectedItem.description}`);
        concept = traits.join(' | ');

        outfitData = {
          name: selectedItem.name,
          description: selectedItem.description,
          category: selectedItem.category,
          tier: selectedItem.tier,
        };
      } else if (!concept && selectedItem.itemCategory === 'shop_item') {
        // 道具库：使用道具自身数据，不引入女友信息
        const traits = [selectedItem.name];
        if (selectedItem.item_type) traits.push(`type: ${selectedItem.item_type}`);
        if (selectedItem.category) traits.push(`category: ${selectedItem.category}`);
        if (selectedItem.description) traits.push(`description: ${selectedItem.description}`);
        concept = traits.join(' | ');

        propData = {
          name: selectedItem.name,
          description: selectedItem.description,
          item_type: selectedItem.item_type,
          category: selectedItem.category,
          intimacy_boost: selectedItem.intimacy_boost,
        };
      }
      concept = concept || selectedItem.name;
      const res = await authedFetch('/api/v2/admin/images/generate-meta', {
        method: 'POST',
        body: JSON.stringify({
          type: selectedItem.itemCategory,
          concept,
          girlfriendData,
          outfitData,
          propData,
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Metadata generation failed (${res.status}): ${err}`);
      }

      const data = await res.json();

      if (data.metadata) {
        updateGenState(selectedItem.id, {
          generatedMeta: data.metadata,
          editTitle: data.metadata.title || selectedItem.name,
          editDescription: data.metadata.description || '',
          editTags: data.metadata.tags?.join(', ') || '',
          editAppearance: data.metadata.appearance || '',
          genProgress: '✅ Metadata generated! Review and edit below, then click "生成图片".',
          metaGenerating: false,
        });
      } else {
        throw new Error('No metadata returned');
      }
    } catch (err) {
      updateGenState(selectedItem.id, {
        genProgress: `❌ Error: ${err instanceof Error ? err.message : 'Unknown'}`,
        metaGenerating: false,
      });
    }
  };

  // ─── Step 2: Generate Images (from confirmed metadata) ────────
  const generateFromMeta = async (deleteExisting = false) => {
    if (!selectedItem) return;
    const state = genStates[selectedItem.id] || DEFAULT_GEN_STATE;
    if (state.generating) return;
    
    updateGenState(selectedItem.id, {
      generating: true,
      generatedImages: [],
      selectedImages: new Set(),
      genProgress: 'Starting generation...',
    });

    try {
      // Start generation (returns immediately with task ID)
      const res = await authedFetch('/api/v2/admin/images/generate-from-meta', {
        method: 'POST',
        body: JSON.stringify({
          type: selectedItem.itemCategory,
          metadata: state.generatedMeta ? {
            title: state.editTitle,
            description: state.editDescription,
            tags: (state.editTags || '').split(',').map((t: string) => t.trim()).filter(Boolean),
            appearance: state.editAppearance,
          } : undefined,
          customPrompt: !state.generatedMeta ? state.positivePrompt : undefined,
          referenceImage: state.useConsistency && selectedItem.imageUrl ? selectedItem.imageUrl : undefined,
          existingId: selectedItem.id,
          existingField: selectedItem.field,
          deleteExisting,
          negativePrompt: state.negativePrompt || undefined,
          count: 4,
          width: state.genParams.width,
          height: state.genParams.height,
          steps: state.genParams.steps,
          cfg: state.genParams.cfg,
          seed: state.genParams.seed,
          sampler: state.genParams.sampler,
          scheduler: state.genParams.scheduler,
          girlfriendId: selectedItem.itemCategory === 'girlfriend' ? selectedItem.id : undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Generation failed (${res.status}): ${err}`);
      }

      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || 'Generation failed');
      }

      // Update with results
      const images = (data.images || []).map((r: { url: string; alt: string }) => ({
        url: r.url,
        alt: r.alt,
      }));
      updateGenState(selectedItem.id, {
        generatedImages: images,
        genProgress: `✅ ${images.length} images generated`,
        generating: false,
      });
    } catch (err) {
      updateGenState(selectedItem.id, {
        genProgress: `❌ Error: ${err instanceof Error ? err.message : 'Unknown'}`,
        generating: false,
      });
    }
  };

  // ─── Manual mode: optimize prompt + generate ───
  const generateFromCustomPrompt = () => {
    if (!selectedItem) return;
    updateGenState(selectedItem.id, { generatedMeta: null }); // skip metadata step
    generateFromMeta(false);
  };

  // ─── Regenerate (delete old + generate new) ────
  const handleRegenerate = () => {
    if (!selectedItem) return;
    const state = genStates[selectedItem.id] || DEFAULT_GEN_STATE;
    if (state.generatedMeta) {
      generateFromMeta(true);
    } else {
      // No metadata yet — generate metadata first if concept, else manual
      if (state.positivePrompt) {
        generateFromCustomPrompt();
      } else {
        generateMetaData();
      }
    }
  };

  // ─── Confirm selected image ─────────────────────
  const confirmImage = async () => {
    if (!selectedItem) return;
    const state = genStates[selectedItem.id] || DEFAULT_GEN_STATE;
    if (state.selectedImages.size === 0) return;
    setSaving(true);

    const idx = Array.from(state.selectedImages)[0];
    const selectedImg = state.generatedImages[idx];
    const imageUrl = selectedImg?.url || '';
    if (!imageUrl) { setSaving(false); return; }

    try {
      // Build update payload
      const updatePayload: Record<string, unknown> = {
        type: selectedItem.itemCategory,
        id: selectedItem.id,
        imageUrl,
        field: selectedItem.field,
      };

      // Include metadata if available and edited
      if (state.generatedMeta) {
        updatePayload.title = state.editTitle || selectedItem.name;
        updatePayload.description = state.editDescription || '';
        updatePayload.tags = (state.editTags || '').split(',').map((t: string) => t.trim()).filter(Boolean);
      }

      const res = await authedFetch('/api/admin/images/update', {
        method: 'POST',
        body: JSON.stringify(updatePayload),
      });

      if (!res.ok) throw new Error('Failed to save');

      addLog('success', `✅ ${selectedItem.name || selectedItem.id} image updated`);
      updateGenState(selectedItem.id, {
        generatedImages: [],
        selectedImages: new Set(),
        generatedMeta: null,
      });
      // Refresh list
      loadData();
      // Update selected item
      setSelectedItem((prev) => prev ? { ...prev, imageUrl, hasImage: true } : prev);
    } catch (err) {
      addLog('error', `❌ Failed to save: ${err instanceof Error ? err.message : 'Unknown'}`);
    } finally {
      setSaving(false);
    }
  };

  // ─── Batch generate all ─────────────────────────
  const batchGenerate = async () => {
    if (batchRunning) return;
    setBatchRunning(true);
    setLogs([]);

    addLog('info', '🔄 Scanning for missing images...');

    try {
      // Use default params for batch (or could aggregate from all girlfriends)
      const defaultParams = DEFAULT_GEN_STATE.genParams;
      const res = await authedFetch('/api/v2/runpod/batch', {
        method: 'POST',
        body: JSON.stringify({ params: defaultParams }),
      });
      if (!res.ok) throw new Error(`Batch failed (${res.status})`);

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response stream');

      const decoder = new TextDecoder();
      let buffer = '';
      let currentEvent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));

              if (currentEvent === 'log') {
                if (data.type === 'info') addLog('info', data.message);
                else if (data.type === 'success') addLog('success', data.message);
                else if (data.type === 'error') addLog('error', `❌ ${data.message}`);
                else if (data.type === 'progress') addLog('progress', data.message);
                else if (data.type === 'done') addLog('success', data.message);
                else addLog('info', data.message);
              } else if (currentEvent === 'error') {
                addLog('error', `❌ ${data.error || data.message || 'Unknown error'}`);
              } else if (currentEvent === 'done') {
                addLog('success', `🎉 All done! ${data.completed} succeeded, ${data.failed} failed.`);
              } else if (currentEvent === 'complete') {
                addLog('success', `✅ ${data.name || data.id} generated`);
              }
            } catch { /* ignore */ }
          }
        }
      }

      // Refresh data after batch completes
      loadData();
    } catch (err) {
      addLog('error', `❌ Batch error: ${err instanceof Error ? err.message : 'Unknown'}`);
    } finally {
      setBatchRunning(false);
    }
  };

  // ─── Regenerate single item ─────────────────────
  const regenerateItem = async (item: ImageItem) => {
    setSelectedItem(item);
    updateGenState(item.id, {
      positivePrompt: '',
      negativePrompt: DEFAULT_GEN_STATE.negativePrompt,
      generatedImages: [],
      selectedImages: new Set(),
      generatedMeta: null,
      activePreset: null,
    });

    // Auto-generate metadata first
    setTimeout(() => generateMetaData(), 300);
  };

  // ─── Replace image ──────────────────────────────
  const replaceImage = (item: ImageItem) => {
    setSelectedItem(item);
    updateGenState(item.id, {
      positivePrompt: '',
      negativePrompt: DEFAULT_GEN_STATE.negativePrompt,
      generatedImages: [],
      selectedImages: new Set(),
      generatedMeta: null,
      activePreset: null,
    });

    // Scroll to generation panel
    setTimeout(() => {
      document.getElementById('gen-panel')?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  // ─── Log helper ─────────────────────────────────
  const addLog = (type: LogEntry['type'], message: string) => {
    setLogs((prev) => [...prev, { time: new Date().toLocaleTimeString(), message, type }]);
  };

  // ─── Toggle image selection ─────────────────────
  const toggleSelect = (idx: number) => {
    if (!selectedItem) return;
    const state = genStates[selectedItem.id] || DEFAULT_GEN_STATE;
    const next = new Set(state.selectedImages);
    if (next.has(idx)) next.delete(idx);
    else next.add(idx);
    updateGenState(selectedItem.id, { selectedImages: next });
  };

  // ─── Render ─────────────────────────────────────
  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#2563EB]" />
        <span className="ml-3 text-gray-500">Loading image resources...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="rounded-lg bg-red-50 p-6 text-center">
          <p className="text-red-600 font-medium">Failed to load</p>
          <p className="mt-1 text-sm text-red-500">{error}</p>
          <button onClick={loadData} className="mt-3 rounded-md bg-[#2563EB] px-4 py-2 text-sm text-white hover:bg-blue-700">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F7FA] p-6" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* ─── Header ──────────────────────────────── */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1E293B]">图片资源管理</h1>
          <p className="mt-1 text-sm text-[#64748B]">管理全站女友肖像、服装预览和道具图片</p>
        </div>
        <button
          onClick={batchGenerate}
          disabled={batchRunning}
          className="flex items-center gap-2 rounded-lg bg-[#2563EB] px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {batchRunning ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> 生成中...</>
          ) : (
            <><Sparkles className="h-4 w-4" /> 一键生成全站</>
          )}
        </button>
      </div>

      {/* ─── Stats Cards ──────────────────────────── */}
      <div className="mb-6 grid grid-cols-4 gap-4">
        <StatCard
          icon={<User className="h-5 w-5" />}
          label="女友总数"
          value={stats?.totalGirlfriends ?? 0}
          sub={`已生成 ${stats?.withPortrait ?? 0} 张肖像`}
          color="blue"
        />
        <StatCard
          icon={<Shirt className="h-5 w-5" />}
          label="服装总数"
          value={stats?.totalOutfits ?? 0}
          sub={`已生成 ${stats?.withPreview ?? 0} 张预览`}
          color="emerald"
        />
        <StatCard
          icon={<Package className="h-5 w-5" />}
          label="道具总数"
          value={stats?.totalShopItems ?? 0}
          sub={`已生成 ${stats?.shopItemsWithImage ?? 0} 张图片`}
          color="amber"
        />
        <StatCard
          icon={<ImageIcon className="h-5 w-5" />}
          label="待生成"
          value={(stats?.totalGirlfriends ?? 0) - (stats?.withPortrait ?? 0) +
                   (stats?.totalOutfits ?? 0) - (stats?.withPreview ?? 0) +
                   (stats?.totalShopItems ?? 0) - (stats?.shopItemsWithImage ?? 0)}
          sub="需要生成图片的资源"
          color="rose"
        />
      </div>

      {/* ─── Generation Parameters (standalone) ── */}
      <div className="rounded-xl bg-white shadow-sm border border-gray-100">
        <button
          onClick={() => setParamsExpanded(!paramsExpanded)}
          className="flex w-full items-center justify-between px-5 py-3.5 text-sm font-medium text-[#1E293B] hover:bg-gray-50/50"
        >
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-[#64748B]" />
            <span>生成参数控制{selectedItem ? ` — ${selectedItem.name}` : ''}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#64748B]">
              {currentGenState.genParams.steps}步 · CFG {currentGenState.genParams.cfg} · {currentGenState.genParams.width}×{currentGenState.genParams.height}
            </span>
            {paramsExpanded ? <ChevronUp className="h-4 w-4 text-[#64748B]" /> : <ChevronDown className="h-4 w-4 text-[#64748B]" />}
          </div>
        </button>
        {paramsExpanded && (
          <div className="border-t border-gray-100 px-5 pb-5 pt-4">
            <div className="grid grid-cols-5 gap-4">
              {/* Steps */}
              <div>
                <label className="flex items-center justify-between text-xs text-[#64748B] mb-1">
                  <span>Steps</span>
                  <span className="font-mono font-semibold text-[#1E293B]">{currentGenState.genParams.steps}</span>
                </label>
                <input type="range" min={10} max={50} step={1} value={currentGenState.genParams.steps}
                  onChange={(e) => selectedItem && updateGenState(selectedItem.id, { genParams: { ...currentGenState.genParams, steps: Number(e.target.value) } })}
                  className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-gray-200 accent-[#2563EB]" />
              </div>
              {/* CFG */}
              <div>
                <label className="flex items-center justify-between text-xs text-[#64748B] mb-1">
                  <span>CFG</span>
                  <span className="font-mono font-semibold text-[#1E293B]">{currentGenState.genParams.cfg}</span>
                </label>
                <input type="range" min={1.5} max={7} step={0.5} value={currentGenState.genParams.cfg}
                  onChange={(e) => selectedItem && updateGenState(selectedItem.id, { genParams: { ...currentGenState.genParams, cfg: Number(e.target.value) } })}
                  className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-gray-200 accent-[#2563EB]" />
              </div>
              {/* Seed */}
              <div>
                <label className="text-xs text-[#64748B] mb-1 block">Seed（-1 随机）</label>
                <input type="number" value={currentGenState.genParams.seed}
                  onChange={(e) => selectedItem && updateGenState(selectedItem.id, { genParams: { ...currentGenState.genParams, seed: Number(e.target.value) } })}
                  className="w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-[#1E293B] focus:outline-none focus:ring-1 focus:ring-[#2563EB]" />
              </div>
              {/* Size */}
              <div>
                <label className="text-xs text-[#64748B] mb-1 block">尺寸</label>
                <select value={`${currentGenState.genParams.width}x${currentGenState.genParams.height}`}
                  onChange={(e) => { const [w, h] = e.target.value.split('x').map(Number); selectedItem && updateGenState(selectedItem.id, { genParams: { ...currentGenState.genParams, width: w, height: h } }); }}
                  className="w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-[#1E293B] focus:outline-none focus:ring-1 focus:ring-[#2563EB]">
                  <option value="512x768">竖版 512×768</option>
                  <option value="768x1024">竖版 768×1024</option>
                  <option value="1024x1280">竖版 1024×1280</option>
                  <option value="1024x1024">方形 1024×1024</option>
                  <option value="1024x768">横版 1024×768</option>
                  <option value="768x512">横版 768×512</option>
                </select>
              </div>
              {/* Sampler */}
              <div>
                <label className="text-xs text-[#64748B] mb-1 block">Sampler / Scheduler</label>
                <div className="flex gap-1.5">
                  <select value={currentGenState.genParams.sampler}
                    onChange={(e) => selectedItem && updateGenState(selectedItem.id, { genParams: { ...currentGenState.genParams, sampler: e.target.value } })}
                    className="flex-1 rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-[#1E293B] focus:outline-none focus:ring-1 focus:ring-[#2563EB]">
                    <option value="dpmpp_2m">DPM++ 2M</option>
                    <option value="dpmpp_3m">DPM++ 3M</option>
                    <option value="euler">Euler</option>
                    <option value="euler_ancestral">Euler Anc.</option>
                    <option value="dpmpp_sde">DPM++ SDE</option>
                    <option value="ddim">DDIM</option>
                  </select>
                  <select value={currentGenState.genParams.scheduler}
                    onChange={(e) => selectedItem && updateGenState(selectedItem.id, { genParams: { ...currentGenState.genParams, scheduler: e.target.value } })}
                    className="flex-1 rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-[#1E293B] focus:outline-none focus:ring-1 focus:ring-[#2563EB]">
                    <option value="karras">Karras</option>
                    <option value="normal">Normal</option>
                    <option value="exponential">Exp.</option>
                    <option value="sgm_uniform">SGM Uni.</option>
                    <option value="simple">Simple</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ─── Main Content ────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* ─── Left: Resource Library ──────────────── */}
        <div className="xl:col-span-2">
          <div className="rounded-xl bg-white shadow-sm border border-gray-100">
            {/* Tabs */}
            <div className="flex border-b border-gray-100">
              {[
                { key: 'girlfriend' as const, label: '女友库', count: girlfriends.length, icon: <User className="h-4 w-4" /> },
                { key: 'outfit' as const, label: '服装库', count: outfits.length, icon: <Shirt className="h-4 w-4" /> },
                { key: 'shop_item' as const, label: '道具库', count: shopItems.length, icon: <Package className="h-4 w-4" /> },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => { setActiveTab(tab.key); setSelectedItem(null); }}
                  className={`flex items-center gap-2 px-5 py-3.5 text-sm font-medium transition-colors ${
                    activeTab === tab.key
                      ? 'border-b-2 border-[#2563EB] text-[#2563EB]'
                      : 'text-[#64748B] hover:text-[#1E293B] border-b-2 border-transparent'
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                  <span className="ml-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">{tab.count}</span>
                </button>
              ))}
              <div className="ml-auto flex items-center pr-2">
                <button
                  onClick={loadData}
                  className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs text-[#64748B] hover:bg-gray-100 hover:text-[#1E293B] transition-colors"
                  title="刷新列表"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>刷新</span>
                </button>
              </div>
            </div>

            {/* Filters & Search */}
            <div className="flex items-center gap-3 border-b border-gray-100 px-4 py-3">
              {/* Search */}
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder={`搜索${currentLabel}...`}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-10 pr-4 text-sm focus:border-[#2563EB] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
                />
              </div>

              {/* Status Filter */}
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as 'all' | 'with_image' | 'without_image')}
                className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:border-[#2563EB] focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
              >
                <option value="all">全部</option>
                <option value="with_image">有图片</option>
                <option value="without_image">无图片</option>
              </select>

              {/* Sort */}
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'name' | 'created_at')}
                className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:border-[#2563EB] focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
              >
                <option value="name">按名称</option>
                <option value="created_at">按创建时间</option>
              </select>

              {/* Count */}
              <div className="ml-auto text-sm text-gray-500">
                显示 {currentItems.length} / {activeTab === 'girlfriend' ? girlfriends.length : activeTab === 'outfit' ? outfits.length : shopItems.length}
              </div>
            </div>

            {/* Grid */}
            <div className="p-4">
              {currentItems.length === 0 ? (
                <div className="flex h-32 items-center justify-center text-sm text-[#64748B]">
                  暂无 {currentLabel}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                  {currentItems.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setSelectedItem(item)}
                      className={`group relative overflow-hidden rounded-lg border-2 transition-all ${
                        selectedItem?.id === item.id
                          ? 'border-[#2563EB] ring-2 ring-blue-200'
                          : 'border-gray-100 hover:border-gray-300'
                      }`}
                    >
                      {/* Image or placeholder */}
                      <div className="aspect-[3/4] w-full bg-gray-50">
                        {item.hasImage && item.imageUrl ? (
                          <img
                            src={item.imageUrl}
                            alt={item.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center">
                            <div className="text-center">
                              <ImageIcon className="mx-auto h-8 w-8 text-gray-300" />
                              <span className="mt-1 block text-xs text-gray-400">No image</span>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Overlay status badge */}
                      <div className={`absolute right-1.5 top-1.5 flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        item.hasImage
                          ? 'bg-green-100 text-green-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}>
                        {item.hasImage ? <Check className="h-2.5 w-2.5" /> : <RefreshCw className="h-2.5 w-2.5" />}
                      </div>

                      {/* Action buttons - always visible */}
                      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between px-3 pb-2">
                        {/* Delete button */}
                        <div
                          onClick={(e) => { e.stopPropagation(); setDeleteTarget(item); }}
                          className="flex h-8 w-8 items-center justify-center rounded-lg bg-white shadow-md text-red-500 transition-all hover:bg-red-500 hover:text-white hover:scale-105 cursor-pointer"
                          title="删除"
                        >
                          <Trash2 className="h-4 w-4" />
                        </div>

                        {/* Upload button */}
                        <div
                          onClick={(e) => { e.stopPropagation(); handleUploadClick(item); }}
                          className="flex h-8 w-8 items-center justify-center rounded-lg bg-white shadow-md text-[#2563EB] transition-all hover:bg-[#2563EB] hover:text-white hover:scale-105 cursor-pointer"
                          title="上传图片"
                        >
                          <Upload className="h-4 w-4" />
                        </div>

                        {/* Select indicator */}
                        {selectedItem?.id === item.id && (
                          <div className="absolute inset-0 rounded-lg ring-2 ring-[#2563EB] ring-offset-1 pointer-events-none" />
                        )}

                        {/* Generation status indicator */}
                        {(genStates[item.id]?.generating || genStates[item.id]?.metaGenerating) && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-lg">
                            <Loader2 className="h-5 w-5 text-white animate-spin" />
                          </div>
                        )}
                        {genStates[item.id]?.generatedImages.length > 0 && !genStates[item.id]?.generating && (
                          <div className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#10B981]">
                            <Check className="h-2.5 w-2.5 text-white" />
                          </div>
                        )}
                      </div>

                      {/* Name */}
                      <div className="px-2 py-1.5 text-left">
                        <p className="truncate text-xs font-medium text-[#1E293B]">{item.name}</p>
                        {item.category && (
                          <p className="truncate text-[10px] text-[#64748B]">{item.category}</p>
                        )}
                        {genStates[item.id]?.generating && (
                          <p className="truncate text-[10px] text-[#2563EB] font-medium">生成中...</p>
                        )}
                        {genStates[item.id]?.genProgress && !genStates[item.id]?.generating && (
                          <p className="truncate text-[10px] text-[#64748B]">{genStates[item.id].genProgress.slice(0, 30)}</p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ─── Right: Detail + Generation Panel ──── */}
        <div className="space-y-4">
          {selectedItem ? (
            <>
              {/* Item Detail */}
              <div className="rounded-xl bg-white shadow-sm border border-gray-100 p-4" id="gen-panel">
                <div className="mb-3 flex items-center gap-3">
                  <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg bg-gray-50">
                    {selectedItem.imageUrl ? (
                      <img src={selectedItem.imageUrl} alt={selectedItem.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <ImageIcon className="h-5 w-5 text-gray-300" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-[#1E293B] truncate">{selectedItem.name}</h3>
                    <p className="text-xs text-[#64748B]">
                      {currentLabel} · {selectedItem.hasImage ? '已生成' : '待生成'}
                      {selectedItem.category && ` · ${selectedItem.category}`}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => regenerateItem(selectedItem)}
                      className="rounded-md bg-gray-100 p-2 text-gray-500 hover:bg-gray-200"
                      title="重新生成"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Prompt Editor */}
              <div className="rounded-xl bg-white shadow-sm border border-gray-100">
                <button
                  onClick={() => setPromptExpanded(!promptExpanded)}
                  className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-[#1E293B]"
                >
                  提示词编辑
                  {promptExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>

                {promptExpanded && (
                  <div className="border-t border-gray-100 px-4 pb-4 pt-3 space-y-3">
                    {/* Presets */}
                    <div>
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className="text-xs font-medium text-[#64748B]">提示词预设</span>
                        <button
                          onClick={() => setShowAddPreset(true)}
                          className="flex items-center gap-1 text-xs text-[#2563EB] hover:text-blue-700"
                        >
                          <Plus className="h-3 w-3" /> 添加
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {presets.map((p) => (
                          <div key={p.id} className="group relative">
                            <button
                              onClick={() => applyPreset(p)}
                              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                                currentGenState.activePreset === p.id
                                  ? 'bg-[#2563EB] text-white'
                                  : 'bg-gray-100 text-[#64748B] hover:bg-gray-200'
                              }`}
                            >
                              {p.label}
                            </button>
                            <button
                              onClick={() => deletePreset(p.id)}
                              className="absolute -right-1.5 -top-1.5 hidden h-4 w-4 items-center justify-center rounded-full bg-red-500 text-white group-hover:flex"
                            >
                              <X className="h-2.5 w-2.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Positive */}
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[#64748B]">正面提示词</label>
                      <textarea
                        value={currentGenState.positivePrompt}
                        onChange={(e) => selectedItem && updateGenState(selectedItem.id, { positivePrompt: e.target.value, activePreset: null })}
                        placeholder="Describe the image you want to generate..."
                        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-[#1E293B] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30 resize-y min-h-[60px]"
                        rows={3}
                      />
                    </div>

                    {/* Negative */}
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[#64748B]">负面提示词</label>
                      <textarea
                        value={currentGenState.negativePrompt}
                        onChange={(e) => selectedItem && updateGenState(selectedItem.id, { negativePrompt: e.target.value })}
                        placeholder="Things to avoid..."
                        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-[#1E293B] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30 resize-y min-h-[40px]"
                        rows={2}
                      />
                    </div>

                    {/* Consistency toggle */}
                    {selectedItem?.hasImage && (
                      <label className="flex items-center gap-2 rounded-lg bg-[#F8FAFC] border border-gray-100 px-3 py-2">
                        <input
                          type="checkbox"
                          checked={currentGenState.useConsistency}
                          onChange={(e) => selectedItem && updateGenState(selectedItem.id, { useConsistency: e.target.checked })}
                          className="h-4 w-4 rounded border-gray-300 text-[#2563EB] focus:ring-[#2563EB]"
                        />
                        <div className="flex-1">
                          <span className="text-sm font-medium text-[#1E293B]">保持人物一致性</span>
                          <p className="text-xs text-[#64748B]">以当前图片为参考，生成同一人物的不同形象</p>
                        </div>
                      </label>
                    )}

                    {/* Generate buttons row */}
                    <div className="flex gap-2">
                      {/* Step 1: Generate Metadata (only if no metadata yet) */}
                      {!currentGenState.generatedMeta && (
                        <button
                          onClick={() => generateMetaData()}
                          disabled={currentGenState.metaGenerating || !currentGenState.positivePrompt}
                          className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-[#2563EB] bg-white px-4 py-2.5 text-sm font-medium text-[#2563EB] hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {currentGenState.metaGenerating ? (
                            <><Loader2 className="h-4 w-4 animate-spin" /> 生成元数据中...</>
                          ) : (
                            <><Sparkles className="h-4 w-4" /> 生成元数据</>
                          )}
                        </button>
                      )}

                      {/* Step 2: Generate Images */}
                      <button
                        onClick={() => generateFromMeta(false)}
                        disabled={currentGenState.generating || (!currentGenState.generatedMeta && !currentGenState.positivePrompt)}
                        className={`flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50 ${
                          currentGenState.generatedMeta
                            ? 'flex-1 bg-[#2563EB] hover:bg-blue-700'
                            : 'flex-1 bg-[#10B981] hover:bg-emerald-600'
                        }`}
                      >
                        {currentGenState.generating ? (
                          <><Loader2 className="h-4 w-4 animate-spin" /> 生成中...</>
                        ) : currentGenState.generatedMeta ? (
                          <><Sparkles className="h-4 w-4" /> 生成图片</>
                        ) : (
                          <><Sparkles className="h-4 w-4" /> 优化并生成</>
                        )}
                      </button>
                    </div>

                    {currentGenState.genProgress && (
                      <p className="text-xs text-[#64748B]">{currentGenState.genProgress}</p>
                    )}
                  </div>
                )}
              </div>

              {/* Generated Results */}
              {currentGenState.generatedImages.length > 0 && (
                <div className="rounded-xl bg-white shadow-sm border border-gray-100 p-4">
                  <h4 className="mb-3 text-sm font-semibold text-[#1E293B]">生成预览</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {currentGenState.generatedImages.map((img, idx) => (
                      <button
                        key={idx}
                        onClick={() => toggleSelect(idx)}
                        className={`relative overflow-hidden rounded-lg border-2 transition-all ${
                          currentGenState.selectedImages.has(idx)
                            ? 'border-[#2563EB] ring-2 ring-blue-200'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <img src={img.url} alt={img.alt || `Generated ${idx + 1}`} className="aspect-[3/4] w-full object-cover" />
                        {currentGenState.selectedImages.has(idx) && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                            <Check className="h-8 w-8 text-white drop-shadow-lg" />
                          </div>
                        )}
                      </button>
                    ))}
                  </div>

                  {/* ✏️ Metadata Editor (shown after Step 1) */}
                  {currentGenState.generatedMeta && (
                    <div className="mt-3 space-y-2 rounded-lg bg-[#F8FAFC] border border-gray-100 p-3">
                      <div className="flex items-center justify-between">
                        <h5 className="text-xs font-semibold text-[#64748B] uppercase tracking-wider">生成描述信息（可编辑）</h5>
                        <button
                          onClick={() => generateMetaData()}
                          disabled={currentGenState.metaGenerating}
                          className="flex items-center gap-1 text-xs text-[#2563EB] hover:text-blue-700"
                        >
                          <RefreshCw className={`h-3 w-3 ${currentGenState.metaGenerating ? 'animate-spin' : ''}`} />
                          重新生成
                        </button>
                      </div>
                      <div>
                        <label className="block text-xs text-[#64748B] mb-1">标题/名称</label>
                        <input
                          type="text"
                          value={currentGenState.editTitle}
                          onChange={(e) => selectedItem && updateGenState(selectedItem.id, { editTitle: e.target.value })}
                          className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-sm text-[#1E293B] bg-white focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-[#64748B] mb-1">描述/简介</label>
                        <textarea
                          value={currentGenState.editDescription}
                          onChange={(e) => selectedItem && updateGenState(selectedItem.id, { editDescription: e.target.value })}
                          rows={2}
                          className="w-full resize-y rounded-md border border-gray-200 px-3 py-1.5 text-sm text-[#1E293B] bg-white focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-[#64748B] mb-1">标签（逗号分隔）</label>
                        <input
                          type="text"
                          value={currentGenState.editTags}
                          onChange={(e) => selectedItem && updateGenState(selectedItem.id, { editTags: e.target.value })}
                          placeholder="e.g. cute, blonde, casual"
                          className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-sm text-[#1E293B] bg-white focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-[#64748B] mb-1">外观描述（用于生成图片的提示词）</label>
                        <textarea
                          value={currentGenState.editAppearance}
                          onChange={(e) => selectedItem && updateGenState(selectedItem.id, { editAppearance: e.target.value })}
                          rows={2}
                          className="w-full resize-y rounded-md border border-gray-200 px-3 py-1.5 text-sm text-[#1E293B] bg-white focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
                          placeholder="Visual description for image generation — will be auto-optimized"
                        />
                      </div>
                    </div>
                  )}

                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={confirmImage}
                      disabled={currentGenState.selectedImages.size === 0 || saving}
                      className="flex-1 rounded-lg bg-[#10B981] px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {saving ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : '✓ 确认选用'}
                    </button>
                    <button
                      onClick={() => generateFromMeta(true)}
                      disabled={currentGenState.generating}
                      className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-[#64748B] hover:bg-gray-200"
                    >
                      <RefreshCw className={`h-4 w-4 ${currentGenState.generating ? 'animate-spin' : ''}`} />
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex h-48 items-center justify-center rounded-xl bg-white shadow-sm border border-gray-100">
              <div className="text-center text-sm text-[#64748B]">
                <ImageIcon className="mx-auto mb-2 h-8 w-8 text-gray-300" />
                <p>选择一个资源开始管理</p>
              </div>
            </div>
          )}

          {/* ─── Generation Log ──────────────────── */}
          {logs.length > 0 && (
            <div className="rounded-xl bg-white shadow-sm border border-gray-100">
              <button
                onClick={() => setLogExpanded(!logExpanded)}
                className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-[#1E293B]"
              >
                生成日志
                {logExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>

              {logExpanded && (
                <div className="max-h-48 overflow-y-auto border-t border-gray-100 px-4 py-2">
                  {logs.map((log, idx) => (
                    <div key={idx} className="py-1 text-xs">
                      <span className="text-[#94A3B8]">[{log.time}]</span>{' '}
                      <span className={
                        log.type === 'success' ? 'text-[#10B981]'
                        : log.type === 'error' ? 'text-[#EF4444]'
                        : log.type === 'progress' ? 'text-[#2563EB]'
                        : 'text-[#64748B]'
                      }>{log.message}</span>
                    </div>
                  ))}
                  <div ref={logEndRef} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ─── Add Preset Modal ───────────────────── */}
      {showAddPreset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-lg">
            <h3 className="mb-4 text-lg font-semibold text-[#1E293B]">添加提示词预设</h3>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-[#64748B]">名称</label>
                <input
                  value={newPresetLabel}
                  onChange={(e) => setNewPresetLabel(e.target.value)}
                  placeholder="例如: 赛博朋克"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[#64748B]">正面提示词</label>
                <textarea
                  value={newPresetPositive}
                  onChange={(e) => setNewPresetPositive(e.target.value)}
                  placeholder="Describe the image style..."
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30 resize-y"
                  rows={3}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[#64748B]">负面提示词</label>
                <textarea
                  value={newPresetNegative}
                  onChange={(e) => setNewPresetNegative(e.target.value)}
                  placeholder="Things to avoid..."
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30 resize-y"
                  rows={2}
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setShowAddPreset(false)}
                className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-[#64748B] hover:bg-gray-200"
              >
                取消
              </button>
              <button
                onClick={addPreset}
                disabled={!newPresetLabel || !newPresetPositive}
                className="rounded-lg bg-[#2563EB] px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                添加
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Hidden file input for upload ───────────── */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={handleFileSelected}
      />

      {/* ─── Delete Confirmation Dialog ─────────────── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => {
        if (!open && !deleting) setDeleteTarget(null);
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除 <strong>{deleteTarget?.name}</strong> 吗？此操作不可撤销。
              {deleteTarget?.hasImage && ' 对应的图片也会被删除。'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="inline-flex items-center justify-center rounded-md bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {deleting ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> 删除中...</> : '确认删除'}
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── StatCard Component ──────────────────────────────
function StatCard({
  icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  sub: string;
  color: 'blue' | 'emerald' | 'amber' | 'rose';
}) {
  const colorMap = {
    blue: 'text-[#2563EB] bg-blue-50',
    emerald: 'text-[#10B981] bg-emerald-50',
    amber: 'text-[#F59E0B] bg-amber-50',
    rose: 'text-[#EF4444] bg-red-50',
  };

  return (
    <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${colorMap[color]}`}>
          {icon}
        </div>
        <div>
          <p className="text-xs text-[#64748B]">{label}</p>
          <p className="text-2xl font-bold text-[#1E293B]">{value}</p>
        </div>
      </div>
      <p className="mt-1 text-[11px] text-[#94A3B8]">{sub}</p>
    </div>
  );
}
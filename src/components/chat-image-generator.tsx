'use client';

import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Loader2, Wand2, Upload, X } from 'lucide-react';

interface ChatImageGeneratorProps {
  girlfriendId: string;
  onImageGenerated?: (imageUrl: string) => void;
}

interface GeneratedJob {
  jobId: string;
  endpoint_id?: string;
  index: number;
}

export function ChatImageGenerator({ girlfriendId, onImageGenerated }: ChatImageGeneratorProps) {
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [pendingJobs, setPendingJobs] = useState<GeneratedJob[]>([]);
  const pollingRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [contextType, setContextType] = useState<'outfit' | 'pose' | 'scene' | 'portrait'>('portrait');
  const [imageCount, setImageCount] = useState(1);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Poll job status
  const pollJobStatus = useCallback(async (jobId: string, endpointId?: string) => {
    try {
      const url = endpointId 
        ? `${endpointId}/status/${jobId}`
        : `/api/ai/status?job_id=${jobId}`;
      
      const response = await fetch(url);
      const data = await response.json();

      if (data.status === 'success' || data.images?.length > 0) {
        // Job completed - handle success in parent component
        console.log('Job completed:', data);
      } else if (data.status !== 'pending') {
        throw new Error(data.error || 'Unknown error');
      }
    } catch (error) {
      console.error('Polling failed:', error);
    }
  }, []);

  // Handle image generation request
  const handleGenerate = async () => {
    if (!prompt.trim()) {
      console.log('Please enter prompt');
      return;
    }

    setIsGenerating(true);
    setProgress(0);

    try {
      const response = await fetch('/api/chat/generate-image-from-context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          girlfriend_id: girlfriendId,
          message: prompt,
          context_type: contextType,
          count: imageCount,
        }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Generation failed');
      }

      // Handle pending jobs
      if (result.pending_jobs && result.pending_jobs.length > 0) {
        setPendingJobs(
          result.pending_jobs.map((job: GeneratedJob, idx: number) => ({
            ...job,
            index: idx + progress,
          }))
        );

        // Start polling for each job
        result.pending_jobs.forEach((job: GeneratedJob) => {
          const interval = setInterval(() => pollJobStatus(job.jobId, job.endpoint_id), 3000);
          pollingRef.current.set(job.jobId, interval);
        });
        
        console.log('Image jobs queued:', result.pending_jobs.length);
      } else if (result.images && result.images.length > 0) {
        // Immediate completion
        console.log(`Generated ${result.images.length} images`);
        
        onImageGenerated?.(result.images[0]);
        
        // Set progress to 100% for immediate results
        setProgress(100);
        setTimeout(() => {
          setIsGenerating(false);
          setProgress(0);
        }, 2000);
      }

    } catch (error) {
      console.error('Generation error:', error);
      setIsGenerating(false);
    }
  };

  // Handle file selection
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Simple validation
    if (!file.type.startsWith('image/')) {
      console.log('Please upload image file');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      setSelectedImage(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Clear selected image
  const clearSelectedImage = () => {
    setSelectedImage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Get context type label
  const getContextLabel = (type: string) => {
    const labels: Record<string, string> = {
      outfit: '换装',
      pose: '换姿势',
      scene: '换场景',
      portrait: '重新生成',
    };
    return labels[type] || type;
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="text-lg">✨ 智能图生图</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
      {/* Context Type Selector */}
      <div className="space-y-2">
        <label className="text-sm font-medium">上下文类型</label>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {(['portrait', 'outfit', 'pose', 'scene'] as const).map((type) => (
            <button
              key={type}
              onClick={() => setContextType(type)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                contextType === type
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary hover:bg-secondary/80'
              }`}
            >
              {getContextLabel(type)}
            </button>
          ))}
        </div>
      </div>

      {/* Prompt Input */}
      <div className="space-y-2">
        <label className="text-sm font-medium">生成提示词</label>
        <div className="flex gap-2">
          <Input
            placeholder="描述你想让女友穿什么、做什么..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={isGenerating}
            className="flex-1"
          />
          <Button
            onClick={handleGenerate}
            disabled={isGenerating || !prompt.trim()}
            size="icon"
            className="shrink-0"
          >
            {isGenerating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Wand2 className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Progress Bar */}
      {isGenerating && (
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>正在生成...</span>
            <span>{progress}%</span>
          </div>
          <div className="h-2 bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          {pendingJobs.length > 0 && (
            <div className="text-xs text-muted-foreground">
              待处理任务：{pendingJobs.length} 个
              {pendingJobs.map((job, i) => (
                <div key={job.jobId} className="mt-1">
                  <span className="inline-flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    任务 {i + 1}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Reference Image Upload */}
      <div className="space-y-2">
        <label className="text-sm font-medium">参考图（可选）</label>
        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            disabled={isGenerating}
            className="hidden"
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={isGenerating}
          >
            <Upload className="h-4 w-4 mr-2" />
            选择图片
          </Button>
          {selectedImage && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={clearSelectedImage}
              disabled={isGenerating}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Image Count Selector */}
      <div className="space-y-2">
        <label className="text-sm font-medium">生成数量</label>
        <select
          value={imageCount}
          onChange={(e) => setImageCount(Number(e.target.value))}
          disabled={isGenerating}
          className="w-full px-3 py-2 rounded-lg border bg-background text-sm"
        >
          {[1, 2, 3, 4].map((n) => (
            <option key={n} value={n}>
              {n} 张
            </option>
          ))}
        </select>
      </div>

      {/* Preview */}
      {selectedImage && (
        <div className="space-y-2">
          <Label className="text-sm font-medium">预览</Label>
          <div className="relative aspect-square rounded-lg overflow-hidden border">
            {/* data-URL preview: next/image does not optimize blob/data URLs */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={selectedImage}
              alt="Preview"
              className="object-cover w-full h-full"
            />
            <button
              onClick={clearSelectedImage}
              className="absolute top-2 right-2 p-1 bg-black/50 rounded-full text-white hover:bg-black/70"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
      </CardContent>
    </Card>
  );
}

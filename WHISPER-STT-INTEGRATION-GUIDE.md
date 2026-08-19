# Whisper STT 语音转文字集成方案

**版本**: v1.0  
**创建时间**: 2026-08-18  
**目标**: 实现高质量语音消息转录功能  

---

## 🎯 业务价值

### 用户场景
```
用户录制语音消息 → AI 自动转录为文本 → 进入正常聊天流程 → 
女友回复 → TTS 合成为语音播放
```

**优势**:
- ✅ 无障碍访问 (支持听障用户)
- ✅ 快速输入 (比打字更快)
- ✅ 多语言支持 (中英文混合识别)
- ✅ 情感传递 (语音语气 + 文字内容)

### 技术指标
| 指标 | 目标值 |
|------|--------|
| 准确率 (英语) | > 90% |
| 准确率 (中文) | > 85% |
| 延迟 (10s 语音) | < 5 秒 |
| 成本 | ~$0.006/分钟 |

---

## 🔧 技术选型对比

### Option A: RunPod Self-hosted Whisper (推荐 ⭐)

| 维度 | 评分 | 说明 |
|------|------|------|
| **成本** | ⭐⭐⭐⭐⭐ | $0.01/h GPU，按量付费 |
| **隐私** | ⭐⭐⭐⭐⭐ | 数据完全私有 |
| **可控性** | ⭐⭐⭐⭐☆ | 可定制模型版本 |
| **延迟** | ⭐⭐⭐⭐ | 10-30s (GPU warmed up) |
| **复杂度** | ⭐⭐⭐ | 需要维护 ComfyUI worker |

**成本计算**:
```
GPU 价格: A10G @ $0.03/hour
Average usage: 1 minute per transcription = $0.0005 per job
Monthly cost (50 Pro users x 50 messages): $7.50
```

### Option B: Replicate Whisper API

| 维度 | 评分 | 说明 |
|------|------|------|
| **成本** | ⭐⭐ | ~$0.01/min (2x RunPod) |
| **部署** | ⭐⭐⭐⭐⭐ | Zero-config |
| **延迟** | ⭐⭐⭐⭐ | 5-15s |
| **可靠性** | ⭐⭐⭐⭐⭐ | Managed service |

### Option C: Coze ASR

| 维度 | 评分 | 说明 |
|------|------|------|
| **成本** | ⭐⭐⭐⭐ | $0.003/min |
| **延迟** | ⭐⭐⭐⭐⭐ | < 3s |
| **质量** | ⭐⭐⭐ | Good but not great for English |
| **集成** | ⭐⭐⭐⭐ | Easy with existing Coze LLM |

**结论**: 选择 **RunPod self-hosted Whisper** (平衡成本 + 质量 + 可控性)

---

## 📋 实施方案总览

| 阶段 | 任务 | 耗时 | 依赖 |
|------|------|------|------|
| **Phase 1** | 1. RunPod Whisper worker 配置 | 4h | GPU availability |
| **Phase 2** | 2. STT API 路由开发 | 3h | Phase 1 complete |
| **Phase 3** | 3. 前端录音组件 | 3h | Phase 2 ready |
| **Phase 4** | 4. 限流与配额系统 | 2h | None |
| **Phase 5** | 5. 测试与优化 | 2h | All above |

**总计**: 14 小时 ≈ 2 个工作日

---

## 💻 Phase 1: RunPod Whisper Worker 配置

### Step 1.1: 创建 ComfyUI Worker with Whisper

#### Dockerfile: `whisper-worker/Dockerfile`

```dockerfile
FROM comfyanonymous/ComfyUI_cuda121_jax_ubuntu20.04:latest

# Install whisper dependencies
RUN pip install \
    faster-whisper==0.10.0 \
    ffmpeg-python==0.2.0 \
    pydub==0.25.1

WORKDIR /comfyui

COPY custom_nodes/comfyui-whisper-compatibility-checkpoints.py /comfyui/custom_nodes/

CMD ["/bin/bash", "-c", "echo 'Whisper endpoint ready'"]
```

#### Node: `comfyui-custom-nodes/whisper-node.py`

```python
class WhisperTranscriptionNode:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "audio_file": ("STRING", {"multiline": False}),
                "language": (["auto", "en", "zh"], {"default": "auto"}),
                "model_size": (["tiny", "base", "small", "medium", "large-v2"], {"default": "medium"}),
            }
        }
    
    RETURN_TYPES = ("STRING",)  # Returns transcript text
    FUNCTION = "transcribe"
    CATEGORY = "Audio"
    
    def transcribe(self, audio_file: str, language: str, model_size: str):
        import torch
        from faster_whisper import WhisperModel
        
        # Load model
        device = "cuda" if torch.cuda.is_available() else "cpu"
        model = WhisperModel(model_size, device=device)
        
        # Transcribe
        segments, info = model.transcribe(
            audio_file,
            language=language if language != "auto" else None,
            beam_size=5
        )
        
        transcript = "\n".join([s.text for s in segments])
        return (transcript,)
```

#### Config: `whisper-worker/config.json`

```json
{
  "worker_id": "whisper-stt-worker-001",
  "gpu_type": "A10G",
  "memory_gb": 16,
  "model_config": {
    "default_model_size": "medium",
    "max_audio_duration_sec": 300,
    "supported_languages": ["auto", "en", "zh", "ja", "ko"]
  },
  "pricing_per_hour_usd": 0.03
}
```

### Step 1.2: Deploy to RunPod

```bash
# Build image
docker build -t whisper-stt-worker:latest ./whisper-worker

# Push to registry
docker tag whisper-stt-worker:latest YOUR_REGISTRY/whisper-stt-worker:latest
docker push YOUR_REGISTRY/whisper-stt-worker:latest

# Create serverless endpoint via API
curl -X POST https://api.runpod.ai/graphql \
  -H "Authorization:Bearer $RUNPOD_API_KEY" \
  -H "Content-Type:application/json" \
  -d '{
    "query": "mutation($input: PodInput!) { podMount(input: $input) { id } }",
    "variables": {
      "input": {
        "name": "whisper-stt-serverless",
        "imageId": "YOUR_IMAGE_ID",
        "containerDiskInGb": 20,
        "gpuTypeId": "A10G",
        "volumeMountPath": "/data",
        "env": {
          "RUNPOD_STT_MODEL_SIZE": "medium",
          "MAX_AUDIO_DURATION_SEC": "300"
        },
        "networkVolumeId": "",
        "ports": "8080/http",
        "serverlessScalingEnabled": true,
        "serverlessScalingMin": 0,
        "serverlessScalingMax": 10
      }
    }
  }'
```

**记录 Endpoint ID**: 假设返回 `rp_whisper_stt_001`

---

## 💻 Phase 2: STT API 路由开发

### File: `src/app/api/audio/transcribe/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { getAuthUser } from '@/lib/supabase-server';
import { checkRateLimitAsync } from '@/lib/rate-limit';
import { transcribeWithWhisper } from '@/lib/whisper-stt';
import { uploadFile, deleteFile } from '@/lib/storage';
import { createClient } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
    // Step 1: Authenticate user
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Step 2: Read audio file from FormData
    const formData = await request.formData();
    const audioFile = formData.get('audio') as File;
    
    if (!audioFile) {
      return NextResponse.json({ error: 'No audio file provided' }, { status: 400 });
    }
    
    // Validate file type
    const allowedTypes = ['audio/webm', 'audio/mp3', 'audio/wav', 'audio/mpeg'];
    if (!allowedTypes.includes(audioFile.type)) {
      return NextResponse.json(
        { error: `Unsupported audio format. Allowed: ${allowedTypes.join(', ')}` },
        { status: 400 }
      );
    }
    
    // Step 3: Check quota (Pro: 50/day, Unlimited: unlimited)
    const membership = await getMembership(user.id);
    const dailyCount = await getDailyUsage(user.id, 'stt_transcription');
    
    const limits = {
      free: { maxPerDay: 0, action: 'deny' },
      pro: { maxPerDay: 50, action: 'allow' },
      unlimited: { maxPerDay: Infinity, action: 'allow' },
    };
    
    const config = limits[membership];
    if (dailyCount >= config.maxPerDay) {
      return NextResponse.json(
        { error: 'STT quota exceeded. Please upgrade your plan.' },
        { status: 403 }
      );
    }
    
    // Step 4: Upload audio to temporary S3 storage
    const arrayBuffer = await audioFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    const key = `temp/stt/${user.id}/${Date.now()}_${crypto.randomUUID()}.webm`;
    const { url: audioUrl } = await uploadFile(buffer, key, 'audio/webm');
    
    logger.info('[STT] Audio uploaded for transcription', { userId: user.id, size: buffer.length });
    
    try {
      // Step 5: Call Whisper via RunPod
      const transcript = await transcribeWithWhisper(audioUrl, {
        language: detectLanguageFromContext(), // TODO: Detect or use default
        modelSize: 'medium', // Balanced quality/speed
      });
      
      // Step 6: Increment usage counter
      await incrementUsage(user.id, 'stt_transcription');
      
      // Step 7: Clean up temporary file
      await deleteFile(key);
      
      logger.info('[STT] Transcription successful', { 
        userId: user.id, 
        duration: transcript.length 
      });
      
      return NextResponse.json({
        success: true,
        transcript,
        detectedLanguage: 'en', // If we implement language detection
      });
      
    } catch (whisperError) {
      logger.error('[STT] Whisper transcription failed', { 
        err: whisperError.message,
        userId: user.id,
      });
      
      // Clean up on error too
      await deleteFile(key);
      
      throw whisperError;
    }
    
  } catch (error) {
    logger.error('[STT] Request failed', { err: error });
    
    if (error instanceof Error && error.message.includes('quota')) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    
    return NextResponse.json(
      { error: 'Transcription failed' },
      { status: 500 }
    );
  }
}

/** Helper functions */
async function getMembership(userId: string): Promise<'free' | 'pro' | 'unlimited'> {
  const supabase = createClient();
  const { data } = await supabase
    .from('profiles')
    .select('membership_tier')
    .eq('id', userId)
    .single();
  
  return (data?.membership_tier as any) || 'free';
}

async function getDailyUsage(userId: string, feature: string): Promise<number> {
  const supabase = createClient();
  const today = new Date().toISOString().split('T')[0];
  
  const { data } = await supabase
    .from('usage_logs')
    .select('count')
    .eq('user_id', userId)
    .eq('feature', feature)
    .eq('date', today)
    .single();
  
  return data?.count || 0;
}

async function incrementUsage(userId: string, feature: string, amount: number = 1): Promise<void> {
  const supabase = createClient();
  const today = new Date().toISOString().split('T')[0];
  
  await supabase
    .from('usage_logs')
    .upsert({
      user_id: userId,
      feature,
      date: today,
      count: amount,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'user_id,feature,date',
    });
}

function detectLanguageFromContext(): 'en' | 'zh' | 'auto' {
  // TODO: Implement based on recent chat context or user preference
  return 'auto';
}
```

---

### File: `src/lib/whisper-stt.ts`

```typescript
import { logger } from './logger';

export interface TranscribeOptions {
  language?: 'en' | 'zh' | 'auto';
  modelSize?: 'tiny' | 'base' | 'small' | 'medium' | 'large-v2';
  timestamp?: 'chunk';  // Word-level timestamps
}

export interface TranscribeResult {
  transcript: string;
  detectedLanguage?: string;
  confidence?: number;
  durationMs?: number;
}

const WHISPER_RUNPOD_ENDPOINT_ID = process.env.WHISPER_RUNPOD_ENDPOINT_ID;

export async function transcribeWithWhisper(
  audioUrl: string,
  options: TranscribeOptions = {}
): Promise<TranscribeResult> {
  
  // Fallback validation
  if (!WHISPER_RUNPOD_ENDPOINT_ID) {
    throw new Error('Whisper endpoint not configured');
  }
  
  const startTime = Date.now();
  const endpointUrl = `https://api.runpod.ai/v2/${WHISPER_RUNPOD_ENDPOINT_ID}/run`;
  
  // Build input payload (depends on ComfyUI node implementation)
  const input = {
    audio_url: audioUrl,
    language: options.language || 'auto',
    model_size: options.modelSize || 'medium',
  };
  
  const response = await fetch(endpointUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RUNPOD_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ input }),
  });
  
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`RunPod API error ${response.status}: ${errText.slice(0, 200)}`);
  }
  
  const result = await response.json();
  
  if (!result.id) {
    throw new Error('No job ID returned from RunPod');
  }
  
  const jobId = result.id;
  
  // Poll for completion
  let attempts = 0;
  const maxAttempts = 60; // 60s timeout
  
  while (attempts < maxAttempts) {
    const statusUrl = `https://api.runpod.ai/v2/${WHISPER_RUNPOD_ENDPOINT_ID}/status/${jobId}`;
    const statusRes = await fetch(statusUrl, {
      headers: {
        'Authorization': `Bearer ${process.env.RUNPOD_API_KEY}`,
      },
    });
    
    const statusData = await statusRes.json();
    
    if (statusData.status === 'COMPLETED') {
      const transcript = extractTranscriptFromOutput(statusData.output);
      const durationMs = Date.now() - startTime;
      
      logger.info('[Whisper STT] Success', {
        jobId,
        transcriptLength: transcript.length,
        durationMs,
      });
      
      return {
        transcript,
        durationMs,
      };
    }
    
    if (statusData.status === 'FAILED') {
      throw new Error(`Whisper job failed: ${statusData.error || 'Unknown error'}`);
    }
    
    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, 1000));
    attempts++;
  }
  
  // Timeout - cancel job
  try {
    await cancelRunPodJob(jobId);
  } catch (err) {
    logger.warn('[Whisper STT] Failed to cancel timed-out job', { jobId, err });
  }
  
  throw new Error('Whisper transcription timeout after 60s');
}

function extractTranscriptFromOutput(output: any): string {
  // Extract based on ComfyUI node output structure
  // Assumed structure: { "output": "transcribed text" } or { "text": "..." }
  return typeof output === 'string' 
    ? output 
    : output?.text || output?.output || '';
}

async function cancelRunPodJob(jobId: string): Promise<void> {
  const url = `https://api.runpod.ai/v2/${WHISPER_RUNPOD_ENDPOINT_ID}/cancel/${jobId}`;
  await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RUNPOD_API_KEY}`,
    },
  });
}
```

---

## 💻 Phase 3: 前端录音组件

### File: `src/components/ChatVoiceRecorder.tsx`

```tsx
'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { logger } from '@/lib/logger';

interface VoiceRecorderProps {
  onTranscribe: (transcript: string) => void;
  onError?: (error: string) => void;
}

export function ChatVoiceRecorder({ onTranscribe, onError }: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
        } 
      });
      
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
      });
      
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      
      mediaRecorder.start();
      setIsRecording(true);
      
      // Start timer
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
      
      logger.info('[VoiceRecorder] Recording started');
      
    } catch (err) {
      logger.error('[VoiceRecorder] Mic access denied', { err });
      onError?.('麦克风访问被拒绝');
    }
  };
  
  const stopRecording = async () => {
    if (!mediaRecorderRef.current) return;
    
    // Stop recording
    mediaRecorderRef.current.stop();
    
    // Clear timer
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    
    setIsRecording(false);
    
    // Wait for final chunk
    await new Promise(resolve => {
      mediaRecorderRef.current!.onstop = resolve;
    });
    
    // Create blob from chunks
    const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
    const audioFile = new File([audioBlob], `recording-${Date.now()}.webm`, {
      type: 'audio/webm',
    });
    
    // Send to backend for transcription
    setTranscribing(true);
    
    try {
      const formData = new FormData();
      formData.append('audio', audioFile);
      
      const response = await fetch('/api/audio/transcribe', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Transcription failed');
      }
      
      const data = await response.json();
      
      // Pass transcript to parent
      onTranscribe(data.transcript);
      
      logger.info('[VoiceRecorder] Transcription complete', { length: data.transcript.length });
      
    } catch (err) {
      logger.error('[VoiceRecorder] Transcription failed', { err });
      onError?.(err instanceof Error ? err.message : '转录失败');
    } finally {
      setTranscribing(false);
    }
  };
  
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };
  
  return (
    <Card className="p-4">
      <Button
        onClick={isRecording ? stopRecording : startRecording}
        variant={isRecording ? 'destructive' : 'default'}
        disabled={transcribing}
        className="flex items-center gap-2"
      >
        {isRecording ? (
          <>
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
            </span>
            {formatTime(recordingTime)} - 停止
          </>
        ) : (
          '🎤 按住说话'
        )}
        
        {transcribing && (
          <span className="ml-2 text-sm text-muted-foreground">⏳ 转录中...</span>
        )}
      </Button>
      
      {isRecording && (
        <div className="mt-2 text-sm text-muted-foreground">
          点击停止按钮结束录音
        </div>
      )}
      
      {transcribing && (
        <div className="mt-2 text-sm text-primary">
          正在将语音转换为文字...
        </div>
      )}
    </Card>
  );
}
```

---

## ✅ Go-Live Checklist

- [ ] RunPod Whisper worker deployed
- [ ] Environment variables configured (`WHISPER_RUNPOD_ENDPOINT_ID`)
- [ ] Frontend recorder component integrated into Chat page
- [ ] Usage quota system active (Pro: 50/day)
- [ ] Error handling & retry logic tested
- [ ] Performance benchmarked (< 5s for 10s voice clip)
- [ ] Accessibility tested (screen reader compatible)
- [ ] Cost monitoring dashboard setup

---

**最后更新**: 2026-08-18  
**版本**: v1.0  
**负责人**: Backend Team

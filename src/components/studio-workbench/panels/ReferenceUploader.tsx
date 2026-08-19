'use client';

import { useRef } from 'react';
import { useStudio } from '../StudioContext';
import { Upload, X, Loader2, Eye } from 'lucide-react';
import { useState } from 'react';

interface ReferenceUploaderProps {
  /** Vertical full-view mode for right column */
  portrait?: boolean;
}

export function ReferenceUploader({ portrait }: ReferenceUploaderProps) {
  const { state, dispatch, uploadReferenceImage } = useStudio();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    try {
      await uploadReferenceImage(file);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        {state.genMode === 'img2video' ? '视频源图' : state.genMode === 'img2img' ? '参控图' : '参考图'}
      </label>
      <p className="-mt-1 mb-1.5 text-[9px] leading-relaxed text-slate-600">
        {state.genMode === 'img2img'
          ? '驱动换装/姿势/背景变换；人物一致性由 IP-Adapter 独立控制'
          : '上传后进入图生图；人物一致性由 IP-Adapter 控制'}
      </p>

      {state.inputImage ? (
        <div className="relative group">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img 
            src={state.inputImage} 
            alt="参考图" 
            className={portrait ? "w-full h-64 object-contain rounded-lg bg-black/40 cursor-pointer" : "w-full h-36 object-cover rounded-lg"}
            onClick={portrait ? () => window.open(state.inputImage) : undefined}
          />
          {portrait && (
            <button
              onClick={() => dispatch({ type: 'SET_INPUT_IMAGE', url: '' })}
              className="absolute right-2 top-2 rounded-full bg-black/70 p-1 text-red-300 opacity-0 transition group-hover:opacity-100"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <div className="absolute bottom-2 left-2 rounded-md bg-black/70 px-2 py-0.5 text-[10px] text-emerald-300">
            参考图已加载
          </div>
          {portrait && (
            <div className="absolute bottom-2 right-2 rounded-md bg-black/70 px-2 py-0.5 text-[10px] text-slate-300 flex items-center gap-1">
              <Eye className="h-3 w-3" />
              点击查看原图
            </div>
          )}
        </div>
      ) : (
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="flex h-28 w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-white/10 bg-white/[0.02] text-slate-500 transition hover:border-violet-500/30 hover:bg-violet-500/[0.03] hover:text-violet-400"
        >
          {uploading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Upload className="h-5 w-5" />
          )}
          <span className="text-xs">点击上传或拖拽参考图</span>
        </button>
      )}

      {/* URL input */}
      <div className="mt-2 flex gap-1">
        <input
          value={state.inputImage}
          onChange={(e) => dispatch({ type: 'SET_INPUT_IMAGE', url: e.target.value })}
          placeholder="或粘贴 HTTPS 图片地址"
          className="flex-1 rounded-md border border-white/10 bg-[#0d0d15] px-2 py-1 text-[11px] text-white placeholder:text-slate-600 focus:border-violet-500/50 focus:outline-none"
        />
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => void handleFile(e.target.files?.[0] || null)}
      />
    </div>
  );
}

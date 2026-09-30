'use client';

interface CompressionPreviewProps {
  originalSrc: string;
  compressedSrc?: string;
}

/**
 * 压缩预览对比组件
 */
export function CompressionPreview({ 
  originalSrc, 
  compressedSrc 
}: CompressionPreviewProps) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <p className="text-xs text-gray-400 mb-2">原始图片</p>
        {/* eslint-disable-next-line @next/next/no-img-element -- admin 压缩对比预览，外部签名 URL 动态源，无需 next/image 优化 */}
        <img 
          src={originalSrc} 
          alt="Original" 
          className="w-full h-auto rounded-md border border-gray-700" 
        />
      </div>
      {compressedSrc && (
        <div>
          <p className="text-xs text-gray-400 mb-2">压缩后</p>
          {/* eslint-disable-next-line @next/next/no-img-element -- admin 压缩对比预览，外部签名 URL 动态源，无需 next/image 优化 */}
          <img 
            src={compressedSrc} 
            alt="Compressed" 
            className="w-full h-auto rounded-md border border-green-600/50" 
          />
        </div>
      )}
    </div>
  );
}

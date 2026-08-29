'use client';

import { useRef } from 'react';

interface CompressedImageResult {
  file: File;
  compressedBlob: Blob;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
}

export function useImageCompressor() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  /**
   * 压缩单张图片
   */
  const compressImage = async (
    imageFile: File,
    maxWidth: number = 1920,
    maxHeight: number = 1920,
    quality: number = 0.8
  ): Promise<CompressedImageResult> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          // 计算缩放比例
          let width = img.width;
          let height = img.height;
          
          if (width > height) {
            if (width > maxWidth) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width = Math.round((width * maxHeight) / height);
              height = maxHeight;
            }
          }

          // 创建 canvas
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Failed to get canvas context'));
            return;
          }

          // 高质量缩放
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, width, height);

          // 导出为 WebP（质量最好且压缩率高）
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error('Canvas export failed'));
                return;
              }

              const compressedFile = new File([blob], imageFile.name, {
                type: 'image/webp',
                lastModified: Date.now(),
              });

              resolve({
                file: compressedFile,
                compressedBlob: blob,
                originalSize: imageFile.size,
                compressedSize: blob.size,
                compressionRatio: Number(((1 - blob.size / imageFile.size) * 100).toFixed(1)),
              });
            },
            'image/webp',
            quality
          );
        };

        img.onerror = () => reject(new Error('Image load failed'));
        img.src = e.target?.result as string;
      };

      reader.onerror = () => reject(new Error('File read failed'));
      reader.readAsDataURL(imageFile);
    });
  };

  /**
   * 批量压缩多张图片
   */
  const compressMultipleImages = async (
    images: File[],
    options?: {
      maxWidth?: number;
      maxHeight?: number;
      quality?: number;
      convertToWebP?: boolean;
    }
  ): Promise<CompressedImageResult[]> => {
    const {
      maxWidth = 1920,
      maxHeight = 1920,
      quality = 0.85,
      convertToWebP = true,
    } = options || {};

    const results = [];
    
    for (const image of images) {
      try {
        const result = await compressImage(image, maxWidth, maxHeight, quality);
        
        // 如果不是 WebP 格式，转换为 WebP
        if (convertToWebP && !result.file.type.includes('webp')) {
          // 重新压缩为 WebP
          const webpResult = await compressImage(result.file, maxWidth, maxHeight, quality);
          results.push(webpResult);
        } else {
          results.push(result);
        }
      } catch (error) {
        console.error(`Compression failed for ${image.name}:`, error);
        // 跳过失败的文件，继续处理其他文件
      }
    }
    
    return results;
  };

  return {
    compressImage,
    compressMultipleImages,
    canvasRef,
  };
}

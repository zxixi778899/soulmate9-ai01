/**
 * gen-hub 能力位（enhancement capabilities）解析。
 *
 * 任务 params 可携带能力位：
 *   {
 *     control: { type: 'openpose' | 'depth', image: string, strength?: number },
 *     face_fix: boolean,            // FaceDetailer 面部修复
 *     upscale: true | 2 | 4,        // 高清放大倍率
 *     identity_image: string,       // IP-Adapter 身份参考图
 *   }
 * 解析是宽容的：非法项被丢弃并告警，绝不让一个坏能力位整单失败；
 * 工作流侧（comfy-builders / buildFluxWorkflow）仍有各自的就绪门控。
 */

import { logger } from '@/lib/logger';

export type GenControlType = 'openpose' | 'depth';

export interface GenCapabilities {
  control?: { type: GenControlType; image: string; strength?: number };
  face_fix?: boolean;
  /** 放大倍率（1.5–4；true 视为 2x） */
  upscale?: number;
  identity_image?: string;
}

/** 从任务 params 提取并归一化能力位（非法项丢弃）。 */
export function parseGenCapabilities(params: Record<string, unknown> | null | undefined): GenCapabilities {
  const caps: GenCapabilities = {};
  if (!params || typeof params !== 'object') return caps;

  // ── control ──
  const control = params.control;
  if (control && typeof control === 'object') {
    const c = control as Record<string, unknown>;
    const type = c.type === 'depth' ? 'depth' : c.type === 'openpose' ? 'openpose' : null;
    const image = typeof c.image === 'string' ? c.image.trim() : '';
    if (type && image) {
      caps.control = { type, image };
      const strength = Number(c.strength);
      if (Number.isFinite(strength)) {
        caps.control.strength = Math.min(1, Math.max(0.2, strength));
      }
    } else {
      logger.warn('[gen-hub] dropping invalid control capability', { type: c.type, hasImage: !!image });
    }
  }

  // ── face_fix ──
  if (params.face_fix === true) {
    caps.face_fix = true;
  }

  // ── upscale ──
  if (params.upscale === true) {
    caps.upscale = 2;
  } else if (typeof params.upscale === 'number' || typeof params.upscale === 'string') {
    const factor = Number(params.upscale);
    if (Number.isFinite(factor) && factor > 1) {
      caps.upscale = Math.min(4, Math.max(1.5, factor));
    } else {
      logger.warn('[gen-hub] dropping invalid upscale factor', { value: params.upscale });
    }
  }

  // ── identity_image ──
  if (typeof params.identity_image === 'string' && params.identity_image.trim()) {
    caps.identity_image = params.identity_image.trim();
  }

  return caps;
}

/** True when at least one capability is active. */
export function hasAnyCapability(caps: GenCapabilities): boolean {
  return Boolean(caps.control || caps.face_fix || caps.upscale || caps.identity_image);
}

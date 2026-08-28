'use client';

/**
 * ControlNetPreviewPanel — Visual feedback for active ControlNet multi-unit configuration.
 * 
 * Displays selected pose/outfit/scene presets alongside their ControlNet reference assets:
 * - OpenPose skeleton JSON → wireframe preview
 * - Canny edge map → line drawing preview  
 * - Depth map → grayscale depth visualization
 * - IP-Adapter face → cropped face preview
 */

import { cn } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n/context';
import type { WorkbenchPreset, OutfitOption } from './types';
import { Badge } from '@/components/ui/badge';
import { Loader2, Image as ImageIcon } from 'lucide-react';

interface ControlNetPreviewPanelProps {
  pose?: WorkbenchPreset | null;
  outfit?: OutfitOption | null;
  scene?: WorkbenchPreset | null;
  identityImage?: string | null; // From selected girl
  presetIdentityImage?: string | null; // From selected preset (IP-Adapter face)
}

export function ControlNetPreviewPanel({
  pose,
  outfit,
  scene,
  identityImage,
  presetIdentityImage,
}: ControlNetPreviewPanelProps) {
  const { t } = useTranslation();
  
  // ========== IP-Adapter Auto Detection ==========
  // Use preset identity image if available, fallback to girl identity
  const effectiveIdentityImage = presetIdentityImage || identityImage;
  
  // Check if any ControlNet resources are available
  const hasAnyControlNet = Boolean(
    pose?.openpose_json || pose?.body_depth_url ||
    outfit?.canny_edge_url || outfit?.person_mask_url ||
    scene?.body_depth_url || scene?.canny_edge_url || scene?.bg_mask_url ||
    effectiveIdentityImage
  );

  if (!hasAnyControlNet) return null;

  return (
    <div className="mb-4 rounded-xl border border-white/10 bg-[#1D1D1D] p-3 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-[0.15em] text-white/80">
          {t('workbench.controlnetControls')}
        </h3>
        <Badge variant="outline" className="text-[9px] border-[#FD5FC2]/30 bg-[#FD5FC2]/10 text-[#FF9ADE]">
          Multi-Unit Active
        </Badge>
      </div>

      {/* Preview Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {/* Pose Unit Preview */}
        {(pose?.openpose_json || pose?.body_depth_url) && (
          <PreviewCard
            label={t('workbench.slotPose')}
            imageSrc={getSkeletonPreview(pose.openpose_json)}
            icon={ pose?.openpose_json ? 'skeleton' : 'depth'}
            badgeText={pose?.openpose_json ? t('workbench.openPoseEnabled') : t('workbench.depthEnabled')}
            color="rose"
            isLoading={!pose?.openpose_json && !pose?.body_depth_url}
          />
        )}

        {/* Outfit Unit Preview */}
        {(outfit?.canny_edge_url || outfit?.person_mask_url) && (
          <PreviewCard
            label={t('workbench.slotOutfit')}
            imageSrc={getEdgePreview(outfit.canny_edge_url, outfit.person_mask_url)}
            icon={outfit?.canny_edge_url ? 'edges' : 'mask'}
            badgeText={outfit?.canny_edge_url ? t('workbench.tryOnEnabled') : 'Mask ON'}
            color="violet"
            isLoading={!outfit?.canny_edge_url && !outfit?.person_mask_url}
          />
        )}

        {/* Scene Unit Preview */}
        {(scene?.body_depth_url || scene?.canny_edge_url || scene?.bg_mask_url) && (
          <PreviewCard
            label={t('workbench.slotScene')}
            imageSrc={scene?.body_depth_url || scene?.canny_edge_url || scene?.bg_mask_url || undefined}
            icon={scene?.body_depth_url ? 'depth' : scene?.canny_edge_url || scene?.bg_mask_url ? 'edges' : 'edges'}
            badgeText={scene?.body_depth_url ? t('workbench.depthEnabled') : t('workbench.tryOnEnabled')}
            color="cyan"
            isLoading={!scene?.body_depth_url && !scene?.canny_edge_url && !scene?.bg_mask_url}
          />
        )}

        {/* Identity Unit Preview (if present) */}
        {effectiveIdentityImage && (
          <PreviewCard
            label={t('workbench.identityLock')}
            imageSrc={effectiveIdentityImage}
            icon="face"
            badgeText={t('workbench.faceLocked')}
            color="amber"
            aspectClass="aspect-square"
          />
        )}
      </div>

      {/* Info Banner */}
      <div className="rounded-lg bg-white/[0.03] border border-white/5 p-2.5">
        <p className="text-[10px] text-white/45 leading-relaxed">
          {t('workbench.controlnetInfo')}
        </p>
      </div>
    </div>
  );
}

/**
 * Single preview card component
 */
function PreviewCard(props: {
  label: string;
  imageSrc?: string | null;
  icon: 'skeleton' | 'depth' | 'edges' | 'mask' | 'face';
  badgeText: string;
  color: 'rose' | 'violet' | 'cyan' | 'amber';
  aspectClass?: string;
  isLoading?: boolean;
}) {
  const { t } = useTranslation();
  
  const colorStyles = {
    rose: 'border-[#FD5FC2]/30 bg-[#FD5FC2]/5 hover:bg-[#FD5FC2]/10',
    violet: 'border-[#8b5cf6]/30 bg-[#8b5cf6]/5 hover:bg-[#8b5cf6]/10',
    cyan: 'border-[#06b6d4]/30 bg-[#06b6d4]/5 hover:bg-[#06b6d4]/10',
    amber: 'border-[#f59e0b]/30 bg-[#f59e0b]/5 hover:bg-[#f59e0b]/10',
  };

  const badgeColors = {
    rose: 'bg-[#FD5FC2]/20 text-[#FF9ADE]',
    violet: 'bg-[#8b5cf6]/20 text-[#A78BFA]',
    cyan: 'bg-[#06b6d4]/20 text-[#67E8F9]',
    amber: 'bg-[#f59e0b]/20 text-[#FCD34D]',
  };

  const iconColors = {
    rose: 'text-[#FD5FC2]',
    violet: 'text-[#8b5cf6]',
    cyan: 'text-[#06b6d4]',
    amber: 'text-[#f59e0b]',
  };

  return (
    <div
      className={cn(
        'relative rounded-lg border overflow-hidden transition-all',
        colorStyles[props.color],
        props.aspectClass || 'aspect-[4/3]',
      )}
    >
      {/* Background indicator icon */}
      <div className="absolute inset-0 flex items-center justify-center opacity-10">
        {renderIcon(props.icon, 48)}
      </div>

      {/* Image content */}
      {props.imageSrc ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- dynamic asset URL */}
          <img
            src={props.imageSrc}
            alt={props.label}
            className="w-full h-full object-cover"
            loading="lazy"
          />
          {/* Overlay gradient for text readability */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        </>
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-white/30" />
        </div>
      )}

      {/* Label */}
      <div className="absolute bottom-0 left-0 right-0 p-2">
        <p className="text-[10px] font-semibold text-white truncate">
          {props.label}
        </p>
      </div>

      {/* Status badge */}
      <Badge
        variant="outline"
        className={cn(
          'absolute top-1.5 right-1.5 rounded text-[8px] font-bold uppercase tracking-wider border-0',
          badgeColors[props.color],
        )}
      >
        {props.badgeText}
      </Badge>
    </div>
  );
}

/**
 * Helper: Get skeleton preview from OpenPose JSON file
 */
function getSkeletonPreview(openposeJson?: string): string | null {
  if (!openposeJson) return null;
  
  // For OpenPose JSON files, we could generate a wireframe SVG preview here
  // For now, return the JSON URL as-is (browser may render it or we can pre-process)
  // In production, consider pre-generating a PNG thumbnail from the skeleton
  return openposeJson;
}

/**
 * Helper: Get edge or mask preview from preset
 */
function getEdgePreview(
  cannyEdge?: string,
  personMask?: string
): string | null {
  // Prefer Canny edges, fallback to segmentation mask
  return cannyEdge || personMask || null;
}

/**
 * Render visual icon based on ControlNet type
 */
function renderIcon(icon: string, size: number = 24) {
  switch (icon) {
    case 'skeleton':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="12" cy="4" r="2" />
          <line x1="12" y1="6" x2="12" y2="10" />
          <line x1="8" y1="10" x2="16" y2="10" />
          <line x1="8" y1="10" x2="6" y2="14" />
          <line x1="16" y1="10" x2="18" y2="14" />
          <line x1="12" y1="10" x2="12" y2="16" />
          <line x1="8" y1="14" x2="12" y2="20" />
          <line x1="16" y1="14" x2="12" y2="20" />
        </svg>
      );
    case 'depth':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" opacity="0.6">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="12" cy="12" r="6" fillOpacity="0.4" />
        </svg>
      );
    case 'edges':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M3 12c2-3 4-3 6 0s4 3 6 0 4-3 6 0" />
          <path d="M3 16c2-3 4-3 6 0s4 3 6 0 4-3 6 0" />
        </svg>
      );
    case 'mask':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" opacity="0.6">
          <ellipse cx="12" cy="12" rx="8" ry="10" />
        </svg>
      );
    case 'face':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="12" cy="12" r="9" />
          <circle cx="9" cy="10" r="1.5" fill="currentColor" />
          <circle cx="15" cy="10" r="1.5" fill="currentColor" />
          <path d="M8 14q4 3 8 0" />
        </svg>
      );
    default:
      return <ImageIcon size={size} />;
  }
}

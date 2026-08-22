'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { OptimizedImg } from '@/components/OptimizedImg';

export interface PresetCardOption {
  value: string;
  label: string;
  description?: string;
  image?: string;
  imagePlaceholder?: string; // emoji or icon
  active?: boolean;
}

interface CharacterPresetCardProps {
  options: PresetCardOption[];
  selected: string;
  onSelect: (value: string) => void;
  title: string;
  columns?: number;
  showDescription?: boolean;
  cardVariant?: 'compact' | 'standard' | 'large';
  /** Admin-only overlay rendered inside each card's image area (upload/delete buttons). */
  renderAdminOverlay?: (option: PresetCardOption) => ReactNode;
}

/**
 * 通用卡片预设选择器
 * 
 * Features:
 * - Visual-first design with images/icons
 * - Click to select
 * - Active state highlighting
 * - Responsive grid layout
 */
export function CharacterPresetCard({
  options,
  selected,
  onSelect,
  title,
  columns = 4,
  showDescription = true,
  cardVariant = 'standard',
  renderAdminOverlay,
}: CharacterPresetCardProps) {
  // large 版面固定竖版比例 3:4（不随宽度变化），其余档位固定高度
  const sizeClass =
    cardVariant === 'large'
      ? 'aspect-[3/4]'
      : cardVariant === 'standard'
        ? 'h-64'
        : 'h-48';

  return (
    <div className="space-y-3">
      {/* Title */}
      <div className="text-sm font-semibold text-white/80">
        {title}
      </div>

      {/* Grid */}
      <div
        className="grid gap-3"
        style={{
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        }}
      >
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onSelect(option.value)}
            className={cn(
              'group relative overflow-hidden rounded-2xl border-2 transition-all duration-200 touch-manipulation',
              selected === option.value
                ? 'border-[#FF2D78] bg-[#FF2D78]/10 shadow-[0_0_20px_rgba(255,45,120,0.3)] scale-[1.02]'
                : 'border-white/[0.09] bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.06]',
              sizeClass,
            )}
          >
            {/* Image/Visual */}
            <div className="relative h-3/4 w-full overflow-hidden">
              {option.image ? (
                <>
                  <OptimizedImg
                    src={option.image}
                    size="card"
                    alt={option.label}
                    className="absolute inset-0 h-full w-full object-cover"
                  />

                  {/* Overlay on hover */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                </>
              ) : (
                <div
                  className={cn(
                    'flex h-full w-full items-center justify-center text-4xl',
                    option.active && 'bg-[#FF2D78]/20'
                  )}
                >
                  {option.imagePlaceholder || '✨'}
                </div>
              )}

              {/* Admin 就地管理：上传/删除（仅管理员） */}
              {renderAdminOverlay?.(option)}

              {/* Selected indicator */}
              {selected === option.value && (
                <div className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-[#FF2D78] shadow-lg">
                  <svg
                    className="h-4 w-4 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={3}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex h-1/4 flex-col justify-center px-3 py-2">
              <div className="text-sm font-semibold text-white">
                {option.label}
              </div>
              {showDescription && option.description && (
                <div className="mt-0.5 text-xs text-white/50 line-clamp-2">
                  {option.description}
                </div>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

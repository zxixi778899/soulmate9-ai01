'use client';

import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { UserRound } from 'lucide-react';
import type { Any } from '../StudioWorkbench.types';

interface Props {
  girlfriends: Any[];
  selectedId: string;
  onSelect: (id: string) => void;
}

export function CompanionSelector({ girlfriends, selectedId, onSelect }: Props) {
  const selected = girlfriends.find((g) => String(g.id) === selectedId);

  return (
    <div className="flex items-center gap-2">
      <Select value={selectedId || 'none'} onValueChange={(v) => v !== 'none' && onSelect(v)}>
        <SelectTrigger className="h-8 w-52 border-white/10 bg-white/[0.03] text-xs">
          <SelectValue placeholder="选择伴侣…" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">选择伴侣…</SelectItem>
          {girlfriends.map((gf) => (
            <SelectItem key={String(gf.id)} value={String(gf.id)}>
              {String(gf.name || gf.id)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {selected && (
        <div className="hidden items-center gap-1.5 sm:flex">
          <UserRound className="h-3 w-3 text-violet-400" />
          <Badge variant="outline" className="border-violet-500/30 bg-violet-500/10 text-violet-200 text-[10px] px-1.5 py-0">
            {String(selected.name || selected.id)}
          </Badge>
          {selected.gender && (
            <Badge variant="outline" className="text-[10px] px-1 py-0 border-white/10 text-slate-400">
              {String(selected.gender)}
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}

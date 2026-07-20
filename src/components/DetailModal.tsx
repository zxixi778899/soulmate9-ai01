'use client';

import { X } from 'lucide-react';
import AvatarViewer from './AvatarViewer';
import { useTranslation } from '@/lib/i18n/context';

interface Girl {
  id: string;
  name: string;
  avatar: string;
  tagline: string;
  tags: string[];
  intimacy: number;
}

export default function DetailModal({ girl, onClose }: { girl: Girl; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4">
      <div className="bg-zinc-900 rounded-3xl max-w-4xl w-full max-h-[90vh] overflow-auto border border-[#ff2e88]/30">
        <div className="p-6 flex justify-between items-center border-b border-zinc-800">
          <h2 className="text-3xl font-bold">{girl.name}</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-white">
            <X size={28} />
          </button>
        </div>
        <div className="p-8 grid md:grid-cols-2 gap-8">
          <AvatarViewer avatar={girl.avatar} />
          <div>
            <p className="text-[#ff6ba6] text-lg">{girl.tagline}</p>
            <div className="mt-8">
              <div className="text-sm text-zinc-400 mb-2">{t('chat.intimacy')} {girl.intimacy}%</div>
              <div className="h-2 bg-zinc-800 rounded">
                <div className="h-2 bg-rose-500 rounded" style={{ width: `${girl.intimacy}%` }} />
              </div>
            </div>
            <button className="mt-10 w-full py-4 bg-gradient-to-r from-[#FF2D78] to-[#C026D3] rounded-2xl text-lg font-bold">
              {t('chat.startPrivate')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
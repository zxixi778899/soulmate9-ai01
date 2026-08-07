'use client';

import ComingSoon from '@/components/ComingSoon';
import { useTranslation } from '@/lib/i18n/context';


export default function MemoriesPage() {
  const { t } = useTranslation();
  return (
    <ComingSoon
      title={t('memories.title')}
      description={t('memories.description')}
      eta={t('common.comingSoon')}
    />
  );
}

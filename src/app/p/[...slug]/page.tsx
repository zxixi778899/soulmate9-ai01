import { Suspense } from 'react';
import PageRenderer from '@/components/page-builder/PageRenderer';

export default async function DynamicPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const pageSlug = slug ? slug.join('/') : '';

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <Suspense fallback={<div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>}>
        <PageRenderer slug={pageSlug} />
      </Suspense>
    </div>
  );
}
'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';

type PageModule = {
  id: string;
  module_type: string;
  title: string;
  content: string;
  image_url: string;
  button_text: string;
  button_url: string;
  sort_order: number;
};

interface PageRendererProps {
  slug: string;
}

export default function PageRenderer({ slug }: PageRendererProps) {
  const [page, setPage] = useState<any>(null);
  const [modules, setModules] = useState<PageModule[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPage = async () => {
      try {
        const res = await fetch(`/api/pages?slug=${slug}`);
        if (!res.ok) { setPage(null); return; }
        const data = await res.json();
        setPage(data);
        setModules(data.modules || []);
      } catch (e) {
        setPage(null);
      } finally {
        setLoading(false);
      }
    };
    fetchPage();
  }, [slug]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!page) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-muted-foreground"></p>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Hero Module */}
      {modules.filter(m => m.module_type === 'hero').map(mod => (
        <section key={mod.id} className="relative flex items-center justify-center px-6 py-24 text-center overflow-hidden">
          {mod.image_url && (
            <div className="absolute inset-0 z-0">
              <img src={mod.image_url} alt="" className="h-full w-full object-cover opacity-30" />
              <div className="absolute inset-0 bg-gradient-to-b from-background/80 via-background/40 to-background" />
            </div>
          )}
          <div className="relative z-10 max-w-3xl">
            {mod.title && <h1 className="text-4xl sm:text-6xl font-bold tracking-tight mb-6">{mod.title}</h1>}
            {mod.content && <p className="text-lg text-muted-foreground mb-8">{mod.content}</p>}
            {mod.button_text && (
              <Button size="lg" className="bg-gradient-to-r from-primary to-purple-500 text-white" asChild>
                <a href={mod.button_url || '#'}>{mod.button_text}</a>
              </Button>
            )}
          </div>
        </section>
      ))}

      {/* Text Module */}
      {modules.filter(m => m.module_type === 'text').map(mod => (
        <section key={mod.id} className="px-6 py-16 max-w-3xl mx-auto">
          {mod.title && <h2 className="text-2xl font-bold mb-4">{mod.title}</h2>}
          {mod.content && (
            <div className="prose prose-invert max-w-none">
              <p className="text-muted-foreground whitespace-pre-wrap">{mod.content}</p>
            </div>
          )}
        </section>
      ))}

      {/* Features Module */}
      {modules.filter(m => m.module_type === 'features').map(mod => (
        <section key={mod.id} className="px-6 py-16 max-w-5xl mx-auto">
          {mod.title && <h2 className="text-2xl font-bold text-center mb-12">{mod.title}</h2>}
          {mod.content && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {mod.content.split('\n').filter(l => l.trim()).map((line, i) => (
                <Card key={i} className="border-border/30 bg-card/40 backdrop-blur-sm">
                  <CardContent className="p-6 text-center">
                    <div className="text-3xl mb-3">{['', '', '', '', '', ''][i % 6]}</div>
                    <p className="font-medium">{line}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>
      ))}

      {/* CTA Module */}
      {modules.filter(m => m.module_type === 'cta').map(mod => (
        <section key={mod.id} className="px-6 py-16 text-center bg-gradient-to-r from-primary/10 to-purple-500/10">
          <div className="max-w-2xl mx-auto">
            {mod.title && <h2 className="text-3xl font-bold mb-4">{mod.title}</h2>}
            {mod.content && <p className="text-muted-foreground mb-8">{mod.content}</p>}
            {mod.button_text && (
              <Button size="lg" className="bg-gradient-to-r from-primary to-purple-500 text-white" asChild>
                <a href={mod.button_url || '#'}>{mod.button_text}</a>
              </Button>
            )}
          </div>
        </section>
      ))}

      {/* Gallery Module */}
      {modules.filter(m => m.module_type === 'gallery').map(mod => (
        <section key={mod.id} className="px-6 py-16 max-w-6xl mx-auto">
          {mod.title && <h2 className="text-2xl font-bold text-center mb-8">{mod.title}</h2>}
          {mod.image_url && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {mod.image_url.split(',').map((url, i) => (
                <div key={i} className="aspect-square rounded-xl overflow-hidden">
                  <img src={url.trim()} alt="" className="h-full w-full object-cover hover:scale-105 transition-transform duration-300" loading="lazy" />
                </div>
              ))}
            </div>
          )}
        </section>
      ))}

      {/* Cards Module */}
      {modules.filter(m => m.module_type === 'cards').map(mod => (
        <section key={mod.id} className="px-6 py-16 max-w-5xl mx-auto">
          {mod.title && <h2 className="text-2xl font-bold text-center mb-8">{mod.title}</h2>}
          {mod.content && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {mod.content.split('\n').filter(l => l.trim()).map((line, i) => (
                <Card key={i} className="border-border/30 bg-card/40 backdrop-blur-sm hover:border-primary/30 transition-all">
                  {mod.image_url && (
                    <div className="aspect-video rounded-t-xl overflow-hidden">
                      <img src={mod.image_url.split(',')[i] || mod.image_url} alt="" className="h-full w-full object-cover" loading="lazy" />
                    </div>
                  )}
                  <CardContent className="p-5">
                    <h3 className="font-semibold mb-2">{line.split('|')[0] || line}</h3>
                    {line.includes('|') && <p className="text-sm text-muted-foreground">{line.split('|')[1]}</p>}
                    {mod.button_text && (
                      <Button variant="outline" size="sm" className="mt-3" asChild>
                        <a href={mod.button_url || '#'}>{mod.button_text}</a>
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
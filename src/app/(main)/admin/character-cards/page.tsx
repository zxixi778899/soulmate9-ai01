'use client';

import { useState, useEffect, useCallback } from 'react';
import { authedFetch } from '@/lib/supabase';
import { useAuth } from '@/components/AuthProvider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Upload, Download, FileImage, Check, AlertCircle, Loader2 } from 'lucide-react';

interface ImportResult {
  girlfriend: { id: string; name: string; slug: string; version: string; tags: string[]; hasFirstMessage: boolean };
}

export default function CharacterCardsPage() {
  const { user } = useAuth();
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState('');
  const [gfs, setGfs] = useState<{ id: string; name: string }[]>([]);
  const [selectedGf, setSelectedGf] = useState('');

  useEffect(() => {
    authedFetch('/api/girlfriends')
      .then(r => r.json())
      .then(d => setGfs(d.girlfriends || []))
      .catch(() => {});
  }, []);

  const handleImport = useCallback(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setImporting(true);
    setError('');
    setResult(null);

    const form = e.currentTarget;
    const fileInput = form.elements.namedItem('card') as HTMLInputElement;
    if (!fileInput.files?.length) {
      setError('Please select a PNG file');
      setImporting(false);
      return;
    }

    const fd = new FormData();
    fd.append('card', fileInput.files[0]);

    try {
      const res = await authedFetch('/api/admin/character-cards', { method: 'POST', body: fd });
      const data = await res.json();
      if (res.ok) {
        setResult(data);
      } else {
        setError(data.error || 'Import failed');
      }
    } catch {
      setError('Network error');
    } finally {
      setImporting(false);
    }
  }, []);

  const handleExport = useCallback(async () => {
    if (!selectedGf) return;
    setExporting(true);
    setError('');
    try {
      const res = await authedFetch(`/api/girlfriends/${selectedGf}/export`);
      if (!res.ok) {
        const d = await res.json();
        setError(d.error || 'Export failed');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const name = gfs.find(g => g.id === selectedGf)?.name || 'character';
      a.download = `${name.replace(/[^a-zA-Z0-9]/g, '_')}.png`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('Export failed');
    } finally {
      setExporting(false);
    }
  }, [selectedGf, gfs]);

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Character Cards</h1>
        <p className="text-sm text-[#8B8BA3]">Import/Export SillyTavern-compatible PNG character cards</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Import */}
        <Card className="bg-card/40 backdrop-blur-sm border-white/[0.05]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Upload className="h-4 w-4 text-[#FF2D78]" />
              Import Character Card
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleImport} className="space-y-4">
              <div className="border-2 border-dashed border-white/[0.06] rounded-xl p-6 text-center hover:border-primary/50 transition-colors">
                <FileImage className="h-8 w-8 mx-auto mb-2 text-[#8B8BA3]" />
                <p className="text-sm text-[#8B8BA3] mb-2">Upload a SillyTavern .png character card</p>
                <input
                  type="file"
                  name="card"
                  accept=".png"
                  className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-[#FF2D78]-foreground hover:file:bg-primary/90 cursor-pointer"
                />
              </div>

              <Button type="submit" disabled={importing} className="w-full">
                {importing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                {importing ? 'Importing...' : 'Import Card'}
              </Button>
            </form>

            {error && (
              <div className="mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg flex items-start gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {result && (
              <div className="mt-4 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg space-y-2">
                <div className="flex items-center gap-2 text-emerald-500 font-medium">
                  <Check className="h-4 w-4" />
                  Imported Successfully
                </div>
                <div className="text-sm space-y-1">
                  <p><span className="text-[#8B8BA3]">Name:</span> {result.girlfriend.name}</p>
                  <p><span className="text-[#8B8BA3]">Format:</span> <Badge variant="outline" className="text-xs">{result.girlfriend.version.toUpperCase()}</Badge></p>
                  <p><span className="text-[#8B8BA3]">Tags:</span> {result.girlfriend.tags.join(', ') || 'None'}</p>
                  <p><span className="text-[#8B8BA3]">First Message:</span> {result.girlfriend.hasFirstMessage ? '' : ''}</p>
                </div>
                <Button size="sm" variant="outline" className="w-full" onClick={() => window.open(`/chat/${result.girlfriend.id}`, '_blank')}>
                  Open Chat
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Export */}
        <Card className="bg-card/40 backdrop-blur-sm border-white/[0.05]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Download className="h-4 w-4 text-[#FF2D78]" />
              Export Character Card
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-[#8B8BA3]">
              Export a girlfriend as a SillyTavern-compatible PNG character card
            </p>

            <select
              value={selectedGf}
              onChange={e => setSelectedGf(e.target.value)}
              className="w-full h-9 rounded-lg border border-white/[0.06] bg-background px-3 text-sm"
            >
              <option value="">Select a girlfriend...</option>
              {gfs.map(gf => (
                <option key={gf.id} value={gf.id}>{gf.name}</option>
              ))}
            </select>

            <Button
              onClick={handleExport}
              disabled={!selectedGf || exporting}
              className="w-full"
            >
              {exporting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
              {exporting ? 'Exporting...' : 'Export as PNG'}
            </Button>

            {error && !importing && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg flex items-start gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
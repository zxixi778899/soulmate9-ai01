'use client';
import { useTranslation } from '@/lib/i18n/context';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { APP_NAME } from '@/lib/constants';
import { authedFetch } from '@/lib/supabase';
import Image from 'next/image';
import { Heart, ArrowLeft, Sparkles, Lock, Users, MessageCircle, Music, Star, Shield, Loader2, AlertCircle, Dot, UserPlus, Check, Share2 } from 'lucide-react';
import { AgeVerification } from '@/components/AgeVerification';
import { useAuth } from '@/components/AuthProvider';
import { ShareCard } from '@/components/ShareCard';

interface PublicGirlfriend {
  id: string;
  name: string;
  age: number;
  slug: string;
  tags: string[];
  short_description: string;
  portrait_url: string | null;
  avatar_url?: string | null;
  image_url?: string | null;
  personality: string;
  character_card: any;
  backstory: string;
}

export default function GirlfriendPreviewPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useParams();
  const slug = params?.slug as string;
  const { user } = useAuth();
  const [girlfriend, setGirlfriend] = useState<PublicGirlfriend | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [addingFriend, setAddingFriend] = useState(false);
  const [addedFriend, setAddedFriend] = useState(false);
  const [addingThenChat, setAddingThenChat] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  useEffect(() => {
    if (!slug) return;
    const loadGirlfriend = async () => {
      try {
        const res = await fetch(`/api/girlfriends/public/${slug}`);
        const data = await res.json();
        if (data.girlfriend) setGirlfriend(data.girlfriend);
        else setError('AI companion not found');
      } catch {
        setError('Failed to load companion');
      } finally {
        setLoading(false);
      }
    };
    loadGirlfriend();
  }, [slug]);

  const addGirlfriendToCollection = async () => {
    setAddingFriend(true);
    try {
      const res = await authedFetch('/api/girlfriends/add-from-public', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug }),
      });
      const data = await res.json();
      if (res.ok) {
        setAddedFriend(true);
        return data.girlfriend;
      }
      return null;
    } catch {
      return null;
    } finally {
      setAddingFriend(false);
    }
  };

  const handleChat = async () => {
    if (!user) {
      router.push('/login');
      return;
    }
    setAddingThenChat(true);
    const gf = await addGirlfriendToCollection();
    if (gf) {
      router.push(`/chat/${gf.id}`);
    }
    setAddingThenChat(false);
  };

  const handleAddFriend = async () => {
    if (!user) {
      router.push('/login');
      return;
    }
    const gf = await addGirlfriendToCollection();
    if (gf) {
      router.push('/gallery');
    }
  };

  const handleCreateOwn = () => {
    if (user) {
      router.push('/create');
    } else {
      router.push('/register');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex">
        <div className="flex-1 flex items-center justify-center">
          <div className="space-y-6 w-full max-w-2xl px-6">
            <Skeleton className="h-[50vh] w-full rounded-xl bg-white/[0.03]" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !girlfriend) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="text-center text-[#a1a1aa]">
          <AlertCircle className="w-12 h-12 mx-auto mb-4" />
          <p className="text-lg">{error || 'Companion not found'}</p>
          <Button onClick={() => router.push('/')} variant="outline" className="mt-4">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Library
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <AgeVerification />
      <div className="min-h-screen bg-[#0a0a0f] text-[#fafafa] flex flex-col pb-20 md:pb-0">
        {/* Navbar */}
        <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-[#0a0a0f]/80 backdrop-blur-xl">
          <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#FF2D78] to-[#8b5cf6] flex items-center justify-center">
                <Heart className="w-4 h-4 text-white fill-white" />
              </div>
              <span className="font-semibold text-lg tracking-tight">{APP_NAME}</span>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                className="text-sm text-muted-foreground hover:text-foreground"
                onClick={() => router.push('/login')}
              >
                Sign In
              </Button>
              <Button
                onClick={() => router.push('/register')}
                className="bg-gradient-to-r from-[#FF2D78] to-[#8b5cf6] text-white text-sm font-medium h-9 px-5 rounded-lg hover:opacity-90"
              >
                Get Started
              </Button>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <div className="flex-1 flex flex-col lg:flex-row pt-16">
          {/* Left: Portrait Area */}
          <div className="lg:w-3/5 h-[45vh] lg:h-[calc(100vh-4rem)] bg-white/[0.02] border-b lg:border-b-0 lg:border-r border-white/[0.06] relative flex items-center justify-center overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-b from-white/[0.03] to-[#e11d48]/5" />
            <div className="relative z-10 flex flex-col items-center">
              {(() => {
                const imgUrl = girlfriend.image_url || girlfriend.portrait_url || girlfriend.avatar_url;
                return imgUrl ? (
                  <div className="relative w-40 h-40 md:w-56 md:h-56 rounded-full overflow-hidden border-4 border-white/[0.06]">
                    <Image
                      src={imgUrl}
                      alt={girlfriend.name}
                      fill
                      className="object-cover"
                      sizes="(max-width: 768px) 160px, 224px"
                      unoptimized={imgUrl.startsWith('data:')}
                    />
                  </div>
                ) : (
                  <div className="w-40 h-40 md:w-56 md:h-56 rounded-full bg-gradient-to-br from-[#FF2D78]/20 to-[#8b5cf6]/20 flex items-center justify-center border-4 border-white/[0.06]">
                    <Heart className="w-16 h-16 md:w-20 md:h-20 text-[#FF2D78]/40" />
                  </div>
                );
              })()}
              <div className="mt-6 text-center">
                <h1 className="text-2xl md:text-3xl font-bold">{girlfriend.name}, {girlfriend.age}</h1>
                <div className="flex items-center justify-center gap-1.5 mt-1">
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="text-green-400 text-sm">Online Now</span>
                </div>
              </div>
            </div>
            {/* Gradient overlay at bottom */}
            <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#0a0a0f] to-transparent lg:hidden" />
          </div>

          {/* Right: Details */}
          <div className="lg:w-2/5 p-6 md:p-8 lg:p-10 overflow-y-auto">
            {/* Back button */}
            <button
              onClick={() => router.push('/')}
              className="flex items-center gap-1.5 text-sm text-[#a1a1aa] hover:text-[#fafafa] transition-colors mb-6"
            >
              <ArrowLeft className="w-4 h-4" /> Back to library
            </button>

            {/* Tags */}
            <div className="flex flex-wrap gap-2">
              {girlfriend.tags?.map((tag: string) => (
                <Badge
                  key={tag}
                  variant="secondary"
                  className="bg-white/[0.06] text-[#a1a1aa] border-0 text-xs px-3 py-1 rounded-full font-normal hover:bg-white/[0.08]"
                >
                  {tag}
                </Badge>
              ))}
            </div>

            {/* Description */}
            <p className="mt-4 text-sm text-[#a1a1aa] leading-relaxed">
              {girlfriend.short_description || girlfriend?.character_card?.description || 'A unique AI companion waiting to meet you.'}
            </p>

            {/* About Her */}
            <div className="mt-8">
              <h3 className="text-sm font-semibold text-[#fafafa]">About Her</h3>
              <p className="mt-2 text-sm text-[#a1a1aa] leading-relaxed">
                {girlfriend.backstory || `${girlfriend.name} is a ${girlfriend.personality?.toLowerCase() || 'unique'} AI companion who loves deep conversations and meaningful connections.`}
              </p>
              <ul className="mt-4 space-y-2.5">
                {[
                  { icon: MessageCircle, text: 'Great conversationalist' },
                  { icon: Heart, text: 'Loves romantic evenings' },
                  { icon: Star, text: 'Always makes time for you' },
                  { icon: Music, text: 'Deep emotional connection' },
                ].map((item) => (
                  <li key={item.text} className="flex items-center gap-2.5 text-sm text-[#a1a1aa]">
                    <item.icon className="w-4 h-4 text-[#FF2D78]" />
                    {item.text}
                  </li>
                ))}
              </ul>
            </div>

            {/* Intimacy Preview */}
            <div className="mt-8">
              <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                <div className="h-full w-3/5 rounded-full bg-gradient-to-r from-[#FF2D78] to-[#8b5cf6]" />
              </div>
              <p className="text-xs text-[#a1a1aa] mt-2">Intimacy Level: Friend · 45/60</p>
            </div>

            {/* CTA Buttons */}
            <div className="mt-10 space-y-3">
              <Button
                onClick={handleChat}
                disabled={addingThenChat}
                className="w-full py-6 rounded-xl bg-gradient-to-r from-[#FF2D78] to-[#8b5cf6] text-white font-semibold hover:opacity-90 transition-opacity text-base"
              >
                {addingThenChat ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <MessageCircle className="w-4 h-4 mr-2" />
                )}
                {addingThenChat ? 'Connecting...' : 'Chat Now'}
              </Button>
              <div className="flex gap-3">
                <Button
                  onClick={() => setShareOpen(true)}
                  variant="outline"
                  className="flex-1 py-6 rounded-xl border-white/[0.12] text-[#fafafa] font-medium hover:bg-white/[0.04] text-base"
                >
                  <Share2 className="w-4 h-4 mr-2" />
                  Share
                </Button>
                <Button
                  onClick={handleAddFriend}
                  disabled={addingFriend || addedFriend}
                  variant="outline"
                  className="flex-1 py-6 rounded-xl border-white/[0.12] text-[#fafafa] font-medium hover:bg-white/[0.04] text-base"
                >
                {addedFriend ? (
                  <Check className="w-4 h-4 mr-2 text-green-400" />
                ) : addingFriend ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <UserPlus className="w-4 h-4 mr-2" />
                )}
                {addedFriend ? 'Added to My Girls' : 'Add Friend'}
              </Button>
              </div>
              <Button
                onClick={handleCreateOwn}
                variant="ghost"
                className="w-full py-6 rounded-xl text-[#a1a1aa] font-medium hover:text-[#fafafa] text-base"
              >
                <Sparkles className="w-4 h-4 mr-2" />
                Create Your Own
              </Button>
            </div>

            {/* Privacy */}
            <p className="mt-6 text-center text-xs text-[#a1a1aa]/50">
              <Shield className="w-3 h-3 inline mr-1" />
              Your conversations are private and encrypted.
            </p>
          </div>
        </div>
      </div>
      <ShareCard
        girlfriend={{
          name: girlfriend.name,
          age: girlfriend.age,
          tags: girlfriend.tags,
          short_description: girlfriend.short_description,
          personality: girlfriend.personality,
          portrait_url: girlfriend.image_url || girlfriend.portrait_url || girlfriend.avatar_url || null,
        }}
        open={shareOpen}
        onOpenChange={setShareOpen}
      />
    </>
  );
}
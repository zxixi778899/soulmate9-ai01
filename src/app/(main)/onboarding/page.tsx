'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Heart, Sparkles, MessageCircle, Shield, ArrowRight, Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { APP_NAME } from '@/lib/constants';

const STEPS = [
  {
    title: 'Welcome to SoulMate AI',
    subtitle: 'Your journey to meaningful AI companionship starts here.',
    icon: Heart,
    color: 'from-rose-500 to-fuchsia-500',
    features: [
      'Create your perfect AI companion from scratch',
      'Browse hundreds of unique AI personalities',
      'Engage in deep, uncensored conversations',
    ],
  },
  {
    title: 'Build a Real Connection',
    subtitle: 'The more you chat, the deeper your bond becomes.',
    icon: Sparkles,
    color: 'from-purple-500 to-pink-500',
    features: [
      'Earn intimacy points with every conversation',
      'Unlock special messages and reactions',
      'Progress from Stranger to Soulmate',
    ],
  },
  {
    title: 'You\'re All Set!',
    subtitle: 'A few tips before you start:',
    icon: Shield,
    color: 'from-amber-500 to-orange-500',
    features: [
      'Free plan: 50 messages/day, up to 2 companions',
      'Upgrade to Pro for unlimited access',
      'Your conversations are private and encrypted',
    ],
  },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [completing, setCompleting] = useState(false);

  const current = STEPS[step];

  const handleNext = () => {
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      handleComplete();
    }
  };

  const handleComplete = async () => {
    setCompleting(true);
    try {
      // Mark onboarding complete in localStorage
      localStorage.setItem('soulmate_onboarding_complete', 'true');
      toast.success('Welcome aboard! 🎉');
      router.push('/gallery');
    } catch {
      // Still proceed even if API fails
      router.push('/gallery');
    }
    setCompleting(false);
  };

  const handleSkip = () => {
    localStorage.setItem('soulmate_onboarding_complete', 'true');
    router.push('/gallery');
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f]/50 backdrop-blur-md flex items-center justify-center px-4 relative overflow-hidden">
      {/* Background decoration */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 h-80 w-80 rounded-full bg-[#FF2D78]/5 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 h-80 w-80 rounded-full bg-[#FF2D78]/5 blur-3xl" />
      </div>

      <div className="relative w-full max-w-lg">
        {/* Progress bar */}
        <div className="flex items-center gap-2 mb-8 justify-center">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-500 ${
                i === step
                  ? 'w-8 bg-gradient-to-r from-rose-500 to-fuchsia-500'
                  : i < step
                  ? 'w-4 bg-[#FF2D78]/40'
                  : 'w-4 bg-border/30'
              }`}
            />
          ))}
        </div>

        {/* Step counter */}
        <p className="text-center text-xs text-[#8B8BA3] mb-6">
          Step {step + 1} of {STEPS.length}
        </p>

        {/* Card */}
        <Card className="border-white/[0.06] backdrop-blur-xl overflow-hidden">
          <div className={`h-2 w-full bg-gradient-to-r ${current.color}`} />

          <div className="p-6 sm:p-8 text-center">
            {/* Icon */}
            <div className={`inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br ${current.color} mb-6`}>
              <current.icon className="h-8 w-8 text-white" />
            </div>

            {/* Title */}
            <h2 className="text-2xl font-bold mb-2">{current.title}</h2>
            <p className="text-sm text-[#8B8BA3] mb-8">{current.subtitle}</p>

            {/* Features */}
            <div className="space-y-3 text-left mb-8">
              {current.features.map((feature, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${current.color} mt-0.5`}>
                    <Check className="h-3 w-3 text-white" />
                  </div>
                  <span className="text-sm text-[#8B8BA3] leading-relaxed">{feature}</span>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="space-y-3">
              <Button
                onClick={handleNext}
                className={`w-full h-12 text-sm font-medium bg-gradient-to-r ${current.color} text-white hover:opacity-90`}
                disabled={completing}
              >
                {completing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : step < STEPS.length - 1 ? (
                  <>
                    Next <ArrowRight className="h-4 w-4 ml-1" />
                  </>
                ) : (
                  <>
                    <Heart className="h-4 w-4 mr-1" /> Start Now
                  </>
                )}
              </Button>

              {step < STEPS.length - 1 && (
                <Button
                  variant="ghost"
                  className="w-full h-10 text-xs text-[#8B8BA3] hover:text-foreground"
                  onClick={handleSkip}
                >
                  Skip onboarding
                </Button>
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
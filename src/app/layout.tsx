import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import { AuthProvider } from '@/components/AuthProvider';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { I18nProvider } from '@/lib/i18n/context';
import BottomNav from '@/components/BottomNav';
import GlobalTopNav from '@/components/GlobalTopNav';
import { PostHogProvider } from '@/components/PostHogProvider';
import { ServiceWorkerRegistrar } from '@/components/ServiceWorkerRegistrar';
import { Toaster } from '@/components/ui/sonner';
import { APP_NAME, APP_DESCRIPTION, APP_URL } from '@/lib/constants';
import './globals.css';

// Force all routes dynamic at build time  prevents prerender from triggering Supabase client init
// (build env doesn't have env vars, runtime does)
export const dynamic = 'force-dynamic';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
  themeColor: '#07070F',
};

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: `${APP_NAME}  Your AI Companion`,
    template: `%s  ${APP_NAME}`,
  },
  description: APP_DESCRIPTION,
  keywords: [
    'AI companion', 'AI girlfriend', 'virtual relationship',
    'NSFW AI chat', 'AI roleplay', 'AI dating', 'virtual companion',
  ],
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: `${APP_NAME}  Your AI Companion`,
    description: APP_DESCRIPTION,
    siteName: APP_NAME,
    url: APP_URL,
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: `${APP_NAME}  Your AI Companion`,
    description: APP_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: '/favicon.ico',
  },
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    title: 'SoulMate AI',
    statusBarStyle: 'black-translucent',
  },
  other: {
    'mobile-web-app-capable': 'yes',
    'supabase-url': 'https://vvblrkngzuyxeeoslzkl.supabase.co',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const gaId = process.env.NEXT_PUBLIC_GA_ID;

  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="antialiased relative font-sans">
        {/* Starry night background  global, behind all content */}
        <div className="starry-bg" aria-hidden="true">
          <div className="stars-sm" />
          <div className="stars-md" />
          <div className="stars-lg" />
          <div className="orb-pink" style={{ width: 360, height: 360, top: '8%', right: '4%' }} />
          <div className="orb-purple" style={{ width: 300, height: 300, bottom: '12%', left: '6%' }} />
          <div className="orb-pink" style={{ width: 220, height: 220, top: '50%', left: '45%', opacity: 0.4, animationDelay: '-4s' }} />
        </div>

        {gaId && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
              strategy="afterInteractive"
            />
            <Script id="ga-init" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${gaId}', {
                  page_path: window.location.pathname,
                });
              `}
            </Script>
          </>
        )}
        <PostHogProvider>
          <AuthProvider>
            <I18nProvider>
              <GlobalTopNav />
              <ErrorBoundary>
                {children}
              </ErrorBoundary>
              <Toaster position="top-center" richColors />
              <BottomNav />
            </I18nProvider>
          </AuthProvider>
        </PostHogProvider>
        <ServiceWorkerRegistrar />
        <Script id="h5-reveal" strategy="afterInteractive">{`
          (function(){
            if (typeof window === 'undefined' || !('IntersectionObserver' in window)) return;
            var io = new IntersectionObserver(function(entries){
              entries.forEach(function(e){
                if (e.isIntersecting) {
                  e.target.classList.add('h5-in');
                  io.unobserve(e.target);
                }
              });
            }, { threshold: 0.12, rootMargin: '0px 0px -10% 0px' });
            function scan(){
              document.querySelectorAll('.h5-reveal:not(.h5-in)').forEach(function(n){ io.observe(n); });
            }
            scan();
            new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
          })();
        `}</Script>
        <Script id="app-init" strategy="afterInteractive">{`
          (function(){
            try {
              // Mark PWA-ready
              if ('serviceWorker' in navigator) {
                document.documentElement.classList.add('pwa-capable');
              }
            } catch(e){}
          })();
        `}</Script>
      </body>
    </html>
  );
}

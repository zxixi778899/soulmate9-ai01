import Link from 'next/link';
import { APP_NAME } from '@/lib/constants';
import { getSupabaseClient } from '@/storage/database/supabase-client';

type FooterSettings = {
  site_name: string;
  footer_tagline: string;
  telegram_url: string;
  x_url: string;
  discord_url: string;
  support_email: string;
};

async function getFooterSettings(): Promise<FooterSettings> {
  const fallback: FooterSettings = {
    site_name: APP_NAME,
    footer_tagline: 'AI companions that remember, grow, and connect with you on a deeper level.',
    telegram_url: '',
    x_url: '',
    discord_url: '',
    support_email: '',
  };
  try {
    const supabase = getSupabaseClient();
    const keys = Object.keys(fallback);
    const { data, error } = await supabase
      .from('site_settings')
      .select('key, value')
      .in('key', keys);
    if (error || !data?.length) return fallback;
    const map: Record<string, unknown> = {};
    for (const row of data) map[row.key] = row.value;
    return { ...fallback, ...map } as FooterSettings;
  } catch {
    return fallback;
  }
}

export async function Footer() {
  const s = await getFooterSettings();

  const footerLinks: Record<string, { label: string; href: string }[]> = {
    Product: [
      { label: 'Characters', href: '/' },
      { label: 'Pricing', href: '/pricing' },
      { label: 'Features', href: '/#features' },
    ],
    Company: [
      { label: 'About', href: '/p/about' },
      { label: 'Blog', href: '/p/blog' },
      { label: 'Contact', href: '/p/contact' },
    ],
    Legal: [
      { label: 'Privacy Policy', href: '/privacy' },
      { label: 'Terms of Service', href: '/terms' },
    ],
  };

  // Add social links dynamically if configured
  const socialLinks: { label: string; href: string }[] = [];
  if (s.telegram_url) socialLinks.push({ label: 'Telegram', href: s.telegram_url });
  if (s.x_url) socialLinks.push({ label: 'X (Twitter)', href: s.x_url });
  if (s.discord_url) socialLinks.push({ label: 'Discord', href: s.discord_url });
  if (s.support_email) socialLinks.push({ label: 'Email Support', href: `mailto:${s.support_email}` });

  return (
    <footer className="relative border-t border-white/[0.06] py-12 md:py-16 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-12">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="font-display text-xl text-white mb-3 block">
              {s.site_name}
            </Link>
            <p className="text-white/35 text-sm leading-relaxed max-w-xs">
              {s.footer_tagline}
            </p>
          </div>

          {/* Link columns */}
          {Object.entries(footerLinks).map(([category, links]) => (
            <div key={category}>
              <h4 className="font-heading text-sm font-semibold text-white/70 mb-4 uppercase tracking-wider">
                {category}
              </h4>
              <ul className="space-y-2.5">
                {links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm text-white/35 hover:text-white/70 transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* Social / Support links from admin settings */}
          {socialLinks.length > 0 && (
            <div>
              <h4 className="font-heading text-sm font-semibold text-white/70 mb-4 uppercase tracking-wider">
                Connect
              </h4>
              <ul className="space-y-2.5">
                {socialLinks.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-white/35 hover:text-white/70 transition-colors"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Bottom bar */}
        <div className="flex flex-col md:flex-row items-center justify-between pt-8 border-t border-white/[0.06]">
          <p className="text-white/25 text-xs">
            &copy; {new Date().getFullYear()} {s.site_name}. All rights reserved.
          </p>
          <p className="text-white/20 text-xs mt-2 md:mt-0">
            All characters are fictional and 18+.
          </p>
        </div>
      </div>
    </footer>
  );
}

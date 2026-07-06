import Link from 'next/link';
import { APP_NAME } from '@/lib/constants';

const footerLinks = {
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

export function Footer() {
  return (
    <footer className="relative border-t border-white/[0.06] py-12 md:py-16 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="font-display text-xl text-white mb-3 block">
              {APP_NAME}
            </Link>
            <p className="text-white/35 text-sm leading-relaxed max-w-xs">
              AI companions that remember, grow, and connect with you on a deeper level.
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
        </div>

        {/* Bottom bar */}
        <div className="flex flex-col md:flex-row items-center justify-between pt-8 border-t border-white/[0.06]">
          <p className="text-white/25 text-xs">
            &copy; {new Date().getFullYear()} {APP_NAME}. All rights reserved.
          </p>
          <p className="text-white/20 text-xs mt-2 md:mt-0">
            All characters are fictional and 18+.
          </p>
        </div>
      </div>
    </footer>
  );
}

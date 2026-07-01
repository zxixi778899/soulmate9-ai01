'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

type NavItem = {
  id: string;
  label: string;
  url: string;
  sort_order: number;
  parent_id: string | null;
  is_visible: boolean;
};

export default function DynamicNav() {
  const [items, setItems] = useState<NavItem[]>([]);
  const pathname = usePathname();

  useEffect(() => {
    const fetchNav = async () => {
      try {
        const res = await fetch('/api/navigation');
        const data = await res.json();
        setItems(data.items || []);
      } catch (e) {
        // silently fail
      }
    };
    fetchNav();
  }, []);

  const topItems = items.filter(i => !i.parent_id && i.is_visible);

  if (topItems.length === 0) return null;

  return (
    <nav className="hidden md:flex items-center gap-1">
      {topItems.map(item => (
        <Link
          key={item.id}
          href={item.url}
          className={`px-3 py-2 text-sm rounded-lg transition-colors ${
            pathname === item.url
              ? 'text-primary bg-primary/10'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted'
          }`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
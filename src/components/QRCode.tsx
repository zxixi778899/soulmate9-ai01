'use client';
import { useEffect, useState } from 'react';

export function QRCode({ value, size = 160 }: { value: string; size?: number }) {
  const [dataUrl, setDataUrl] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    import('qrcode').then((QRCode) => {
      if (cancelled) return;
      QRCode.toDataURL(value, {
        width: size * 2,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
      }).then((url: string) => {
        if (!cancelled) setDataUrl(url);
      }).catch(() => {});
    });
    return () => { cancelled = true; };
  }, [value, size]);

  if (!dataUrl) {
    return <div style={{ width: size, height: size, background: '#f5f5f5', borderRadius: 8 }} />;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={dataUrl} alt="QR" width={size} height={size} className="block rounded" />
  );
}

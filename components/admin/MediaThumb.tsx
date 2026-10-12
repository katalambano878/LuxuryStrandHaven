'use client';

import { useState } from 'react';
import { displayImageUrl } from '@/lib/media-url';

export default function MediaThumb({
  src,
  className = 'w-full h-full object-cover',
}: {
  src?: string | null;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const shown = src ? displayImageUrl(src) : '';

  if (!shown || failed) {
    return (
      <div className="w-full h-full bg-gray-100 flex items-center justify-center">
        <i className="ri-image-line text-gray-300 text-xl" aria-hidden />
      </div>
    );
  }

  return (
    <img
      src={shown}
      alt=""
      className={className}
      onError={() => setFailed(true)}
    />
  );
}

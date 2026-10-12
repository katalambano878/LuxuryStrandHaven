'use client';

import { useState, useCallback } from 'react';
import Image from 'next/image';
import { isVideoUrl, posterUrl } from '@/lib/media-url';

interface LazyImageProps {
  src: string;
  alt: string;
  className?: string;
  width?: number;
  height?: number;
  priority?: boolean;
  onLoad?: () => void;
  sizes?: string;
}

export default function LazyImage({
  src,
  alt,
  className = '',
  width,
  height,
  priority = false,
  onLoad,
  sizes = '(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw'
}: LazyImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  const handleLoad = useCallback(() => {
    setIsLoaded(true);
    onLoad?.();
  }, [onLoad]);

  const handleError = useCallback(() => {
    setHasError(true);
    setIsLoaded(true);
    onLoad?.();
  }, [onLoad]);

  const isVideo = src ? isVideoUrl(src) : false;

  if (!src || hasError) {
    return (
      <div className={`relative overflow-hidden bg-gray-100 flex items-center justify-center ${className}`} style={{ width, height }}>
        <span className="text-gray-400 text-xs">{isVideo ? 'Video' : 'No Image'}</span>
      </div>
    );
  }

  if (isVideo) {
    return (
      <div className={`relative overflow-hidden bg-gray-100 ${className}`} style={{ width, height }}>
        <img
          src={posterUrl(src)}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
        />
        <video
          src={src}
          poster={posterUrl(src)}
          muted
          autoPlay
          loop
          playsInline
          preload="metadata"
          className="absolute inset-0 w-full h-full object-cover"
          onLoadedData={handleLoad}
        />
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden ${className}`} style={{ width, height }}>
      {!isLoaded && (
        <div className="absolute inset-0 bg-gray-200 animate-pulse z-10" />
      )}
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        className={`object-cover transition-opacity duration-300 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
        onLoad={handleLoad}
        onError={handleError}
        priority={priority}
        quality={75}
      />
    </div>
  );
}

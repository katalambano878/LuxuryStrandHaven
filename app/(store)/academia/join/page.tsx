'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

function JoinClass() {
  const searchParams = useSearchParams();
  const order = searchParams.get('order');
  const [message, setMessage] = useState('Confirming your payment…');
  const [classUrl, setClassUrl] = useState('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!order) {
      setFailed(true);
      setMessage('This payment link is missing a reference.');
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/academia/join', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderNumber: order }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok || !data.success || !data.url) {
          setFailed(true);
          setMessage(data.message || 'Payment was not confirmed.');
          return;
        }
        setClassUrl(data.url);
        setMessage(`Payment received. Opening ${data.title || 'your class'}…`);
        window.location.href = data.url;
      } catch {
        if (!cancelled) {
          setFailed(true);
          setMessage('Could not confirm the payment. Please try again.');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [order]);

  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center px-6">
      <div className="max-w-md text-center">
        {!failed ? (
          <i className="ri-loader-4-line text-4xl text-amber-400 animate-spin mb-4 block" />
        ) : (
          <i className="ri-error-warning-line text-4xl text-red-400 mb-4 block" />
        )}
        <h1 className="font-serif text-3xl mb-3">{failed ? 'Payment not completed' : 'You are in'}</h1>
        <p className="text-white/70 mb-8">{message}</p>
        {classUrl ? (
          <a
            href={classUrl}
            className="inline-flex items-center gap-2 bg-sky-500 hover:bg-sky-400 text-white font-bold px-6 py-3 rounded-full"
          >
            <i className="ri-telegram-line text-lg" />
            Open the class on Telegram
          </a>
        ) : null}
        <div className="mt-6">
          <Link href="/academia" className="text-sm text-white/50 hover:text-white">
            Back to Academia
          </Link>
        </div>
      </div>
    </main>
  );
}

export default function AcademiaJoinPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-black" />}>
      <JoinClass />
    </Suspense>
  );
}

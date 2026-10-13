'use client';

import { useState } from 'react';

export type PayableCourse = {
  id: string;
  title: string;
  price: number;
};

export function coursePublicPath(id: string) {
  return `/academia/course/${id}`;
}

export function coursePublicUrl(id: string) {
  if (typeof window === 'undefined') return coursePublicPath(id);
  return `${window.location.origin}${coursePublicPath(id)}`;
}

export async function copyCourseLink(id: string) {
  const url = coursePublicUrl(id);
  try {
    await navigator.clipboard.writeText(url);
  } catch {
    window.prompt('Copy this course link:', url);
  }
  return url;
}

export default function CourseCheckout({
  course,
  onClose,
}: {
  course: PayableCourse;
  onClose: () => void;
}) {
  const [form, setForm] = useState({ name: '', email: '', phone: '' });
  const [error, setError] = useState('');
  const [paying, setPaying] = useState(false);
  const price = Number(course.price) || 0;
  const priceLabel = price > 0 ? `GH₵ ${price.toFixed(2)}` : 'Free';

  async function startPayment(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setPaying(true);
    try {
      const res = await fetch('/api/academia/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courseId: course.id,
          name: form.name,
          email: form.email,
          phone: form.phone,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success || !data.url) {
        setError(data.message || 'Could not start payment.');
        setPaying(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      setError('Could not start payment. Please try again.');
      setPaying(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-4">
      <form onSubmit={startPayment} className="w-full max-w-md bg-zinc-950 border border-white/10 rounded-2xl p-6 text-left">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <p className="text-amber-400 text-xs font-bold tracking-widest uppercase">Online class</p>
            <h2 className="font-serif text-2xl text-white mt-1">{course.title}</h2>
            <p className="text-white/60 text-sm mt-1">
              {price > 0
                ? `Pay ${priceLabel}, then we will open the Telegram class.`
                : 'Enter your details and we will open the class.'}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-white/50 hover:text-white" aria-label="Close">
            <i className="ri-close-line text-2xl" />
          </button>
        </div>
        <div className="space-y-3">
          <input
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Your name"
            className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-amber-500"
          />
          <input
            required
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="Email address"
            className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-amber-500"
          />
          <input
            required
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            placeholder="Mobile money number"
            className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-amber-500"
          />
        </div>
        {error ? <p className="text-red-400 text-sm mt-3">{error}</p> : null}
        <button
          type="submit"
          disabled={paying}
          className="mt-5 w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-black font-bold py-3 rounded-full"
        >
          {paying ? 'Opening payment…' : price > 0 ? `Pay ${priceLabel}` : 'Continue'}
        </button>
      </form>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import CourseCheckout, { copyCourseLink } from '@/components/academia/CourseCheckout';

type Course = {
  id: string;
  title: string;
  description: string | null;
  icon: string | null;
  price: number;
  thumbnail_url: string | null;
  status: string;
};

export default function CourseDetailPage() {
  const params = useParams<{ id: string }>();
  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('academia_courses')
        .select('id, title, description, icon, price, thumbnail_url, status')
        .eq('id', params.id)
        .eq('status', 'active')
        .single();
      setCourse(data ?? null);
      setLoading(false);
    }
    if (params.id) load();
  }, [params.id]);

  const price = Number(course?.price) || 0;
  const priceLabel = price > 0 ? `GH₵ ${price.toFixed(2)}` : 'Free';

  return (
    <main className="min-h-screen bg-[#0c0a09] text-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-6 pb-20">
        <Link href="/academia" className="inline-flex items-center gap-2 text-sm text-white/55 hover:text-white">
          <i className="ri-arrow-left-line" />
          All classes
        </Link>

        {loading ? (
          <div className="mt-8 grid lg:grid-cols-2 gap-10">
            <div className="aspect-[4/5] rounded-3xl bg-white/5 animate-pulse" />
            <div className="space-y-4 pt-6">
              <div className="h-4 w-32 rounded bg-white/10" />
              <div className="h-12 w-4/5 rounded bg-white/10" />
              <div className="h-24 rounded bg-white/5" />
            </div>
          </div>
        ) : !course ? (
          <div className="py-24 text-center">
            <h1 className="font-serif text-4xl">Class not found</h1>
            <Link href="/academia" className="mt-4 inline-block text-amber-300">Back to Academia</Link>
          </div>
        ) : (
          <div className="mt-6 grid items-start gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-14">
            <div className="overflow-hidden rounded-3xl border border-white/10 bg-[#161311] lg:sticky lg:top-24">
              {course.thumbnail_url ? (
                <img src={course.thumbnail_url} alt="" className="w-full object-cover" />
              ) : (
                <div className="flex aspect-[4/5] items-center justify-center text-7xl">{course.icon || '📚'}</div>
              )}
            </div>

            <div className="lg:py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-amber-300">Online class</p>
              <h1 className="mt-3 font-serif text-4xl sm:text-5xl lg:text-6xl leading-[1.02]">
                {course.title}
              </h1>
              <p className="mt-5 font-serif text-3xl text-amber-200">{priceLabel}</p>

              <div className="mt-8 max-w-xl whitespace-pre-line text-base sm:text-lg leading-relaxed text-white/75">
                {course.description || 'Details for this class will be added soon.'}
              </div>

              <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <p className="text-sm font-semibold text-white">How you join</p>
                <ol className="mt-3 space-y-2 text-sm leading-relaxed text-white/65">
                  <li>1. Pay for the class on this page.</li>
                  <li>2. We confirm the payment.</li>
                  <li>3. You are taken straight to the Telegram class.</li>
                </ol>
              </div>

              <div className="mt-8 flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={() => setPaying(true)}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-amber-400 px-7 py-3.5 text-sm font-bold text-black hover:bg-amber-300"
                >
                  <i className="ri-secure-payment-line text-lg" />
                  {price > 0 ? `Pay ${priceLabel}` : 'Join class'}
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await copyCourseLink(course.id);
                    setCopied(true);
                  }}
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-white/15 px-7 py-3.5 text-sm font-semibold text-white hover:border-amber-300"
                >
                  <i className="ri-share-forward-line" />
                  {copied ? 'Link copied' : 'Share class'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {paying && course ? <CourseCheckout course={course} onClose={() => setPaying(false)} /> : null}
    </main>
  );
}

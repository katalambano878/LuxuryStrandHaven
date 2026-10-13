'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
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
    <main className="min-h-screen bg-black text-white">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-16 pb-24 text-center">
        <Link href="/" className="inline-block mb-8">
          <Image src="/haven%20logo%20white.png" alt="Luxury Strand Haven" width={120} height={60} className="object-contain" />
        </Link>

        {loading ? (
          <p className="text-white/50">Loading class…</p>
        ) : !course ? (
          <div>
            <h1 className="font-serif text-4xl mb-4">Class not found</h1>
            <Link href="/academia" className="text-amber-400">Back to Academia</Link>
          </div>
        ) : (
          <>
            <h1 className="font-serif text-4xl sm:text-6xl font-bold leading-tight mb-6">
              {course.title}
            </h1>
            <p className="text-white/70 text-lg sm:text-xl leading-relaxed max-w-2xl mx-auto mb-8 whitespace-pre-line">
              {course.description || 'Details for this class will be added soon.'}
            </p>
            {course.thumbnail_url ? (
              <img src={course.thumbnail_url} alt="" className="w-full rounded-2xl mb-8 object-cover max-h-[520px]" />
            ) : null}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setPaying(true)}
                className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-black font-bold px-6 py-3 rounded-full"
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
                className="inline-flex items-center gap-2 border border-white/20 text-white px-6 py-3 rounded-full"
              >
                <i className="ri-link" />
                {copied ? 'Link copied' : 'Copy link'}
              </button>
            </div>
            <p className="text-white/40 text-sm mt-4">
              {price > 0 ? 'After payment you will be taken to the class on Telegram.' : 'This class is free.'}
            </p>
          </>
        )}
      </div>
      {paying && course ? (
        <CourseCheckout course={course} onClose={() => setPaying(false)} />
      ) : null}
    </main>
  );
}

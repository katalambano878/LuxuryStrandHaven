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

function formatPrice(price: number) {
  if (!price || price <= 0) return 'Free';
  return `GH₵${Number(price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

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

  return (
    <main className="min-h-screen bg-white">
      <div className="bg-gray-50 border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <nav className="flex items-center gap-2 text-sm text-gray-600">
            <Link href="/" className="hover:text-gray-900">Home</Link>
            <i className="ri-arrow-right-s-line text-gray-400" />
            <Link href="/academia" className="hover:text-gray-900">Academia</Link>
            {course ? (
              <>
                <i className="ri-arrow-right-s-line text-gray-400" />
                <span className="text-gray-900 font-medium truncate">{course.title}</span>
              </>
            ) : null}
          </nav>
        </div>
      </div>

      <section className="py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          {loading ? (
            <div className="grid lg:grid-cols-2 gap-12">
              <div className="aspect-square bg-gray-100 animate-pulse" />
              <div className="space-y-4">
                <div className="h-4 w-24 bg-gray-100" />
                <div className="h-12 w-3/4 bg-gray-100" />
                <div className="h-24 bg-gray-50" />
              </div>
            </div>
          ) : !course ? (
            <div className="py-20 text-center">
              <h1 className="font-serif text-4xl text-gray-900 mb-4">Class not found</h1>
              <Link href="/academia" className="text-gray-900 font-semibold">Back to Academia</Link>
            </div>
          ) : (
            <div className="grid lg:grid-cols-2 gap-12 items-start">
              <div className="bg-gray-100 overflow-hidden">
                {course.thumbnail_url ? (
                  <img src={course.thumbnail_url} alt="" className="w-full object-cover object-top" />
                ) : (
                  <div className="aspect-square flex items-center justify-center text-6xl">{course.icon || '📚'}</div>
                )}
              </div>

              <div>
                <span className="text-gray-500 font-bold tracking-widest uppercase text-xs mb-3 block">Online class</span>
                <h1 className="font-serif text-4xl md:text-5xl text-gray-900 leading-tight mb-4">{course.title}</h1>
                <p className="font-sans text-3xl font-bold text-gray-900 mb-8">{formatPrice(price)}</p>
                <div className="text-gray-600 text-lg font-light leading-relaxed whitespace-pre-line max-w-xl">
                  {course.description || 'Details for this class will be added soon.'}
                </div>

                <div className="mt-8 border border-gray-200 p-5 max-w-xl">
                  <p className="text-sm font-semibold text-gray-900 mb-2">How you join</p>
                  <p className="text-sm text-gray-600 font-light leading-relaxed">
                    Pay on this page. Once the payment is confirmed, you are taken to the Telegram class.
                  </p>
                </div>

                <div className="mt-8 flex flex-col sm:flex-row gap-3 max-w-xl">
                  <button
                    type="button"
                    onClick={() => setPaying(true)}
                    className="flex-1 bg-gray-900 text-white py-4 px-6 font-semibold hover:bg-gray-800"
                  >
                    {price > 0 ? `Pay ${formatPrice(price)}` : 'Join class'}
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await copyCourseLink(course.id);
                      setCopied(true);
                    }}
                    className="border border-black py-4 px-6 font-medium text-gray-900 hover:bg-black hover:text-white transition-colors"
                  >
                    {copied ? 'Link copied' : 'Share class'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {paying && course ? <CourseCheckout course={course} onClose={() => setPaying(false)} /> : null}
    </main>
  );
}

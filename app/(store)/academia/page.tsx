'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useCMS } from '@/context/CMSContext';

type Course = {
  id: string;
  title: string;
  description: string | null;
  icon: string | null;
  price: number;
  thumbnail_url: string | null;
};

function formatPrice(price: number) {
  if (!price || price <= 0) return 'Free';
  return `GH₵${Number(price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function AcademiaPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const { getSetting } = useCMS();
  const intro = getSetting('academia_intro') || "Ghana's premier online hair education platform. Learn wig making, HD lace, hair business and more — from industry experts.";

  useEffect(() => {
    async function load() {
      try {
        const { data, error } = await supabase
          .from('academia_courses')
          .select('id, title, description, icon, price, thumbnail_url')
          .eq('status', 'active')
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: false });
        if (!error) setCourses(data ?? []);
      } catch {
        // keep empty
      } finally {
        setCoursesLoading(false);
      }
    }
    load();
  }, []);

  function handleNotify(e: React.FormEvent) {
    e.preventDefault();
    if (email.trim()) {
      setSubmitted(true);
      setEmail('');
    }
  }

  return (
    <main className="min-h-screen bg-white">
      <section className="py-16 md:py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <span className="text-gray-500 font-bold tracking-widest uppercase text-xs mb-3 block">Online classes</span>
          <h1 className="font-serif text-4xl md:text-5xl lg:text-6xl text-gray-900 mb-4">Hair Academia</h1>
          <p className="text-gray-600 text-lg max-w-2xl font-light whitespace-pre-line">{intro}</p>
        </div>
      </section>

      <section className="pb-24 bg-stone-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16">
          <div className="flex items-end justify-between mb-12">
            <div>
              <span className="text-gray-500 font-bold tracking-widest uppercase text-xs mb-3 block">Classes</span>
              <h2 className="font-serif text-4xl md:text-5xl text-gray-900">Online courses</h2>
            </div>
            {!coursesLoading && (
              <p className="text-sm text-gray-500">{courses.length} {courses.length === 1 ? 'class' : 'classes'}</p>
            )}
          </div>

          {coursesLoading ? (
            <div className="grid lg:grid-cols-2 gap-6">
              {[0, 1].map((item) => (
                <div key={item} className="h-56 bg-white border border-gray-200 animate-pulse" />
              ))}
            </div>
          ) : courses.length === 0 ? (
            <p className="text-gray-500 font-light">Classes will appear here once they are published.</p>
          ) : (
            <div className="grid lg:grid-cols-2 gap-6">
              {courses.map((course) => {
                const price = Number(course.price) || 0;
                return (
                  <article key={course.id} className="flex flex-col sm:flex-row bg-white border border-gray-200 overflow-hidden">
                    <Link
                      href={`/academia/course/${course.id}`}
                      className="relative sm:w-[42%] aspect-[16/10] sm:aspect-auto sm:min-h-[220px] bg-gray-100 shrink-0"
                    >
                      {course.thumbnail_url ? (
                        <img src={course.thumbnail_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
                      ) : (
                        <span className="absolute inset-0 flex items-center justify-center text-4xl">{course.icon || '📚'}</span>
                      )}
                    </Link>
                    <div className="flex flex-1 flex-col p-5 sm:p-6">
                      <span className="text-gray-500 font-bold tracking-widest uppercase text-[11px]">Online class</span>
                      <h3 className="font-serif text-2xl text-gray-900 leading-tight mt-2">
                        <Link href={`/academia/course/${course.id}`} className="hover:underline">
                          {course.title}
                        </Link>
                      </h3>
                      <p className="text-gray-600 text-sm font-light leading-relaxed mt-3 line-clamp-3">
                        {course.description || 'Open the class page to read what is included.'}
                      </p>
                      <div className="mt-auto pt-5 flex items-center justify-between gap-4">
                        <p className="text-lg font-bold text-gray-900">{formatPrice(price)}</p>
                        <Link
                          href={`/academia/course/${course.id}`}
                          className="bg-gray-900 text-white px-5 py-2.5 text-sm font-semibold hover:bg-gray-800"
                        >
                          {price > 0 ? 'Enroll' : 'Join class'}
                        </Link>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          <div className="mt-20 max-w-xl">
            <span className="text-gray-500 font-bold tracking-widest uppercase text-xs mb-3 block">Updates</span>
            <h3 className="font-serif text-3xl text-gray-900 mb-3">Hear about the next class</h3>
            {submitted ? (
              <p className="text-gray-600 font-light">You are on the list.</p>
            ) : (
              <form onSubmit={handleNotify} className="flex flex-col sm:flex-row gap-2">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email address"
                  required
                  className="flex-1 border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:border-gray-900"
                />
                <button type="submit" className="bg-gray-900 text-white px-6 py-3 text-sm font-semibold hover:bg-gray-800">
                  Notify me
                </button>
              </form>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

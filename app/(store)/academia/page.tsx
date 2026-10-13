'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import CourseCheckout from '@/components/academia/CourseCheckout';
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
  return price > 0 ? `GH₵ ${Number(price).toFixed(2)}` : 'Free';
}

export default function AcademiaPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [payCourse, setPayCourse] = useState<Course | null>(null);
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
    <main className="min-h-screen bg-[#0c0a09] text-white">
      <section className="relative overflow-hidden border-b border-white/10">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -top-32 left-1/2 h-72 w-[40rem] -translate-x-1/2 rounded-full bg-amber-500/10 blur-3xl" />
        </div>
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-14 pb-12 sm:pt-20 sm:pb-16">
          <p className="text-amber-300 text-[11px] font-semibold tracking-[0.28em] uppercase">Luxury Strand Haven</p>
          <h1 className="font-serif text-5xl sm:text-6xl lg:text-7xl mt-4 leading-[0.95]">
            Hair <span className="text-amber-300">Academia</span>
          </h1>
          <p className="mt-6 max-w-2xl text-base sm:text-lg leading-relaxed text-white/70 whitespace-pre-line">
            {intro}
          </p>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <div className="flex items-end justify-between gap-4 mb-8">
          <div>
            <p className="text-amber-300/80 text-[11px] font-semibold tracking-[0.22em] uppercase">Classes</p>
            <h2 className="font-serif text-3xl sm:text-4xl mt-2">Online courses</h2>
          </div>
          <p className="hidden sm:block text-sm text-white/45">{courses.length} {courses.length === 1 ? 'class' : 'classes'}</p>
        </div>

        {coursesLoading ? (
          <div className="grid sm:grid-cols-2 gap-6">
            {[0, 1].map((item) => (
              <div key={item} className="h-[28rem] rounded-3xl bg-white/5 animate-pulse" />
            ))}
          </div>
        ) : courses.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-white/5 px-6 py-16 text-center text-white/60">
            Classes will appear here once they are published.
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-6 lg:gap-8">
            {courses.map((course) => {
              const price = Number(course.price) || 0;
              return (
                <article key={course.id} className="group flex flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#161311] shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
                  <Link href={`/academia/course/${course.id}`} className="relative block aspect-[4/3] overflow-hidden bg-[#221c16]">
                    {course.thumbnail_url ? (
                      <img
                        src={course.thumbnail_url}
                        alt=""
                        className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.03]"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-6xl">{course.icon || '📚'}</div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#161311] via-transparent to-black/10" />
                    <span className="absolute left-4 top-4 rounded-full bg-black/70 px-3 py-1 text-[11px] font-semibold tracking-wide text-amber-200 backdrop-blur">
                      Online class
                    </span>
                    <span className="absolute right-4 top-4 rounded-full bg-amber-400 px-3 py-1 text-sm font-bold text-black">
                      {formatPrice(price)}
                    </span>
                  </Link>

                  <div className="flex flex-1 flex-col px-5 pb-5 pt-4 sm:px-6 sm:pb-6">
                    <h3 className="font-serif text-2xl sm:text-[1.7rem] leading-tight text-white">
                      <Link href={`/academia/course/${course.id}`} className="hover:text-amber-200">
                        {course.title}
                      </Link>
                    </h3>
                    <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-white/60">
                      {course.description || 'Open the class page to see what you will learn.'}
                    </p>
                    <div className="mt-6 flex items-center gap-3">
                      <Link
                        href={`/academia/course/${course.id}`}
                        className="inline-flex flex-1 items-center justify-center rounded-full bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-amber-200"
                      >
                        View class
                      </Link>
                      <button
                        type="button"
                        onClick={() => setPayCourse(course)}
                        className="inline-flex items-center justify-center rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-white transition hover:border-amber-300 hover:text-amber-200"
                      >
                        {price > 0 ? 'Pay now' : 'Join'}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        <div className="mt-16 max-w-xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/40">New classes</p>
          <h3 className="font-serif text-2xl mt-2">Get a note when the next class opens</h3>
          {submitted ? (
            <p className="mt-4 text-amber-200">You are on the list.</p>
          ) : (
            <form onSubmit={handleNotify} className="mt-4 flex flex-col sm:flex-row gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email address"
                required
                className="flex-1 rounded-full border border-white/15 bg-white/5 px-5 py-3 text-sm outline-none focus:border-amber-400"
              />
              <button type="submit" className="rounded-full bg-amber-400 px-6 py-3 text-sm font-bold text-black">
                Notify me
              </button>
            </form>
          )}
        </div>
      </section>

      {payCourse ? <CourseCheckout course={payCourse} onClose={() => setPayCourse(null)} /> : null}
    </main>
  );
}

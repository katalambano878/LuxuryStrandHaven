'use client';

import { useEffect, useState } from 'react';
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
  if (!price || price <= 0) return 'Free';
  return `GH₵${Number(price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {[0, 1, 2, 3].map((item) => (
                <div key={item} className="animate-pulse">
                  <div className="bg-gray-200 aspect-[3/4] mb-4" />
                  <div className="h-4 bg-gray-200 w-3/4 mb-2" />
                  <div className="h-4 bg-gray-200 w-1/2" />
                </div>
              ))}
            </div>
          ) : courses.length === 0 ? (
            <p className="text-gray-500 font-light">Classes will appear here once they are published.</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 lg:gap-8">
              {courses.map((course) => {
                const price = Number(course.price) || 0;
                return (
                  <article key={course.id} className="group bg-white h-full flex flex-col">
                    <Link href={`/academia/course/${course.id}`} className="relative block aspect-[3/4] overflow-hidden bg-gray-100">
                      {course.thumbnail_url ? (
                        <img
                          src={course.thumbnail_url}
                          alt=""
                          className="w-full h-full object-cover object-top transition-transform duration-500 group-hover:scale-[1.02]"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-5xl">{course.icon || '📚'}</div>
                      )}
                      <span className="absolute top-3 left-3 bg-white/90 text-gray-900 text-[10px] uppercase tracking-wider font-semibold px-2.5 py-1">
                        Class
                      </span>
                    </Link>
                    <div className="flex flex-col flex-grow pt-4 pb-2 text-left">
                      <Link href={`/academia/course/${course.id}`}>
                        <h3 className="font-serif text-[1.05rem] leading-snug text-black font-medium line-clamp-2 group-hover:underline">
                          {course.title}
                        </h3>
                      </Link>
                      <p className="text-sm text-gray-500 font-light mt-2 line-clamp-2">
                        {course.description || 'Open the class to read the details.'}
                      </p>
                      <p className="font-sans text-xl font-bold text-black mt-3 mb-3">{formatPrice(price)}</p>
                      <div className="mt-auto grid grid-cols-1 gap-2">
                        <Link
                          href={`/academia/course/${course.id}`}
                          className="w-full border border-black py-3 px-4 text-center text-black font-medium text-sm hover:bg-black hover:text-white transition-colors"
                        >
                          View class
                        </Link>
                        <button
                          type="button"
                          onClick={() => setPayCourse(course)}
                          className="w-full bg-gray-900 py-3 px-4 text-center text-white font-medium text-sm hover:bg-gray-800 transition-colors"
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

      {payCourse ? <CourseCheckout course={payCourse} onClose={() => setPayCourse(null)} /> : null}
    </main>
  );
}

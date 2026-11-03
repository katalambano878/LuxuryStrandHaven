import Link from 'next/link';
import type { Metadata } from 'next';
import { supabaseAdmin } from '@/lib/supabase-admin';

// Rendered per request: builds have no database access.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Blog',
  description: 'Hair care tips, wig guides and news from Luxury Strand Haven.',
};

type PostCard = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  featured_image: string | null;
  published_at: string | null;
  created_at: string;
};

function formatDate(value: string | null) {
  if (!value) return '';
  return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default async function BlogPage() {
  const { data } = await supabaseAdmin
    .from('blog_posts')
    .select('id, slug, title, excerpt, featured_image, published_at, created_at')
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(60);
  const posts: PostCard[] = data || [];
  const [featured, ...rest] = posts;

  return (
    <div className="min-h-screen bg-white">
      <div className="bg-gradient-to-br from-gray-50 via-white to-amber-50 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">Our Blog</h1>
            <p className="text-lg md:text-xl text-gray-600 leading-relaxed">
              Hair care tips, wig guides and news from the studio.
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        {!featured ? (
          <div className="text-center py-16">
            <i className="ri-article-line text-5xl text-gray-300 block mb-4"></i>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">No articles yet</h2>
            <p className="text-gray-600 mb-6">We&apos;re writing our first posts. In the meantime, have a look at the shop.</p>
            <Link href="/shop" className="inline-block bg-gray-900 hover:bg-gray-800 text-white px-6 py-3 rounded-lg font-semibold">
              Visit the shop
            </Link>
          </div>
        ) : (
          <>
            <Link href={`/blog/${featured.slug || featured.id}`} className="block mb-16 hover:opacity-90 transition-opacity">
              <article className="bg-white border border-gray-200 rounded-3xl overflow-hidden shadow-lg">
                <div className="grid md:grid-cols-2">
                  <div className="relative h-72 md:h-auto bg-gray-100">
                    {featured.featured_image && (
                      <img src={featured.featured_image} alt="" className="w-full h-full object-cover" />
                    )}
                  </div>
                  <div className="p-8 md:p-12 flex flex-col justify-center">
                    <p className="text-sm text-gray-500 mb-4">{formatDate(featured.published_at || featured.created_at)}</p>
                    <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4 leading-tight">{featured.title}</h2>
                    {featured.excerpt && <p className="text-gray-600 text-lg leading-relaxed">{featured.excerpt}</p>}
                  </div>
                </div>
              </article>
            </Link>

            {rest.length > 0 && (
              <>
                <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-8">Latest Articles</h2>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
                  {rest.map((post) => (
                    <Link
                      key={post.id}
                      href={`/blog/${post.slug || post.id}`}
                      className="bg-white border border-gray-200 rounded-2xl overflow-hidden hover:shadow-lg transition-shadow"
                    >
                      <div className="h-56 bg-gray-100">
                        {post.featured_image && <img src={post.featured_image} alt="" className="w-full h-full object-cover" />}
                      </div>
                      <div className="p-6">
                        <p className="text-xs text-gray-500 mb-2">{formatDate(post.published_at || post.created_at)}</p>
                        <h3 className="text-xl font-bold text-gray-900 mb-3 leading-tight">{post.title}</h3>
                        {post.excerpt && <p className="text-gray-600 text-sm leading-relaxed">{post.excerpt}</p>}
                      </div>
                    </Link>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { escapeHtml, sanitizeHtml } from '@/lib/sanitize';

// Rendered per request: builds have no database access.
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function getPost(idOrSlug: string) {
  const { data } = await supabaseAdmin
    .from('blog_posts')
    .select('id, slug, title, excerpt, content, featured_image, published_at, created_at, seo_title, seo_description')
    .eq(UUID.test(idOrSlug) ? 'id' : 'slug', idOrSlug)
    .eq('status', 'published')
    .maybeSingle();
  return data;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const post = await getPost(id);
  if (!post) return { title: 'Article not found', robots: { index: false } };
  return {
    title: post.seo_title || post.title,
    description: post.seo_description || post.excerpt || undefined,
    openGraph: post.featured_image ? { images: [post.featured_image] } : undefined,
  };
}

export default async function BlogPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const post = await getPost(id);
  if (!post) notFound();

  // Plain-text articles get paragraphs from blank lines.
  const raw = post.content || '';
  const html = /<[a-z][\s\S]*>/i.test(raw)
    ? sanitizeHtml(raw)
    : raw
        .split(/\n{2,}/)
        .map((para: string) => `<p>${escapeHtml(para).replace(/\n/g, '<br>')}</p>`)
        .join('');

  const date = new Date(post.published_at || post.created_at).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <article className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 md:py-16">
        <Link href="/blog" className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 mb-8">
          <i className="ri-arrow-left-line mr-2"></i>
          All articles
        </Link>
        <p className="text-sm text-gray-500 mb-3">{date}</p>
        <h1 className="text-3xl md:text-5xl font-bold text-gray-900 leading-tight mb-6">{post.title}</h1>
        {post.excerpt && <p className="text-lg text-gray-600 leading-relaxed mb-8">{post.excerpt}</p>}
        {post.featured_image && (
          <img src={post.featured_image} alt="" className="w-full rounded-2xl mb-10 object-cover max-h-[480px]" />
        )}
        <div
          className="prose prose-lg max-w-none text-gray-800 [&_a]:underline [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:mt-8 [&_h2]:mb-4 [&_p]:mb-4 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </article>
  );
}

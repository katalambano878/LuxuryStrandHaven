'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import ImageUpload from '@/components/admin/ImageUpload';

const inputClass = 'w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600';

type Post = {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string;
  featured_image: string | null;
  status: 'draft' | 'published' | 'archived';
  published_at: string | null;
  seo_title: string | null;
  seo_description: string | null;
  updated_at: string;
};

const emptyForm = {
  title: '',
  slug: '',
  excerpt: '',
  content: '',
  featured_image: '',
  status: 'draft' as Post['status'],
  seo_title: '',
  seo_description: '',
};

function slugify(text: string) {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_-]+/g, '-')
    .slice(0, 80);
}

export default function AdminBlogPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [slugTouched, setSlugTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  async function loadPosts() {
    setLoading(true);
    const { data, error: loadError } = await supabase
      .from('blog_posts')
      .select('id, title, slug, excerpt, content, featured_image, status, published_at, seo_title, seo_description, updated_at')
      .order('updated_at', { ascending: false });
    if (loadError) setError(loadError.message);
    setPosts((data as Post[]) || []);
    setLoading(false);
  }

  useEffect(() => {
    loadPosts();
  }, []);

  function openNew() {
    setEditingId(null);
    setForm(emptyForm);
    setSlugTouched(false);
    setError('');
    setShowEditor(true);
  }

  function openEdit(post: Post) {
    setEditingId(post.id);
    setForm({
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt || '',
      content: post.content || '',
      featured_image: post.featured_image || '',
      status: post.status,
      seo_title: post.seo_title || '',
      seo_description: post.seo_description || '',
    });
    setSlugTouched(true);
    setError('');
    setShowEditor(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const slug = slugify(form.slug || form.title);
    if (!form.title.trim() || !slug) {
      setError('Add a title first.');
      return;
    }
    if (!form.content.trim()) {
      setError('Write the article before saving.');
      return;
    }
    setSaving(true);
    setError('');
    const existing = posts.find((p) => p.id === editingId);
    const row = {
      title: form.title.trim(),
      slug,
      excerpt: form.excerpt.trim() || null,
      content: form.content,
      featured_image: form.featured_image || null,
      status: form.status,
      seo_title: form.seo_title.trim() || null,
      seo_description: form.seo_description.trim() || null,
      // First publish stamps the date; later edits keep it.
      published_at:
        form.status === 'published' ? existing?.published_at || new Date().toISOString() : existing?.published_at || null,
      updated_at: new Date().toISOString(),
    };
    const { error: saveError } = editingId
      ? await supabase.from('blog_posts').update(row).eq('id', editingId)
      : await supabase.from('blog_posts').insert(row);
    setSaving(false);
    if (saveError) {
      setError(
        /duplicate|unique/i.test(saveError.message)
          ? 'Another article already uses this web address (slug). Change it and save again.'
          : saveError.message
      );
      return;
    }
    setShowEditor(false);
    loadPosts();
  }

  async function handleDelete(post: Post) {
    if (!confirm(`Delete "${post.title}"? This cannot be undone.`)) return;
    const { error: deleteError } = await supabase.from('blog_posts').delete().eq('id', post.id);
    if (deleteError) {
      alert('Could not delete: ' + deleteError.message);
      return;
    }
    loadPosts();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-1">Blog</h1>
          <p className="text-gray-600">Published articles appear on the public blog page.</p>
        </div>
        <button
          type="button"
          onClick={openNew}
          className="inline-flex items-center justify-center gap-2 bg-gray-900 hover:bg-gray-800 text-white px-5 py-3 rounded-lg font-semibold"
        >
          <i className="ri-add-line"></i>
          New article
        </button>
      </div>

      {error && !showEditor && <p className="text-sm text-red-600" role="alert">{error}</p>}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <p className="p-8 text-center text-gray-500">Loading articles…</p>
        ) : posts.length === 0 ? (
          <div className="p-12 text-center">
            <i className="ri-article-line text-4xl text-gray-300 block mb-3"></i>
            <p className="text-gray-600">No articles yet. Write your first one.</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {posts.map((post) => (
              <li key={post.id} className="flex flex-col sm:flex-row sm:items-center gap-3 p-4">
                <div className="w-full sm:w-20 h-32 sm:h-14 rounded-lg bg-gray-100 overflow-hidden shrink-0">
                  {post.featured_image && <img src={post.featured_image} alt="" className="w-full h-full object-cover" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 truncate">{post.title}</p>
                  <p className="text-xs text-gray-500">
                    /blog/{post.slug} · updated {new Date(post.updated_at).toLocaleDateString('en-GB')}
                  </p>
                </div>
                <span
                  className={`self-start sm:self-center text-xs font-semibold px-2.5 py-1 rounded-full ${
                    post.status === 'published' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {post.status === 'published' ? 'Published' : post.status === 'archived' ? 'Archived' : 'Draft'}
                </span>
                <div className="flex gap-2">
                  {post.status === 'published' && (
                    <a
                      href={`/blog/${post.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-2 text-sm rounded-lg border border-gray-300 hover:border-gray-500"
                    >
                      View
                    </a>
                  )}
                  <button type="button" onClick={() => openEdit(post)} className="px-3 py-2 text-sm rounded-lg border border-gray-300 hover:border-gray-500">
                    Edit
                  </button>
                  <button type="button" onClick={() => handleDelete(post)} className="px-3 py-2 text-sm rounded-lg border border-red-200 text-red-700 hover:border-red-400">
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {showEditor && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center overflow-y-auto p-4" role="dialog" aria-modal="true" aria-labelledby="blog-editor-title">
          <form onSubmit={handleSave} className="bg-white rounded-2xl w-full max-w-3xl my-8 p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 id="blog-editor-title" className="text-xl font-bold text-gray-900">{editingId ? 'Edit article' : 'New article'}</h2>
              <button type="button" onClick={() => setShowEditor(false)} aria-label="Close" className="w-9 h-9 rounded-lg hover:bg-gray-100">
                <i className="ri-close-line text-xl"></i>
              </button>
            </div>

            <div>
              <label htmlFor="post-title" className="block text-sm font-semibold text-gray-900 mb-1">Title</label>
              <input
                id="post-title"
                className={inputClass}
                value={form.title}
                onChange={(e) => {
                  const title = e.target.value;
                  setForm((f) => ({ ...f, title, slug: slugTouched ? f.slug : slugify(title) }));
                }}
              />
            </div>
            <div>
              <label htmlFor="post-slug" className="block text-sm font-semibold text-gray-900 mb-1">Web address</label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">/blog/</span>
                <input
                  id="post-slug"
                  className={inputClass}
                  value={form.slug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    setForm((f) => ({ ...f, slug: e.target.value }));
                  }}
                  onBlur={() => setForm((f) => ({ ...f, slug: slugify(f.slug) }))}
                />
              </div>
            </div>
            <div>
              <label htmlFor="post-excerpt" className="block text-sm font-semibold text-gray-900 mb-1">Short summary</label>
              <textarea id="post-excerpt" rows={2} className={inputClass} value={form.excerpt} onChange={(e) => setForm((f) => ({ ...f, excerpt: e.target.value }))} />
            </div>
            <ImageUpload
              label="Cover image"
              value={form.featured_image}
              onChange={(url) => setForm((f) => ({ ...f, featured_image: url }))}
              bucket="media"
              folder="blog"
              accept="image/jpeg,image/png,image/webp"
            />
            <div>
              <label htmlFor="post-content" className="block text-sm font-semibold text-gray-900 mb-1">Article</label>
              <p className="text-xs text-gray-500 mb-2">Plain text or simple HTML (headings, bold, links, lists, images).</p>
              <textarea id="post-content" rows={14} className={`${inputClass} font-mono text-sm`} value={form.content} onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))} />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="post-seo-title" className="block text-sm font-semibold text-gray-900 mb-1">Search title (optional)</label>
                <input id="post-seo-title" className={inputClass} value={form.seo_title} onChange={(e) => setForm((f) => ({ ...f, seo_title: e.target.value }))} />
              </div>
              <div>
                <label htmlFor="post-status" className="block text-sm font-semibold text-gray-900 mb-1">Status</label>
                <select id="post-status" className={inputClass} value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as Post['status'] }))}>
                  <option value="draft">Draft (hidden)</option>
                  <option value="published">Published</option>
                  <option value="archived">Archived (hidden)</option>
                </select>
              </div>
            </div>
            <div>
              <label htmlFor="post-seo-desc" className="block text-sm font-semibold text-gray-900 mb-1">Search description (optional)</label>
              <textarea id="post-seo-desc" rows={2} className={inputClass} value={form.seo_description} onChange={(e) => setForm((f) => ({ ...f, seo_description: e.target.value }))} />
            </div>

            {error && <p className="text-sm text-red-600" role="alert">{error}</p>}

            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setShowEditor(false)} className="px-5 py-2.5 rounded-lg border border-gray-300">
                Cancel
              </button>
              <button type="submit" disabled={saving} className="px-5 py-2.5 rounded-lg bg-gray-900 text-white font-semibold disabled:opacity-60">
                {saving ? 'Saving…' : 'Save article'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

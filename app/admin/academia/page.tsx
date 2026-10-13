'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import ImageUpload from '@/components/admin/ImageUpload';
import { copyCourseLink, coursePublicUrl } from '@/components/academia/CourseCheckout';

const inputClass = 'w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600';

export default function AdminAcademiaPage() {
  const [courses, setCourses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [intro, setIntro] = useState('');
  const [introSaving, setIntroSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: '',
    description: '',
    icon: '📚',
    price: '',
    youtube_url: '',
    telegram_url: '',
    thumbnail_url: '',
    status: 'active',
  });

  const fetchCourses = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('academia_courses')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false });
      if (error) throw error;
      setCourses(data ?? []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCourses();
    supabase.from('store_settings').select('value').eq('key', 'academia_intro').maybeSingle().then(({ data }) => {
      const value = data?.value;
      setIntro(typeof value === 'string' ? value : value ? String(value).replace(/^"|"$/g, '') : '');
    });
  }, []);

  const saveIntro = async () => {
    setIntroSaving(true);
    const { error } = await supabase.from('store_settings').upsert(
      { key: 'academia_intro', value: intro, description: 'Intro text on the Academia page' },
      { onConflict: 'key' }
    );
    setIntroSaving(false);
    if (error) alert('Could not save the page description: ' + error.message);
  };

  const openAdd = () => {
    setEditingId(null);
    setForm({ title: '', description: '', icon: '📚', price: '', youtube_url: '', telegram_url: '', thumbnail_url: '', status: 'active' });
    setShowModal(true);
  };

  const openEdit = (c: any) => {
    setEditingId(c.id);
    setForm({
      title: c.title ?? '',
      description: c.description ?? '',
      icon: c.icon ?? '📚',
      price: c.price != null ? String(c.price) : '',
      youtube_url: c.youtube_url ?? '',
      telegram_url: c.telegram_url ?? '',
      thumbnail_url: c.thumbnail_url ?? '',
      status: c.status ?? 'active',
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) {
      alert('Title is required');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        icon: form.icon.trim() || '📚',
        price: form.price ? parseFloat(form.price) : 0,
        youtube_url: form.youtube_url.trim() || null,
        telegram_url: form.telegram_url.trim() || null,
        thumbnail_url: form.thumbnail_url.trim() || null,
        status: form.status,
      };
      let savedId = editingId;
      if (editingId) {
        const { error } = await supabase.from('academia_courses').update(payload).eq('id', editingId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('academia_courses').insert([payload]).select('id').single();
        if (error) throw error;
        savedId = data?.id ?? null;
      }
      setShowModal(false);
      setShareId(savedId);
      setCopied(false);
      fetchCourses();
    } catch (err: any) {
      alert('Error saving: ' + (err.message ?? 'Unknown'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this course? This cannot be undone.')) return;
    try {
      const { error } = await supabase.from('academia_courses').delete().eq('id', id);
      if (error) throw error;
      setCourses(courses.filter(c => c.id !== id));
    } catch (err: any) {
      alert('Error deleting: ' + (err.message ?? 'Unknown'));
    }
  };

  const formatPrice = (p: number) => {
    if (p == null || p === 0) return 'Free';
    return `GH₵ ${Number(p).toFixed(2)}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Academia</h1>
          <p className="text-gray-600 mt-1">Manage online courses — price, thumbnail, YouTube and Telegram links</p>
        </div>
        <button
          onClick={openAdd}
          className="bg-gray-900 hover:bg-gray-800 text-white px-6 py-3 rounded-lg font-semibold transition-colors inline-flex items-center gap-2"
        >
          <i className="ri-add-line" />
          Add Course
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Page description</h2>
          <p className="text-sm text-gray-500">This is the paragraph under “Hair Academia” on the public page.</p>
        </div>
        <textarea
          value={intro}
          onChange={(e) => setIntro(e.target.value)}
          rows={4}
          className={inputClass + ' resize-none'}
          placeholder="Ghana's premier online hair education platform..."
        />
        <button
          type="button"
          onClick={saveIntro}
          disabled={introSaving}
          className="bg-gray-900 text-white px-4 py-2 rounded-lg font-semibold disabled:opacity-60"
        >
          {introSaving ? 'Saving…' : 'Save page description'}
        </button>
      </div>

      {shareId ? (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p className="font-semibold text-green-900">Course link</p>
            <p className="text-sm text-green-800 break-all">{coursePublicUrl(shareId)}</p>
          </div>
          <button
            type="button"
            onClick={async () => {
              await copyCourseLink(shareId);
              setCopied(true);
            }}
            className="shrink-0 bg-gray-900 text-white px-4 py-2 rounded-lg font-semibold"
          >
            {copied ? 'Copied' : 'Copy link'}
          </button>
        </div>
      ) : null}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm text-gray-600">Total Courses</p>
          <p className="text-2xl font-bold text-gray-900">{courses.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm text-gray-600">Active</p>
          <p className="text-2xl font-bold text-green-700">{courses.filter(c => c.status === 'active').length}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-500">Loading courses…</div>
        ) : courses.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            No courses yet. Add one to show on the <a href="/academia" target="_blank" rel="noopener noreferrer" className="text-gray-900 underline">Academia page</a>.
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Course</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Price</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Links</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Status</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {courses.map((c) => (
                <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      {c.thumbnail_url ? (
                        <img src={c.thumbnail_url} alt="" className="w-12 h-12 rounded-lg object-cover bg-gray-100" />
                      ) : (
                        <span className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center text-xl">{c.icon || '📚'}</span>
                      )}
                      <div>
                        <span className="font-medium text-gray-900">{c.title}</span>
                        <p className="text-sm text-gray-500 line-clamp-2 mt-1">{c.description || 'No description yet'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-gray-700">{formatPrice(c.price)}</td>
                  <td className="py-3 px-4">
                    <div className="flex flex-col gap-1">
                      {c.youtube_url ? (
                        <a href={c.youtube_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-sm">
                          YouTube
                        </a>
                      ) : null}
                      {c.telegram_url ? (
                        <a href={c.telegram_url} target="_blank" rel="noopener noreferrer" className="text-sky-600 hover:underline text-sm">
                          Telegram
                        </a>
                      ) : null}
                      {!c.youtube_url && !c.telegram_url ? <span className="text-gray-400">—</span> : null}
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${c.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          await copyCourseLink(c.id);
                          setShareId(c.id);
                          setCopied(true);
                        }}
                        className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg"
                        title="Copy course link"
                      >
                        <i className="ri-share-line" />
                      </button>
                      <button onClick={() => openEdit(c)} className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg">
                        <i className="ri-edit-line" />
                      </button>
                      <button onClick={() => handleDelete(c.id)} className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg">
                        <i className="ri-delete-bin-line" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">{editingId ? 'Edit Course' : 'Add Course'}</h2>
              <button onClick={() => setShowModal(false)} className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg">
                <i className="ri-close-line text-xl" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Title *</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className={inputClass}
                  placeholder="e.g. Wig Making Masterclass"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Course description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className={inputClass + ' resize-none'}
                  rows={6}
                  placeholder="This is the text people see under the class title. Explain who the class is for and what they will learn."
                />
                <p className="text-xs text-gray-500 mt-1">Shown on the class page and on the Academia list. You can edit it any time.</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Icon (emoji)</label>
                  <input
                    type="text"
                    value={form.icon}
                    onChange={(e) => setForm({ ...form, icon: e.target.value })}
                    className={inputClass}
                    placeholder="📚"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Price (GH₵)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: e.target.value })}
                    className={inputClass}
                    placeholder="0 = Free"
                  />
                </div>
              </div>
              <div>
                <ImageUpload
                  label="Thumbnail"
                  description="Cover image shown on the Academia page. Square or portrait works best."
                  value={form.thumbnail_url}
                  onChange={(url) => {
                    const path = url.match(/\/storage\/v1\/object\/public\/.+$/)?.[0] || url;
                    setForm({ ...form, thumbnail_url: path });
                  }}
                  bucket="site-assets"
                  folder="academia"
                  previewHeight={160}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">YouTube URL</label>
                <input
                  type="url"
                  value={form.youtube_url}
                  onChange={(e) => setForm({ ...form, youtube_url: e.target.value })}
                  className={inputClass}
                  placeholder="https://youtube.com/..."
                />
                <p className="text-xs text-gray-500 mt-1">The store button opens this link.</p>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Telegram URL</label>
                <input
                  type="url"
                  value={form.telegram_url}
                  onChange={(e) => setForm({ ...form, telegram_url: e.target.value })}
                  className={inputClass}
                  placeholder="https://t.me/..."
                />
                <p className="text-xs text-gray-500 mt-1">Group, channel, or chat link. Optional.</p>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Status</label>
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                  className={inputClass}
                >
                  <option value="active">Active</option>
                  <option value="draft">Draft</option>
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="px-4 py-2 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 disabled:opacity-60">
                  {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Add Course'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

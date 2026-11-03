'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

type CategoryNode = {
  id: string;
  name: string;
  slug: string;
  description?: string;
  image_url?: string;
  parent_id: string | null;
  status: string;
  metadata?: any;
  created_at?: string;
  children: CategoryNode[];
};

type FlatRow = { category: CategoryNode; depth: number };

function buildTree(cats: any[]): CategoryNode[] {
  const map = new Map<string, CategoryNode>();
  cats.forEach(c => map.set(c.id, { ...c, children: [] }));
  const roots: CategoryNode[] = [];
  map.forEach(node => {
    if (node.parent_id && map.has(node.parent_id)) {
      map.get(node.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  });
  const sortChildren = (nodes: CategoryNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    nodes.forEach(n => sortChildren(n.children));
  };
  sortChildren(roots);
  return roots;
}

function flattenTree(nodes: CategoryNode[], depth = 0): FlatRow[] {
  const rows: FlatRow[] = [];
  nodes.forEach(node => {
    rows.push({ category: node, depth });
    rows.push(...flattenTree(node.children, depth + 1));
  });
  return rows;
}

function getDescendantIds(cat: CategoryNode): string[] {
  const ids: string[] = [];
  cat.children.forEach(c => {
    ids.push(c.id);
    ids.push(...getDescendantIds(c));
  });
  return ids;
}

export default function AdminCategoriesPage() {
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<any>(null);

  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    description: '',
    image_url: '',
    parent_id: '' as string | null,
    featured: false,
    status: 'active'
  });

  useEffect(() => { fetchCategories(); }, []);

  const fetchCategories = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('name', { ascending: true });
      if (error) throw error;
      if (data) setCategories(data);
    } catch (err) {
      console.error('Error fetching categories:', err);
    } finally {
      setLoading(false);
    }
  };

  const tree = buildTree(categories);
  const flatRows = flattenTree(tree);

  const visibleRows = flatRows.filter(row => {
    let parentId = row.category.parent_id;
    while (parentId) {
      if (collapsed.has(parentId)) return false;
      const parent = categories.find(c => c.id === parentId);
      parentId = parent?.parent_id || null;
    }
    return true;
  });

  const toggleCollapse = (id: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const parentCount = categories.filter(c => !c.parent_id).length;
  const subCount = categories.filter(c => c.parent_id).length;

  const treeForDropdown = useCallback(() => {
    const t = buildTree(categories);
    const excludeIds = new Set<string>();
    if (editingCategory) {
      excludeIds.add(editingCategory.id);
      const node = flatRows.find(r => r.category.id === editingCategory.id);
      if (node) getDescendantIds(node.category).forEach(id => excludeIds.add(id));
    }
    const opts: { id: string; name: string; depth: number }[] = [];
    const walk = (nodes: CategoryNode[], depth: number) => {
      nodes.forEach(n => {
        if (!excludeIds.has(n.id)) {
          opts.push({ id: n.id, name: n.name, depth });
          walk(n.children, depth + 1);
        }
      });
    };
    walk(t, 0);
    return opts;
  }, [categories, editingCategory, flatRows]);

  const handleEdit = (category: any) => {
    setEditingCategory(category);
    setFormData({
      name: category.name,
      slug: category.slug,
      description: category.description || '',
      image_url: category.image_url || '',
      parent_id: category.parent_id || '',
      featured: category.metadata?.featured || false,
      status: category.status
    });
    setShowEditModal(true);
  };

  const openAddSub = (parentId: string) => {
    setEditingCategory(null);
    setFormData({ name: '', slug: '', description: '', image_url: '', parent_id: parentId, featured: false, status: 'active' });
    setShowAddModal(true);
  };

  const handleDelete = async (categoryId: string) => {
    const category = categories.find(c => c.id === categoryId);
    const childCount = categories.filter(c => c.parent_id === categoryId).length;
    const message = childCount > 0
      ? `"${category?.name}" has ${childCount} subcategory(ies). They will be moved to the top level, then this category will be deleted. Continue?`
      : 'Are you sure you want to delete this category? This action cannot be undone.';
    if (!confirm(message)) return;
    try {
      // Products still point at this category; deleting it would fail half-way.
      const { count: productCount, error: countError } = await supabase
        .from('products')
        .select('id', { count: 'exact', head: true })
        .eq('category_id', categoryId);
      if (countError) throw countError;
      if (productCount && productCount > 0) {
        alert(`${productCount} product(s) are in this category. Move them to another category first, then delete it.`);
        return;
      }
      if (childCount > 0) {
        const { error: unlinkError } = await supabase
          .from('categories')
          .update({ parent_id: null })
          .eq('parent_id', categoryId);
        if (unlinkError) throw unlinkError;
      }
      const { error: linkError } = await supabase.from('product_category_links').delete().eq('category_id', categoryId);
      if (linkError) throw linkError;
      const { error } = await supabase.from('categories').delete().eq('id', categoryId);
      if (error) throw error;
      setCategories(prev => prev.filter(c => c.id !== categoryId));
      alert('Category deleted successfully');
    } catch (err: any) {
      alert('Error deleting: ' + (err.message || 'Unknown error'));
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      if (!e.target.files || e.target.files.length === 0) return;
      setUploading(true);
      const file = e.target.files[0];
      const fileExt = file.name.split('.').pop();
      const fileName = `cat-${Math.random()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from('products').upload(fileName, file);
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('products').getPublicUrl(fileName);
      setFormData(prev => ({ ...prev, image_url: publicUrl }));
    } catch (error: any) {
      alert('Error uploading image: ' + error.message);
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async () => {
    if (!formData.name || !formData.slug) {
      alert('Name and Slug are required');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: formData.name,
        slug: formData.slug,
        description: formData.description,
        image_url: formData.image_url,
        parent_id: formData.parent_id || null,
        status: formData.status,
        // Keep any other metadata the category already has.
        metadata: { ...((showEditModal && editingCategory?.metadata) || {}), featured: formData.featured }
      };

      if (showEditModal && editingCategory) {
        const { error } = await supabase.from('categories').update(payload).eq('id', editingCategory.id);
        if (error) throw error;
        alert('Category updated');
      } else {
        const { error } = await supabase.from('categories').insert([payload]);
        if (error) throw error;
        alert('Category created');
      }

      setShowAddModal(false);
      setShowEditModal(false);
      setEditingCategory(null);
      setFormData({ name: '', slug: '', description: '', image_url: '', parent_id: '', featured: false, status: 'active' });
      fetchCategories();
    } catch (err: any) {
      console.error(err);
      alert('Error saving category: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (showAddModal && formData.name && !editingCategory) {
      setFormData(prev => ({
        ...prev,
        slug: prev.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '')
      }));
    }
  }, [formData.name, showAddModal, editingCategory]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Categories</h1>
          <p className="text-gray-600 mt-1">Organize your products into categories and subcategories</p>
        </div>
        <button
          onClick={() => {
            setEditingCategory(null);
            setFormData({ name: '', slug: '', description: '', image_url: '', parent_id: '', featured: false, status: 'active' });
            setShowAddModal(true);
          }}
          className="bg-gray-900 hover:bg-gray-800 text-white px-6 py-3 rounded-lg font-semibold transition-colors whitespace-nowrap cursor-pointer"
        >
          <i className="ri-add-line mr-2"></i>
          Add Category
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border-2 border-gray-200 p-4">
          <p className="text-sm text-gray-600 mb-1">Total Categories</p>
          <p className="text-2xl font-bold text-gray-900">{categories.length}</p>
        </div>
        <div className="bg-white rounded-xl border-2 border-gray-200 p-4">
          <p className="text-sm text-gray-600 mb-1">Parent Categories</p>
          <p className="text-2xl font-bold text-gray-900">{parentCount}</p>
        </div>
        <div className="bg-white rounded-xl border-2 border-gray-200 p-4">
          <p className="text-sm text-gray-600 mb-1">Subcategories</p>
          <p className="text-2xl font-bold text-gray-900">{subCount}</p>
        </div>
        <div className="bg-white rounded-xl border-2 border-gray-200 p-4">
          <p className="text-sm text-gray-600 mb-1">Featured</p>
          <p className="text-2xl font-bold text-blue-700">{categories.filter(c => c.metadata?.featured).length}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Category</th>
                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Slug</th>
                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Status</th>
                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Featured</th>
                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="p-8 text-center text-gray-500">Loading categories...</td></tr>
              ) : visibleRows.length === 0 ? (
                <tr><td colSpan={5} className="p-8 text-center text-gray-500">No categories found. Create one to get started!</td></tr>
              ) : (
                visibleRows.map(({ category, depth }) => {
                  const hasChildren = category.children.length > 0;
                  const isCollapsed = collapsed.has(category.id);
                  return (
                    <tr key={category.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center" style={{ paddingLeft: `${depth * 28}px` }}>
                          {hasChildren ? (
                            <button
                              onClick={() => toggleCollapse(category.id)}
                              className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-700 mr-2 flex-shrink-0 cursor-pointer"
                            >
                              <i className={`${isCollapsed ? 'ri-arrow-right-s-line' : 'ri-arrow-down-s-line'} text-lg`}></i>
                            </button>
                          ) : (
                            <span className="w-6 mr-2 flex-shrink-0 flex items-center justify-center text-gray-300">
                              {depth > 0 ? <i className="ri-corner-down-right-line text-sm"></i> : ''}
                            </span>
                          )}
                          <div className="w-10 h-10 bg-gray-100 rounded-lg overflow-hidden border border-gray-200 flex-shrink-0 mr-3">
                            {category.image_url ? (
                              <img src={category.image_url} alt={category.name} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-gray-400">
                                <i className={`${depth === 0 ? 'ri-folder-line' : 'ri-file-line'} text-base`}></i>
                              </div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <span className={`font-semibold text-gray-900 block truncate ${depth === 0 ? 'text-base' : 'text-sm'}`}>
                              {category.name}
                            </span>
                            {hasChildren && (
                              <span className="text-xs text-gray-500">
                                {category.children.length} subcategor{category.children.length === 1 ? 'y' : 'ies'}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-gray-600 text-sm font-mono">{category.slug}</td>
                      <td className="py-3 px-4">
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap capitalize ${
                          category.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600'
                        }`}>
                          {category.status}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {category.metadata?.featured ? (
                          <span className="px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-semibold whitespace-nowrap">Featured</span>
                        ) : (
                          <span className="text-gray-400 text-sm">-</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center space-x-1">
                          {depth === 0 && (
                            <button
                              onClick={() => openAddSub(category.id)}
                              title="Add subcategory"
                              className="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                            >
                              <i className="ri-node-tree text-lg"></i>
                            </button>
                          )}
                          <button
                            onClick={() => handleEdit(category)}
                            className="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                          >
                            <i className="ri-edit-line text-lg"></i>
                          </button>
                          <button
                            onClick={() => handleDelete(category.id)}
                            className="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                          >
                            <i className="ri-delete-bin-line text-lg"></i>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {(showAddModal || showEditModal) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white z-10">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">
                  {showAddModal ? 'Add New Category' : 'Edit Category'}
                </h2>
                {showAddModal && formData.parent_id && (
                  <p className="text-sm text-gray-500 mt-1">
                    Creating subcategory under <span className="font-medium text-gray-700">{categories.find(c => c.id === formData.parent_id)?.name}</span>
                  </p>
                )}
              </div>
              <button
                onClick={() => { setShowAddModal(false); setShowEditModal(false); setEditingCategory(null); }}
                className="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
              >
                <i className="ri-close-line text-2xl"></i>
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">Category Name *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600"
                    placeholder="Enter category name"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">Parent Category</label>
                  <select
                    value={formData.parent_id || ''}
                    onChange={(e) => setFormData({ ...formData, parent_id: e.target.value || null })}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600"
                  >
                    <option value="">None (Top Level)</option>
                    {treeForDropdown().map(opt => (
                      <option key={opt.id} value={opt.id}>
                        {'—'.repeat(opt.depth)} {opt.depth > 0 ? ' ' : ''}{opt.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">URL Slug *</label>
                <input
                  type="text"
                  value={formData.slug}
                  onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600"
                  placeholder="category-url-slug"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">Description</label>
                <textarea
                  rows={3}
                  maxLength={500}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600 resize-none"
                  placeholder="Brief description of this category..."
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">Category Image</label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-gray-900 hover:bg-gray-50 transition-colors relative">
                  {uploading ? (
                    <div className="flex flex-col items-center">
                      <i className="ri-loader-4-line animate-spin text-3xl mb-2 text-gray-900"></i>
                      <span className="text-sm font-medium text-gray-600">Uploading...</span>
                    </div>
                  ) : formData.image_url ? (
                    <div className="relative group">
                      <img src={formData.image_url} alt="Category" className="h-40 mx-auto object-contain rounded-lg shadow-sm" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity rounded-lg">
                        <label className="cursor-pointer bg-white px-4 py-2 rounded-lg font-semibold text-sm hover:bg-gray-100">
                          Change Image
                          <input type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" className="hidden" onChange={handleImageUpload} />
                        </label>
                      </div>
                    </div>
                  ) : (
                    <label className="cursor-pointer block">
                      <i className="ri-upload-cloud-line text-4xl text-gray-400 mb-2 w-10 h-10 flex items-center justify-center mx-auto"></i>
                      <p className="text-gray-700 font-medium">Click to upload image</p>
                      <p className="text-sm text-gray-500 mt-1">Square (1:1) Recommended (e.g., 800x800px)</p>
                      <input type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" className="hidden" onChange={handleImageUpload} />
                    </label>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600 cursor-pointer"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
                <div className="flex items-center space-x-3 mt-6">
                  <input
                    type="checkbox"
                    checked={formData.featured}
                    onChange={(e) => setFormData({ ...formData, featured: e.target.checked })}
                    className="w-5 h-5 text-gray-900 border-gray-300 rounded focus:ring-gray-600 cursor-pointer"
                  />
                  <label className="text-gray-900 font-medium">Feature on homepage</label>
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 flex items-center justify-end space-x-3 bg-gray-50 rounded-b-2xl">
              <button
                onClick={() => { setShowAddModal(false); setShowEditModal(false); setEditingCategory(null); }}
                disabled={saving}
                className="px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-lg hover:border-gray-400 font-semibold transition-colors whitespace-nowrap cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={saving || uploading}
                className={`px-6 py-3 bg-gray-900 hover:bg-gray-800 text-white rounded-lg font-semibold transition-colors whitespace-nowrap cursor-pointer flex items-center ${saving ? 'opacity-70' : ''}`}
              >
                {saving && <i className="ri-loader-4-line animate-spin mr-2"></i>}
                {showAddModal ? 'Add Category' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

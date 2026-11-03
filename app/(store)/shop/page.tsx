'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useCMS } from '@/context/CMSContext';
import ProductCard, { type ColorVariant } from '@/components/ProductCard';
import { getColorHex } from '@/components/ProductCard';
import { supabase } from '@/lib/supabase';
import { cachedQuery } from '@/lib/query-cache';
import PageHero from '@/components/PageHero';
import AnimatedSection from '@/components/AnimatedSection';

function ShopContent() {
  usePageTitle('Shop All Products');
  const { getSetting } = useCMS();
  const searchParams = useSearchParams();

  // State
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([{ id: 'all', name: 'All Products', count: 0 }]);
  const [loading, setLoading] = useState(true);
  const [totalProducts, setTotalProducts] = useState(0);

  // Filters
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [priceRange, setPriceRange] = useState([0, 5000]);
  const [selectedRating, setSelectedRating] = useState(0);
  const [sortBy, setSortBy] = useState('popular');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [expandedParent, setExpandedParent] = useState<string | null>(null);
  const productsPerPage = 9;

  // Initialize from URL params
  useEffect(() => {
    const category = searchParams.get('category');
    const sort = searchParams.get('sort');
    const search = searchParams.get('search');

    // Follow the URL both ways so leaving /shop?category=x clears the filter.
    setSelectedCategory(category || 'all');
    const sortAliases: Record<string, string> = { newest: 'new', bestsellers: 'popular' };
    if (sort) setSortBy(sortAliases[sort] || sort);
    // Search is handled in the fetch function via searchParams directly or we could add a state for it
  }, [searchParams]);

  // Fetch Categories from cached API
  useEffect(() => {
    async function fetchCategories() {
      try {
        const res = await fetch('/api/storefront/categories');
        if (res.ok) {
          const data = await res.json();
          if (data) setCategories(data);
        }
      } catch (err) {
        console.error('Error fetching categories:', err);
      }
    }
    fetchCategories();
  }, []);

  // Fetch Products
  useEffect(() => {
    // Wait for real categories to load before filtering by a specific category
    if (selectedCategory !== 'all' && categories.length <= 1) return;

    async function fetchProducts() {
      setLoading(true);
      try {
        const search = searchParams.get('search');

        // Build cache key from all filter params
        const cacheKey = `shop:${selectedCategory}:${search || ''}:${priceRange.join('-')}:${selectedRating}:${sortBy}:${page}`;

        const { data, count, error } = await cachedQuery<{ data: any; count: any; error: any }>(
          cacheKey,
          async () => {
            // Build category filter: collect all target category IDs (selected + children)
            let extraProductIds: string[] = [];
            let targetCategoryIds: string[] = [];

            if (selectedCategory !== 'all') {
              const categoryObj = categories.find(c => c.slug === selectedCategory);
              if (categoryObj) {
                const childIds = categories
                  .filter(c => c.parent_id === categoryObj.id)
                  .map(c => c.id);
                targetCategoryIds = [categoryObj.id, ...childIds];

                // Fetch product IDs linked to these categories via extra-category links
                const { data: linkRows } = await supabase
                  .from('product_category_links')
                  .select('product_id')
                  .in('category_id', targetCategoryIds);
                extraProductIds = (linkRows || []).map((r: any) => r.product_id);
              }
            }

            let query = supabase
              .from('products')
              .select(`
                *,
                categories!category_id(name, slug),
                product_images!product_id(url, position),
                product_variants!product_id(id, name, price, compare_at_price, quantity, option1, option2, image_url)
              `, { count: 'exact' })
              .eq('status', 'active');

            // Search
            if (search) {
              query = query.ilike('name', `%${search}%`);
            }

            // Category Filter: primary category OR extra linked categories
            if (selectedCategory !== 'all') {
              if (extraProductIds.length > 0 && targetCategoryIds.length > 0) {
                // products whose primary category is in targets OR whose id is in extra links
                query = query.or(
                  `category_id.in.(${targetCategoryIds.join(',')}),id.in.(${extraProductIds.join(',')})`
                );
              } else if (targetCategoryIds.length > 0) {
                query = query.in('category_id', targetCategoryIds);
              }
            }

            // Price Filter
            if (priceRange[1] < 5000) {
              query = query.gte('price', priceRange[0]).lte('price', priceRange[1]);
            }

            // Rating Filter
            if (selectedRating > 0) {
              query = query.gte('rating_avg', selectedRating);
            }

            // Sorting
            switch (sortBy) {
              case 'price-low':
                query = query.order('price', { ascending: true });
                break;
              case 'price-high':
                query = query.order('price', { ascending: false });
                break;
              case 'rating':
                query = query.order('rating_avg', { ascending: false });
                break;
              case 'new':
                query = query.order('created_at', { ascending: false });
                break;
              case 'popular':
              default:
                query = query.order('created_at', { ascending: false });
                break;
            }

            // Pagination
            const from = (page - 1) * productsPerPage;
            const to = from + productsPerPage - 1;
            query = query.range(from, to);

            return query as any;
          },
          2 * 60 * 1000 // Cache for 2 minutes
        );

        if (error) throw error;

        if (data) {
          const formattedProducts = data.map((p: any) => {
            const sortedImages = Array.isArray(p.product_images)
              ? [...p.product_images].sort(
                  (a: any, b: any) => (a?.position ?? 0) - (b?.position ?? 0)
                )
              : p.product_images;
            const variants = p.product_variants || [];
            const hasVariants = variants.length > 0;
            const minVariantPrice = hasVariants ? Math.min(...variants.map((v: any) => v.price || p.price)) : undefined;
            const totalVariantStock = hasVariants ? variants.reduce((sum: number, v: any) => sum + (v.quantity || 0), 0) : 0;
            const effectiveStock = hasVariants ? totalVariantStock : p.quantity;
            const colorVariants: ColorVariant[] = [];
            const seenColors = new Set<string>();
            // Pull colors from metadata.product_options.color (new system)
            const metaColors = (p.metadata?.product_options?.color?.values || []) as string[];
            for (const c of metaColors) {
              const [cName, cHex] = c.split('|');
              if (cName && cHex && !seenColors.has(cName.toLowerCase().trim())) {
                seenColors.add(cName.toLowerCase().trim());
                colorVariants.push({ name: cName.trim(), hex: cHex });
              }
            }
            // Fallback: legacy colors from variant option2
            for (const v of variants) {
              const colorName = v.option2;
              if (colorName && !seenColors.has(colorName.toLowerCase().trim())) {
                const hex = getColorHex(colorName);
                if (hex) {
                  seenColors.add(colorName.toLowerCase().trim());
                  colorVariants.push({ name: colorName.trim(), hex });
                }
              }
            }

            return {
              id: p.id,           // Product UUID for cart/orders
              slug: p.slug,       // Slug for navigation
              name: p.name,
              price: p.price,
              originalPrice: p.compare_at_price,
              image: sortedImages?.[0]?.url || '/placeholder-product.svg',
              rating: p.rating_avg || 0,
              reviewCount: 0, // Need to implement reviews relation
              badge: p.compare_at_price > p.price ? 'Sale' : undefined, // Simple badge logic
              inStock: effectiveStock > 0 || p.track_quantity === false || p.continue_selling === true,
              maxStock: (p.track_quantity === false || p.continue_selling) ? 999 : effectiveStock || 50,
              moq: p.moq || 1,
              category: p.categories?.name,
              hasVariants,
              minVariantPrice,
              colorVariants
            };
          });
          setProducts(formattedProducts);
          setTotalProducts(count || 0);
        }
      } catch (err) {
        console.error('Error fetching products:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchProducts();
  }, [selectedCategory, priceRange, selectedRating, sortBy, page, searchParams, categories]);

  const totalPages = Math.ceil(totalProducts / productsPerPage);

  return (
    <main className="min-h-screen bg-white">
      <PageHero
        title={getSetting('shop_hero_title') || 'Shop All Products'}
        subtitle={getSetting('shop_hero_subtitle') || 'Discover our curated collection of premium goods'}
        backgroundImage={getSetting('shop_hero_image') || '/hero8.jpeg'}
      />

      {/* Mobile Filter Toggle */}
      <div className="lg:hidden bg-white border-b border-gray-200 py-4 px-4 sticky top-[72px] z-20">
        <div className="flex justify-between items-center">
          <button
            onClick={() => setIsFilterOpen(!isFilterOpen)}
            className="flex items-center space-x-2 text-gray-900 font-medium"
          >
            <i className="ri-filter-3-line text-xl"></i>
            <span>Filters & Sort</span>
          </button>
          <span className="text-sm text-gray-500">{totalProducts} Products</span>
        </div>
      </div>

      <AnimatedSection direction="up" className="py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex gap-8">
            <aside className={`${isFilterOpen ? 'fixed inset-0 z-50 bg-white overflow-y-auto' : 'hidden'} lg:block lg:w-64 lg:flex-shrink-0`}>
              <div className="lg:sticky lg:top-24">
                <div className="bg-white lg:bg-transparent p-6 lg:p-0">
                  <div className="flex items-center justify-between mb-6 lg:hidden">
                    <h2 className="text-xl font-bold text-gray-900">Filters</h2>
                    <button
                      onClick={() => setIsFilterOpen(false)}
                      className="w-10 h-10 flex items-center justify-center text-gray-700"
                    >
                      <i className="ri-close-line text-2xl"></i>
                    </button>
                  </div>

                  <div className="space-y-8">
                    {/* Categories */}
                    <div>
                      <h3 className="font-semibold text-gray-900 mb-4">Categories</h3>
                      <div className="space-y-1">
                        <button
                          onClick={() => {
                            setSelectedCategory('all');
                            setPage(1);
                            setIsFilterOpen(false);
                          }}
                          className={`w-full text-left px-4 py-2 rounded-lg transition-colors ${selectedCategory === 'all'
                            ? 'bg-gray-100 text-gray-900 font-medium'
                            : 'text-gray-700 hover:bg-gray-100'
                            }`}
                        >
                          All Products
                        </button>

                        {/* Parent Categories — ordered to match hamburger menu */}
                        {(() => {
                          const SLUG_ORDER = ['wigs', 'bundles', 'closure-frontals', 'braiding-extensions', 'products-tools', 'pre-orders'];
                          const parents = categories.filter(c => !c.parent_id && c.id !== 'all');
                          const ordered: typeof parents = [];
                          for (const slug of SLUG_ORDER) {
                            const found = parents.find(p => p.slug === slug);
                            if (found) ordered.push(found);
                          }

                          const items: { key: string; slug: string; name: string; subcategories: any[] }[] = [];
                          for (const parent of ordered) {
                            const subs = categories.filter(c => c.parent_id === parent.id);
                            items.push({ key: parent.id, slug: parent.slug, name: parent.name, subcategories: subs });
                          }

                          return items.map(item => {
                            const hasSubs = item.subcategories.length > 0;
                            const isSelected = selectedCategory === item.slug;
                            const isChildSelected = item.subcategories.some((sub: any) => sub.slug === selectedCategory);
                            const isOpen = expandedParent === item.slug || isChildSelected;

                            return (
                              <div key={item.key}>
                                <button
                                  onClick={() => {
                                    if (hasSubs) {
                                      setExpandedParent(isOpen ? null : item.slug);
                                    }
                                    setSelectedCategory(item.slug);
                                    setPage(1);
                                    if (!hasSubs) setIsFilterOpen(false);
                                  }}
                                  className={`w-full text-left px-4 py-2.5 rounded-lg transition-colors flex justify-between items-center ${isSelected || isChildSelected
                                    ? 'bg-gray-100 text-gray-900 font-medium'
                                    : 'text-gray-700 hover:bg-gray-50'
                                    }`}
                                >
                                  <span>{item.name}</span>
                                  {hasSubs && (
                                    <i className={`ri-arrow-down-s-line text-lg text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}></i>
                                  )}
                                </button>

                                {hasSubs && isOpen && (
                                  <div className="ml-4 border-l-2 border-gray-200 pl-2 mt-1 space-y-0.5">
                                    {item.subcategories.map((child: any) => (
                                      <button
                                        key={child.id}
                                        onClick={() => {
                                          setSelectedCategory(child.slug);
                                          setPage(1);
                                          setIsFilterOpen(false);
                                        }}
                                        className={`w-full text-left px-4 py-2 rounded-lg text-sm transition-colors ${selectedCategory === child.slug
                                          ? 'text-gray-900 font-medium bg-gray-50'
                                          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                                          }`}
                                      >
                                        {child.name}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </div>

                    {/* Price Range */}
                    <div className="border-t border-gray-200 pt-8">
                      <h3 className="font-semibold text-gray-900 mb-4">Max Price: GH₵{priceRange[1]}</h3>
                      <div className="space-y-4">
                        <input
                          type="range"
                          min="0"
                          max="5000"
                          step="50"
                          value={priceRange[1]}
                          onChange={(e) => {
                            setPriceRange([0, parseInt(e.target.value)]);
                            setPage(1);
                          }}
                          className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-gray-900"
                        />
                        <div className="flex items-center justify-between text-sm text-gray-600">
                          <span>GH₵0</span>
                          <span>GH₵5000+</span>
                        </div>
                      </div>
                    </div>

                    {/* Rating */}
                    <div className="border-t border-gray-200 pt-8">
                      <h3 className="font-semibold text-gray-900 mb-4">Rating</h3>
                      <div className="space-y-2">
                        {[4, 3, 2, 1].map(rating => (
                          <button
                            key={rating}
                            onClick={() => {
                              setSelectedRating(rating === selectedRating ? 0 : rating);
                              setPage(1);
                            }}
                            className={`w-full text-left px-4 py-2 rounded-lg transition-colors ${selectedRating === rating
                              ? 'bg-gray-100 text-gray-900'
                              : 'text-gray-700 hover:bg-gray-100'
                              }`}
                          >
                            <div className="flex items-center space-x-2">
                              {[1, 2, 3, 4, 5].map(star => (
                                <i
                                  key={star}
                                  className={`${star <= rating ? 'ri-star-fill text-amber-400' : 'ri-star-line text-gray-300'} text-sm`}
                                ></i>
                              ))}
                              <span className="text-sm">& Up</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        // Re-fetch handled by effect dependencies
                        setIsFilterOpen(false);
                      }}
                      className="w-full bg-gray-900 hover:bg-gray-900 text-white py-3 rounded-lg font-medium transition-colors whitespace-nowrap"
                    >
                      Show Results
                    </button>
                  </div>
                </div>
              </div>
            </aside>

            <div className="flex-1">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
                <p className="text-gray-600">
                  Showing <span className="font-semibold text-gray-900">{products.length}</span> of <span className="font-semibold text-gray-900">{totalProducts}</span> products
                </p>

                <div className="flex items-center space-x-3">
                  <label className="text-sm text-gray-600 whitespace-nowrap">Sort by:</label>
                  <select
                    value={sortBy}
                    onChange={(e) => {
                      setSortBy(e.target.value);
                      setPage(1);
                    }}
                    className="px-4 py-2 pr-8 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600 text-sm bg-white cursor-pointer"
                  >
                    <option value="popular">Most Popular</option>
                    <option value="new">Newest</option>
                    <option value="price-low">Price: Low to High</option>
                    <option value="price-high">Price: High to Low</option>
                    <option value="rating">Highest Rated</option>
                  </select>
                </div>
              </div>

              {loading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="bg-gray-100 rounded-xl aspect-[4/5] animate-pulse"></div>
                  ))}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8" data-product-shop>
                    {products.map(product => (
                      <ProductCard key={product.id} {...product} />
                    ))}
                  </div>

                  {products.length === 0 && (
                    <div className="text-center py-20">
                      <div className="w-20 h-20 flex items-center justify-center mx-auto mb-6 bg-gray-100 rounded-full">
                        <i className="ri-inbox-line text-4xl text-gray-400"></i>
                      </div>
                      <h3 className="text-2xl font-bold text-gray-900 mb-2">No Products Found</h3>
                      <p className="text-gray-600 mb-8">Try adjusting your filters to find what you're looking for</p>
                      <button
                        onClick={() => {
                          setSelectedCategory('all');
                          setPriceRange([0, 5000]);
                          setSelectedRating(0);
                          setPage(1);
                        }}
                        className="inline-flex items-center bg-gray-900 hover:bg-gray-900 text-white px-6 py-3 rounded-lg font-medium transition-colors whitespace-nowrap"
                      >
                        Clear All Filters
                      </button>
                    </div>
                  )}
                </>
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="mt-16 flex justify-center">
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="w-10 h-10 flex items-center justify-center border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <i className="ri-arrow-left-s-line text-xl text-gray-700"></i>
                    </button>

                    {/* Simple page numbers - condensed for brevity */}
                    <span className="px-4 font-medium text-gray-700">
                      Page {page} of {totalPages}
                    </span>

                    <button
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                      className="w-10 h-10 flex items-center justify-center border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <i className="ri-arrow-right-s-line text-xl text-gray-700"></i>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </AnimatedSection>
    </main>
  );
}

export default function ShopPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="w-12 h-12 border-4 border-gray-900 border-t-transparent rounded-full animate-spin"></div></div>}>
      <ShopContent />
    </Suspense>
  );
}
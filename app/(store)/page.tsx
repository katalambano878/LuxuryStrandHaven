'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { supabase } from '@/lib/supabase';
import { useCMS } from '@/context/CMSContext';
import ProductCard, { type ColorVariant, getColorHex } from '@/components/ProductCard';
import AnimatedSection, { AnimatedGrid } from '@/components/AnimatedSection';
import { usePageTitle } from '@/hooks/usePageTitle';
import { motion, AnimatePresence } from 'framer-motion';

export default function Home() {
  usePageTitle('');
  const { getSetting, getSettingJSON, getActiveBanners, loading: cmsLoading } = useCMS();
  const [featuredProducts, setFeaturedProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const { data: productsData, error: productsError } = await supabase
          .from('products')
          .select('*, product_variants(*), product_images(*)')
          .eq('status', 'active')
          .eq('featured', true)
          .order('created_at', { ascending: false })
          .limit(8);

        if (productsError) throw productsError;
        setFeaturedProducts(productsData || []);

        const { data: categoriesData, error: categoriesError } = await supabase
          .from('categories')
          .select('id, name, slug, image_url, metadata')
          .eq('status', 'active')
          .order('name');

        if (categoriesError) throw categoriesError;

        const featuredCategories = (categoriesData || []).filter(
          (cat: any) => cat.metadata?.featured === true
        );
        setCategories(featuredCategories.slice(0, 6));
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  // ── CMS-driven config ────────────────────────────────────────────
  const heroHeadline = getSetting('hero_headline') || 'Your Hair, Your Crown';
  const heroSubheadline = getSetting('hero_subheadline') || 'Premium wigs, bundles & extensions — crafted for women who demand nothing but the best.';

  const DEFAULT_SLIDES = ['/brand-hero1.png', '/brand-hero2.png', '/brand-hero3.png'];
  const cmsSlides = getSettingJSON<string[]>('hero_slides', []);
  const heroSlides = cmsLoading ? [] : (cmsSlides.length > 0 ? cmsSlides.filter((s: string) => s) : DEFAULT_SLIDES);
  const HERO_INTERVAL_MS = 3000;
  const [heroIndex, setHeroIndex] = useState(0);

  useEffect(() => {
    if (heroSlides.length <= 1) return;
    const t = setInterval(() => setHeroIndex((i) => (i + 1) % heroSlides.length), HERO_INTERVAL_MS);
    return () => clearInterval(t);
  }, [heroSlides.length]);
  const heroPrimaryText = getSetting('hero_primary_btn_text');
  const heroPrimaryLink = getSetting('hero_primary_btn_link') || '/shop';
  const heroSecondaryText = getSetting('hero_secondary_btn_text');
  const heroSecondaryLink = getSetting('hero_secondary_btn_link') || '/about';
  const heroTagText = getSetting('hero_tag_text');
  const heroBadgeLabel = getSetting('hero_badge_label');
  const heroBadgeText = getSetting('hero_badge_text');
  const heroBadgeSubtext = getSetting('hero_badge_subtext');

  const features = [
    { icon: getSetting('feature1_icon'), title: getSetting('feature1_title'), desc: getSetting('feature1_desc') },
    { icon: getSetting('feature2_icon'), title: getSetting('feature2_title'), desc: getSetting('feature2_desc') },
    { icon: getSetting('feature3_icon'), title: getSetting('feature3_title'), desc: getSetting('feature3_desc') },
    { icon: getSetting('feature4_icon'), title: getSetting('feature4_title'), desc: getSetting('feature4_desc') },
  ];

  const stat1Title = getSetting('hero_stat1_title');
  const stat1Desc = getSetting('hero_stat1_desc');
  const stat2Title = getSetting('hero_stat2_title');
  const stat2Desc = getSetting('hero_stat2_desc');
  const stat3Title = getSetting('hero_stat3_title');
  const stat3Desc = getSetting('hero_stat3_desc');

  const activeBanners = getActiveBanners('top');

  const renderBanners = () => {
    if (activeBanners.length === 0) return null;
    return (
      <div className="bg-gray-900 text-white py-2 overflow-hidden relative z-50">
        <div className="flex animate-marquee whitespace-nowrap">
          {activeBanners.concat(activeBanners).map((banner, index) => (
            <span key={index} className="mx-8 text-sm font-medium tracking-wide flex items-center">
              {banner.title}
            </span>
          ))}
        </div>
      </div>
    );
  };

  return (
    <main className="flex-col items-center justify-between min-h-screen bg-white">
      {renderBanners()}

      {/* Hero Section */}
      <section className="relative w-full min-h-[85vh] lg:min-h-screen flex flex-col justify-end overflow-hidden bg-black">
        <div className="absolute inset-0 z-0 bg-black">
          {heroSlides.length > 0 && (<>
          {/* Pre-load off-screen so Next.js optimises all slides eagerly */}
          <div className="sr-only" aria-hidden>
            {heroSlides.map((src) => (
              <Image key={`preload-${src}`} src={src} width={1} height={1} priority alt="" quality={100} />
            ))}
          </div>
          <AnimatePresence initial={false} mode="sync">
            <motion.div
              key={heroIndex}
              initial={{ opacity: 0, scale: 0.84 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.14 }}
              transition={{
                scale: { type: 'spring', stiffness: 220, damping: 28, mass: 0.9 },
                opacity: { duration: 0.55, ease: 'easeInOut' },
              }}
              className="absolute inset-0"
            >
              <Image
                src={heroSlides[heroIndex]}
                fill
                className="object-cover object-top"
                alt={`Luxury Strand Haven hero ${heroIndex + 1}`}
                priority
                sizes="100vw"
                quality={100}
                unoptimized
              />
            </motion.div>
          </AnimatePresence>
          </>)}
          {/* Rich bottom-up gradient so text is always readable */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/10 pointer-events-none" aria-hidden />
        </div>

        {/* Content — left-aligned on desktop, centred on mobile */}
        <div className="relative z-10 max-w-7xl mx-auto w-full px-4 sm:px-6 pb-16 sm:pb-20 lg:pb-28 pt-32">
          <div className="max-w-xl lg:max-w-2xl">
            {/* Headline */}
            <motion.h1
              initial={{ opacity: 0, y: 32 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25, duration: 0.8 }}
              className="font-serif text-4xl sm:text-5xl md:text-6xl lg:text-7xl text-white leading-[1.1] mb-5 drop-shadow-2xl"
            >
              {heroHeadline}
            </motion.h1>

            {/* Subheadline */}
            <motion.p
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.8 }}
              className="text-base sm:text-lg text-white/80 mb-10 font-light leading-relaxed"
            >
              {heroSubheadline}
            </motion.p>

            {/* CTAs */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.55, duration: 0.7 }}
              className="flex flex-col sm:flex-row gap-3"
            >
              <Link
                href={heroPrimaryLink || '/shop'}
                className="inline-flex items-center justify-center gap-2 bg-white text-gray-900 hover:bg-gray-100 px-8 py-4 rounded-full font-bold text-base transition-all hover:scale-105 shadow-xl hover:shadow-white/20"
              >
                {heroPrimaryText || 'Shop Collections'}
                <i className="ri-arrow-right-line text-lg"></i>
              </Link>
            </motion.div>

            {/* Trust badges */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.85, duration: 1 }}
              className="flex flex-wrap items-center gap-4 mt-10"
            >
              {[
                { icon: 'ri-shield-check-line', text: '100% Human Hair' },
                { icon: 'ri-truck-line', text: 'Fast Nationwide Delivery' },
                { icon: 'ri-star-fill', text: '5-Star Rated' },
              ].map((badge) => (
                <span key={badge.text} className="flex items-center gap-1.5 text-white/70 text-xs font-medium">
                  <i className={`${badge.icon} text-pink-400 text-base`}></i>
                  {badge.text}
                </span>
              ))}
            </motion.div>
          </div>
        </div>

        {/* Slide dots */}
        <div className="absolute bottom-6 right-6 z-10 flex gap-2">
          {heroSlides.map((_, i) => (
            <button
              key={i}
              onClick={() => setHeroIndex(i)}
              className={`transition-all rounded-full ${i === heroIndex ? 'w-6 h-2 bg-white' : 'w-2 h-2 bg-white/40 hover:bg-white/70'}`}
              aria-label={`Go to slide ${i + 1}`}
            />
          ))}
        </div>

      </section>

      {/* Categories Section */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <AnimatedSection className="flex items-end justify-between mb-12">
            <div>
              <span className="text-gray-500 font-bold tracking-widest uppercase text-xs mb-3 block">Collections</span>
              <h2 className="font-serif text-4xl md:text-5xl text-gray-900 mb-4">Shop by Category</h2>
              <p className="text-gray-600 text-lg max-w-md font-light">Explore our carefully curated collections designed for every style.</p>
            </div>
            <Link href="/categories" className="hidden md:flex items-center gap-2 text-gray-900 font-bold hover:gap-4 transition-all">
              View All <i className="ri-arrow-right-line"></i>
            </Link>
          </AnimatedSection>

          <div className="grid grid-cols-3 md:grid-cols-3 gap-2 sm:gap-3 md:gap-6">
            {categories.map((category) => (
              <Link
                href={`/shop?category=${category.slug}`}
                key={category.id}
                className="group cursor-pointer block"
              >
                <div className="aspect-[4/5] rounded-[1.25rem] overflow-hidden relative shadow-sm hover:shadow-lg transition-all duration-500 bg-gray-100">
                  <Image
                    src={category.image || category.image_url || '/placeholder-product.svg'}
                    alt={category.name}
                    fill
                    className="object-cover transition-transform duration-700 group-hover:scale-105"
                    sizes="(max-width: 768px) 33vw, 33vw"
                    quality={85}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/5 to-transparent opacity-80 group-hover:opacity-90 transition-opacity duration-500" />
                  <div className="absolute bottom-4 sm:bottom-6 inset-x-0 px-3 flex justify-center text-white">
                    <h3 className="font-sans font-medium sm:font-semibold text-base sm:text-lg md:text-xl text-center drop-shadow-md tracking-wide">
                      {category.name}
                    </h3>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          <div className="mt-12 text-center md:hidden">
            <Link href="/categories" className="inline-flex items-center gap-2 text-gray-900 font-bold">
              View All <i className="ri-arrow-right-line"></i>
            </Link>
          </div>
        </div>
      </section>

      {/* Featured Products */}
      <section className="py-24 bg-stone-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <AnimatedSection className="text-center mb-16">
            <span className="text-gray-500 font-bold tracking-widest uppercase text-xs mb-3 block">New Arrivals</span>
            <h2 className="font-serif text-4xl md:text-5xl text-gray-900 mb-4">Featured Products</h2>
            <p className="text-gray-600 text-lg max-w-2xl mx-auto font-light">Handpicked favorites just for you.</p>
          </AnimatedSection>

          {loading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="animate-pulse">
                  <div className="bg-gray-200 aspect-[3/4] rounded-2xl mb-4"></div>
                  <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                  <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                </div>
              ))}
            </div>
          ) : (
            <AnimatedGrid className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 lg:gap-8">
              {featuredProducts.map((product) => {
                const variants = product.product_variants || [];
                const hasVariants = variants.length > 0;
                const minVariantPrice = hasVariants ? Math.min(...variants.map((v: any) => v.price || product.price)) : undefined;
                const totalVariantStock = hasVariants ? variants.reduce((sum: number, v: any) => sum + (v.quantity || 0), 0) : 0;
                const effectiveStock = hasVariants ? totalVariantStock : product.quantity;

                const colorVariants: ColorVariant[] = [];
                const seenColors = new Set<string>();
                // Pull colors from metadata.product_options.color (new system)
                const metaColors = (product.metadata?.product_options?.color?.values || []) as string[];
                for (const c of metaColors) {
                  const [cName, cHex] = c.split('|');
                  if (cName && cHex && !seenColors.has(cName.toLowerCase().trim())) {
                    seenColors.add(cName.toLowerCase().trim());
                    colorVariants.push({ name: cName.trim(), hex: cHex });
                  }
                }
                // Fallback: legacy colors from variant option2
                for (const v of variants) {
                  const colorName = (v as any).option2;
                  if (colorName && !seenColors.has(colorName.toLowerCase().trim())) {
                    const hex = getColorHex(colorName);
                    if (hex) {
                      seenColors.add(colorName.toLowerCase().trim());
                      colorVariants.push({ name: colorName.trim(), hex });
                    }
                  }
                }

                return (
                  <ProductCard
                    key={product.id}
                    id={product.id}
                    slug={product.slug}
                    name={product.name}
                    price={product.price}
                    originalPrice={product.compare_at_price}
                    image={product.product_images?.[0]?.url || '/placeholder-product.svg'}
                    rating={product.rating_avg || 0}
                    reviewCount={product.review_count || 0}
                    badge={product.featured ? 'Featured' : undefined}
                    inStock={effectiveStock > 0 || product.track_quantity === false || product.continue_selling === true}
                    maxStock={(product.track_quantity === false || product.continue_selling) ? 999 : effectiveStock || 50}
                    moq={product.moq || 1}
                    hasVariants={hasVariants}
                    minVariantPrice={minVariantPrice}
                    colorVariants={colorVariants}
                    brand={product.brand || product.vendor}
                  />
                );
              })}
            </AnimatedGrid>
          )}

          <div className="text-center mt-20">
            <Link
              href="/shop"
              className="inline-flex items-center justify-center bg-gray-900 text-white px-12 py-5 rounded-full font-bold text-lg hover:bg-gray-800 transition-all shadow-xl hover:shadow-2xl hover:-translate-y-1"
            >
              Shop All Products
            </Link>
          </div>
        </div>
      </section>

      {/* Trust Features */}
      <section className="py-24 bg-white border-t border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-12">
            {features.map((feature, i) => (
              <AnimatedSection key={i} delay={i * 0.1} className="flex flex-col items-center text-center group">
                <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mb-6 text-gray-900 group-hover:bg-gray-900 group-hover:text-white transition-colors duration-500">
                  <i className={`${feature.icon} text-3xl`}></i>
                </div>
                <h3 className="font-bold text-gray-900 mb-2 text-lg">{feature.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{feature.desc}</p>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

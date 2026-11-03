import { MetadataRoute } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://luxury-strand-haven.vercel.app';

  const staticPages: MetadataRoute.Sitemap = [
    { url: baseUrl,                          lastModified: new Date(), changeFrequency: 'daily',   priority: 1.0 },
    { url: `${baseUrl}/shop`,                lastModified: new Date(), changeFrequency: 'daily',   priority: 0.95 },
    { url: `${baseUrl}/categories`,          lastModified: new Date(), changeFrequency: 'weekly',  priority: 0.9 },
    { url: `${baseUrl}/academia`,            lastModified: new Date(), changeFrequency: 'weekly',  priority: 0.85 },
    { url: `${baseUrl}/about`,               lastModified: new Date(), changeFrequency: 'monthly', priority: 0.7 },
    { url: `${baseUrl}/contact`,             lastModified: new Date(), changeFrequency: 'monthly', priority: 0.7 },
    { url: `${baseUrl}/order-tracking`,      lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    { url: `${baseUrl}/faqs`,               lastModified: new Date(), changeFrequency: 'monthly', priority: 0.6 },
    { url: `${baseUrl}/shipping`,            lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    { url: `${baseUrl}/refund-policy`,             lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    { url: `${baseUrl}/privacy`,             lastModified: new Date(), changeFrequency: 'yearly',  priority: 0.3 },
    { url: `${baseUrl}/terms`,               lastModified: new Date(), changeFrequency: 'yearly',  priority: 0.3 },
    // Category landing pages
    { url: `${baseUrl}/shop?category=custom-luxury-wigs`,  lastModified: new Date(), changeFrequency: 'weekly', priority: 0.85 },
    { url: `${baseUrl}/shop?category=factory-wigs`,         lastModified: new Date(), changeFrequency: 'weekly', priority: 0.85 },
    { url: `${baseUrl}/shop?category=bundles-raw-hairs`,    lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 },
    { url: `${baseUrl}/shop?category=bundles-virgin-hair`,  lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 },
    { url: `${baseUrl}/shop?category=closures-raw-hairs`,   lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 },
    { url: `${baseUrl}/shop?category=closures-virgin-hair`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 },
    { url: `${baseUrl}/shop?category=products-tools`,       lastModified: new Date(), changeFrequency: 'weekly', priority: 0.75 },
    { url: `${baseUrl}/shop?category=braiding-extensions`,  lastModified: new Date(), changeFrequency: 'weekly', priority: 0.75 },
  ];

  let productPages: MetadataRoute.Sitemap = [];
  let categoryPages: MetadataRoute.Sitemap = [];

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: products } = await supabase
      .from('products')
      .select('slug, updated_at')
      .eq('status', 'active');

    if (products) {
      productPages = products.map((product) => ({
        url: `${baseUrl}/product/${product.slug}`,
        lastModified: new Date(product.updated_at),
        changeFrequency: 'weekly' as const,
        priority: 0.8,
      }));
    }

    const { data: categories } = await supabase
      .from('categories')
      .select('slug, updated_at')
      .eq('status', 'active');

    if (categories) {
      categoryPages = categories.map((category) => ({
        url: `${baseUrl}/shop?category=${category.slug}`,
        lastModified: new Date(category.updated_at),
        changeFrequency: 'weekly' as const,
        priority: 0.75,
      }));
    }
  } catch (error) {
    console.error('Sitemap generation error:', error);
  }

  return [...staticPages, ...productPages, ...categoryPages];
}

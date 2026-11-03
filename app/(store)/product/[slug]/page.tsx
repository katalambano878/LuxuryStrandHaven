import { Metadata } from 'next';
import { createClient } from '@supabase/supabase-js';
import ProductDetailClient from './ProductDetailClient';

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://luxury-strand-haven.vercel.app';
const SITE_NAME = 'Luxury Strand Haven';

async function getProduct(slug: string) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data } = await supabase
      .from('products')
      .select('name, description, price, category_id, metadata, product_images(url, position)')
      .eq('slug', slug)
      .eq('status', 'active')
      .single();
    if (!data) return null;
    const images = [...((data as any).product_images || [])].sort(
      (a: any, b: any) => (a.position ?? 0) - (b.position ?? 0)
    );
    return { ...data, images };
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProduct(slug);

  if (!product) {
    return {
      title: 'Product Not Found',
      robots: { index: false, follow: false },
    };
  }

  const productUrl = `${SITE_URL}/product/${slug}`;
  const ogImage = product.images?.[0]?.url || '/logo.png?v=4';
  const title = `${product.name} | ${SITE_NAME}`;
  const description = product.description
    ? `${product.description.slice(0, 155)}...`
    : `Shop ${product.name} at Luxury Strand Haven. 100% human hair — premium quality, fast delivery across Ghana.`;

  return {
    title: product.name,
    description,
    openGraph: {
      title,
      description,
      url: productUrl,
      type: 'website',
      siteName: SITE_NAME,
      locale: 'en_GH',
      images: [{ url: ogImage, width: 1200, height: 630, alt: `${product.name} — ${SITE_NAME}` }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImage],
    },
    alternates: { canonical: productUrl },
    keywords: [
      product.name,
      `${product.name} Ghana`,
      `buy ${product.name} Ghana`,
      'luxury wigs Ghana',
      'human hair Ghana',
      SITE_NAME,
    ].join(', '),
  };
}

export default async function ProductDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <ProductDetailClient slug={slug} />;
}

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { checkRateLimit, getClientIdentifier, RATE_LIMITS } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const ORDER_NUMBER = /^[A-Z]{2,5}-\d+-\d+$/;

/**
 * Order tracking lookup. Returns only what the tracking page shows (status,
 * items, city) — never the customer's phone, email or full address.
 */
export async function POST(req: Request) {
  if (!checkRateLimit(`track:${getClientIdentifier(req)}`, RATE_LIMITS.notification).success) {
    return NextResponse.json({ success: false, message: 'Too many lookups. Please wait a minute.' }, { status: 429 });
  }
  const body = await req.json().catch(() => ({}));
  const orderNumber = typeof body.orderNumber === 'string' ? body.orderNumber.trim().toUpperCase() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!ORDER_NUMBER.test(orderNumber)) {
    return NextResponse.json({ success: false, message: 'Order not found. Please check your order number and try again.' }, { status: 404 });
  }

  const { data: order } = await supabaseAdmin
    .from('orders')
    .select('order_number, email, status, payment_status, total, created_at, metadata, shipping_address, order_items(id, product_name, variant_name, quantity, unit_price, metadata, products(product_images(url)))')
    .eq('order_number', orderNumber)
    .maybeSingle();

  if (!order) {
    return NextResponse.json({ success: false, message: 'Order not found. Please check your order number and try again.' }, { status: 404 });
  }
  if (email && String(order.email || '').toLowerCase() !== email) {
    return NextResponse.json({ success: false, message: 'The email address does not match this order.' }, { status: 403 });
  }

  const meta = order.metadata || {};
  const ship = order.shipping_address || {};
  return NextResponse.json({
    success: true,
    order: {
      order_number: order.order_number,
      status: order.status,
      payment_status: order.payment_status,
      total: order.total,
      created_at: order.created_at,
      metadata: {
        tracking_number: meta.tracking_number || null,
        payment_verified_at: meta.payment_verified_at || null,
      },
      shipping_address: { city: ship.city || null, region: ship.region || null },
      order_items: (order.order_items || []).map((item: any) => ({
        id: item.id,
        product_name: item.product_name,
        variant_name: item.variant_name,
        quantity: item.quantity,
        unit_price: item.unit_price,
        metadata: { image: item.metadata?.image || null },
        products: item.products ? { product_images: item.products.product_images || [] } : null,
      })),
    },
  });
}

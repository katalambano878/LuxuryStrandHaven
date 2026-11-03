import { NextResponse } from 'next/server';
import { randomInt } from 'crypto';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getAuthToken } from '@/lib/auth';
import { checkRateLimit, getClientIdentifier, RATE_LIMITS } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DELIVERY_METHODS = new Set(['pickup', 'doorstep', 'accra', 'outside-accra']);
const PAYMENT_METHODS = new Set(['moolre']);
const MAX_LINES = 50;
const MAX_QTY = 999;

type CartLine = { id: string; quantity: number; variant?: string | null };

function text(value: unknown, max = 200): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function fail(message: string, status = 400) {
  return NextResponse.json({ success: false, message }, { status });
}

function variantLabels(v: any): string[] {
  const opts = [v.option1, v.option2, v.option3].filter(Boolean).join(' / ');
  return [opts, v.name].filter((s) => typeof s === 'string' && s.length > 0);
}

/**
 * Create an order from the shopper's cart. Prices, stock and totals all come
 * from the database; the browser only says which products and how many.
 */
export async function POST(req: Request) {
  try {
    const rate = checkRateLimit(`checkout:${getClientIdentifier(req)}`, RATE_LIMITS.payment);
    if (!rate.success) return fail('Too many attempts. Please wait a minute and try again.', 429);

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') return fail('Invalid request');

    // ---- shopper details ----
    const s = body.shipping || {};
    const shipping = {
      firstName: text(s.firstName, 80),
      lastName: text(s.lastName, 80),
      email: text(s.email, 160).toLowerCase(),
      phone: text(s.phone, 30),
      country: text(s.country, 80) || 'Ghana',
      address: text(s.address, 300),
      city: text(s.city, 120),
      region: text(s.region, 120),
    };
    if (!shipping.firstName || !shipping.lastName) return fail('Please enter your first and last name.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(shipping.email)) return fail('Please enter a valid email address.');
    if (!/^[+\d][\d\s()-]{6,29}$/.test(shipping.phone)) return fail('Please enter a valid phone number.');
    if (!shipping.city) return fail('Please choose your city.');

    const deliveryMethod = DELIVERY_METHODS.has(body.deliveryMethod) ? body.deliveryMethod : 'pickup';
    const paymentMethod = PAYMENT_METHODS.has(body.paymentMethod) ? body.paymentMethod : 'moolre';

    // ---- cart ----
    const rawItems: CartLine[] = Array.isArray(body.items) ? body.items : [];
    if (rawItems.length === 0) return fail('Your cart is empty.');
    if (rawItems.length > MAX_LINES) return fail('Too many items in one order.');
    const lines = rawItems.map((i) => ({
      id: text(i?.id, 64),
      quantity: Math.floor(Number(i?.quantity)),
      variant: text(i?.variant, 200) || null,
    }));
    if (lines.some((l) => !UUID.test(l.id) || !Number.isFinite(l.quantity) || l.quantity < 1 || l.quantity > MAX_QTY)) {
      return fail('Some items in your cart are no longer valid. Please remove them and add them again.');
    }

    const productIds = Array.from(new Set(lines.map((l) => l.id)));
    const { data: products, error: productError } = await supabaseAdmin
      .from('products')
      .select('id, name, slug, price, quantity, track_quantity, continue_selling, status, moq, metadata, product_images(url, position), product_variants(id, name, option1, option2, option3, price, quantity, sku)')
      .in('id', productIds);
    if (productError) throw new Error(productError.message);
    const byId = new Map<string, any>((products || []).map((p: any) => [p.id, p]));

    let subtotal = 0;
    const orderItems: any[] = [];
    // stock needed per product / variant across all lines
    const need = new Map<string, number>();

    for (const line of lines) {
      const product = byId.get(line.id);
      if (!product || product.status !== 'active') {
        return fail('An item in your cart is no longer available. Please remove it and try again.', 409);
      }
      const variants: any[] = product.product_variants || [];
      let variant: any = null;
      if (line.variant) {
        variant = variants.find((v) => variantLabels(v).includes(line.variant!)) || null;
      }
      if (variants.length > 0 && !variant && line.variant) {
        return fail(`The option you picked for ${product.name} is no longer available. Please choose it again.`, 409);
      }
      if (variants.length > 0 && !line.variant) {
        return fail(`Please choose an option for ${product.name}.`, 409);
      }

      const moq = Math.max(1, Number(product.moq) || 1);
      if (line.quantity < moq) return fail(`${product.name} has a minimum order of ${moq}.`, 409);

      const unitPrice = Number(variant ? variant.price : product.price);
      if (!Number.isFinite(unitPrice) || unitPrice < 0) return fail(`${product.name} has no price yet.`, 409);

      const label = line.variant ? `${product.name} (${line.variant})` : product.name;
      const stockKey = variant ? `v:${variant.id}` : `p:${product.id}`;
      need.set(stockKey, (need.get(stockKey) || 0) + line.quantity);
      const available = Number(variant ? variant.quantity : product.quantity) || 0;
      const enforceStock = product.track_quantity !== false && !product.continue_selling;
      if (enforceStock && need.get(stockKey)! > available) {
        return fail(
          available > 0
            ? `Only ${available} of ${label} left in stock.`
            : `${label} is out of stock.`,
          409
        );
      }

      const lineTotal = Math.round(unitPrice * line.quantity * 100) / 100;
      subtotal += lineTotal;
      const images = [...(product.product_images || [])].sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0));
      orderItems.push({
        product_id: product.id,
        variant_id: variant?.id || null,
        product_name: product.name,
        variant_name: line.variant,
        sku: variant?.sku || null,
        quantity: line.quantity,
        unit_price: unitPrice,
        total_price: lineTotal,
        metadata: {
          image: images[0]?.url || null,
          slug: product.slug,
          preorder_shipping: product.metadata?.preorder_shipping || null,
        },
      });
    }

    subtotal = Math.round(subtotal * 100) / 100;
    const shippingCost = 0; // Delivery is charged on arrival / agreed with the store.
    const total = subtotal + shippingCost;
    if (total <= 0) return fail('Your order total must be more than zero.');

    // ---- who is ordering ----
    let userId: string | null = null;
    const token = getAuthToken(req);
    if (token) {
      const { data } = await supabaseAdmin.auth.getUser(token);
      userId = data?.user?.id || null;
    }

    const orderNumber = `ORD-${Date.now()}-${randomInt(100000, 1000000)}`;
    const trackingAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const trackingNumber = `SLI-${Array.from({ length: 6 }, () => trackingAlphabet[randomInt(0, trackingAlphabet.length)]).join('')}`;

    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .insert([{
        order_number: orderNumber,
        user_id: userId,
        email: shipping.email,
        phone: shipping.phone,
        status: 'pending',
        payment_status: 'pending',
        currency: 'GHS',
        subtotal,
        tax_total: 0,
        shipping_total: shippingCost,
        discount_total: 0,
        total,
        shipping_method: deliveryMethod,
        payment_method: paymentMethod,
        shipping_address: shipping,
        billing_address: shipping,
        metadata: {
          guest_checkout: !userId,
          first_name: shipping.firstName,
          last_name: shipping.lastName,
          tracking_number: trackingNumber,
          payment_method: paymentMethod,
        },
      }])
      .select('id, order_number, total')
      .single();
    if (orderError || !order) throw new Error(orderError?.message || 'Order insert failed');

    const { error: itemsError } = await supabaseAdmin
      .from('order_items')
      .insert(orderItems.map((item) => ({ ...item, order_id: order.id })));
    if (itemsError) {
      await supabaseAdmin.from('orders').delete().eq('id', order.id);
      throw new Error(itemsError.message);
    }

    try {
      await supabaseAdmin.rpc('upsert_customer_from_order', {
        p_email: shipping.email,
        p_phone: shipping.phone,
        p_full_name: `${shipping.firstName} ${shipping.lastName}`.trim(),
        p_first_name: shipping.firstName,
        p_last_name: shipping.lastName,
        p_user_id: userId,
        p_address: shipping,
      });
    } catch (err: any) {
      console.error('[Checkout] Customer upsert failed:', err?.message);
    }

    return NextResponse.json({ success: true, orderNumber: order.order_number, total: order.total });
  } catch (error: any) {
    console.error('[Checkout] Error:', error?.message || error);
    return fail('We could not place your order. Please try again.', 500);
  }
}

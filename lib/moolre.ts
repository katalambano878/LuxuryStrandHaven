// Server-only helpers for Moolre (Mobile Money) payments.
//
// The only thing that ever marks an order paid is Moolre's own status API,
// queried server-to-server with our credentials. Redirect flags and callback
// bodies are treated as hints to go and check, never as proof.

import { supabaseAdmin } from '@/lib/supabase-admin';

export function moolreConfigured(): boolean {
  return !!(process.env.MOOLRE_API_USER && process.env.MOOLRE_API_PUBKEY && process.env.MOOLRE_ACCOUNT_NUMBER);
}

function headers(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'X-API-USER': process.env.MOOLRE_API_USER || '',
    'X-API-PUBKEY': process.env.MOOLRE_API_PUBKEY || '',
  };
}

export function appBaseUrl(req: Request): string {
  return (process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin).replace(/\/+$/, '');
}

/** Order numbers the store issues: ORD-…, CLS-… (classes). */
export const ORDER_REF = /^(ORD|CLS)-\d+-\d+$/;

/** Strip the per-attempt suffix we add to externalref ("ORD-1-2-R1700000000-2" -> "ORD-1-2"). */
export function baseOrderRef(externalRef: string): string {
  return externalRef.replace(/-R\d+(-\d+)?$/, '');
}

export interface MoolreStatus {
  paid: boolean;
  amount: number | null;
  reference: string | null;
  raw: unknown;
}

/** Ask Moolre whether the transaction with this externalref succeeded. */
export async function checkMoolreStatus(externalRef: string): Promise<MoolreStatus> {
  const res = await fetch('https://api.moolre.com/open/transact/status', {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      type: 1,
      idtype: '1',
      id: externalRef,
      accountnumber: process.env.MOOLRE_ACCOUNT_NUMBER,
    }),
    cache: 'no-store',
  });
  const json: any = await res.json().catch(() => ({}));
  const data = json?.data || {};
  const apiOk = json?.status === 1 || json?.status === '1';
  const txOk =
    data.txstatus === 1 || data.txstatus === '1' ||
    data.txtstatus === 1 || data.txtstatus === '1';
  const amount = data.amount != null && data.amount !== '' ? parseFloat(data.amount) : null;
  return {
    paid: apiOk && txOk,
    amount: Number.isFinite(amount as number) ? (amount as number) : null,
    reference: data.transactionid ? String(data.transactionid) : null,
    raw: json,
  };
}

export interface PayableOrder {
  id: string;
  order_number: string;
  total: number;
  email: string;
  payment_status: string;
  metadata: Record<string, any> | null;
}

export async function loadOrderByRef(orderRef: string): Promise<PayableOrder | null> {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderRef);
  const q = supabaseAdmin
    .from('orders')
    .select('id, order_number, total, email, payment_status, metadata');
  const { data } = isUuid
    ? await q.eq('id', orderRef).maybeSingle()
    : await q.eq('order_number', orderRef).maybeSingle();
  return data || null;
}

/** Merge keys into orders.metadata without dropping what is already there. */
export async function mergeOrderMetadata(orderNumber: string, patch: Record<string, unknown>) {
  const { data } = await supabaseAdmin
    .from('orders')
    .select('metadata')
    .eq('order_number', orderNumber)
    .maybeSingle();
  await supabaseAdmin
    .from('orders')
    .update({ metadata: { ...(data?.metadata || {}), ...patch } })
    .eq('order_number', orderNumber);
}

/**
 * Create a Moolre payment link for an order, charging the total stored in the
 * database. Retries transient Moolre errors with a fresh externalref.
 */
export async function createMoolreLink(
  order: PayableOrder,
  opts: { baseUrl: string; redirectPath: string; customerEmail?: string }
): Promise<{ url: string; reference?: string } | { error: string }> {
  const amount = Number(order.total);
  if (!amount || amount <= 0) return { error: 'Invalid order amount' };

  const isTransient = (status: number, message: string) => {
    const m = (message || '').toLowerCase();
    return status >= 500 || /terminal.?id|sqlstate|integrity constraint|try again|timeout|temporar/.test(m);
  };

  let lastMessage = 'Failed to generate payment link';
  for (let attempt = 1; attempt <= 3; attempt++) {
    const uniqueRef = `${order.order_number}-R${Date.now()}${attempt > 1 ? `-${attempt}` : ''}`;
    let status = 0;
    let result: any = {};
    try {
      const response = await fetch('https://api.moolre.com/embed/link', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          type: 1,
          amount: amount.toFixed(2),
          email: process.env.MOOLRE_MERCHANT_EMAIL || order.email,
          externalref: uniqueRef,
          callback: `${opts.baseUrl}/api/payment/moolre/callback`,
          redirect: `${opts.baseUrl}${opts.redirectPath}`,
          reusable: '0',
          currency: 'GHS',
          accountnumber: process.env.MOOLRE_ACCOUNT_NUMBER,
          metadata: {
            customer_email: opts.customerEmail || order.email,
            original_order_number: order.order_number,
          },
        }),
      });
      status = response.status;
      result = await response.json().catch(() => ({}));
    } catch (err: any) {
      status = 503;
      result = { message: err?.message || 'Network error' };
    }

    if (result.status === 1 && result.data?.authorization_url) {
      const refs: string[] = Array.isArray(order.metadata?.moolre_refs) ? order.metadata!.moolre_refs : [];
      await mergeOrderMetadata(order.order_number, {
        moolre_unique_ref: uniqueRef,
        moolre_refs: [...refs, uniqueRef].slice(-10),
        moolre_init_at: new Date().toISOString(),
      }).catch((e) => console.warn('[Moolre] Could not save payment ref:', e));
      return { url: result.data.authorization_url, reference: result.data.reference };
    }

    lastMessage = result.message || lastMessage;
    if (!isTransient(status, lastMessage)) break;
    if (attempt < 3) await new Promise((r) => setTimeout(r, 400 * attempt));
  }
  console.error(`[Moolre] Could not create link for ${order.order_number}:`, lastMessage);
  return { error: "We couldn't start your payment right now. Please try again in a moment." };
}

/**
 * Confirm an order with Moolre and mark it paid if (and only if) Moolre says a
 * transaction for it succeeded for the full amount. Safe to call repeatedly.
 */
export async function confirmMoolrePayment(
  orderNumber: string,
  extraRefs: string[] = []
): Promise<{ paid: boolean; order: any | null; justPaid: boolean }> {
  const order = await loadOrderByRef(orderNumber);
  if (!order) return { paid: false, order: null, justPaid: false };
  if (order.payment_status === 'paid') return { paid: true, order, justPaid: false };
  if (!moolreConfigured()) return { paid: false, order, justPaid: false };

  const meta = order.metadata || {};
  const refs = Array.from(
    new Set(
      [
        ...extraRefs.filter((r) => baseOrderRef(r) === order.order_number),
        ...(Array.isArray(meta.moolre_refs) ? meta.moolre_refs : []),
        meta.moolre_unique_ref,
        order.order_number,
      ].filter((r): r is string => typeof r === 'string' && r.length > 0)
    )
  ).reverse();

  for (const ref of refs) {
    try {
      const status = await checkMoolreStatus(ref);
      if (!status.paid) continue;
      // No amount from Moolre means we can't prove the full total was paid.
      if (status.amount === null || Math.abs(status.amount - Number(order.total)) > 0.01) {
        console.error('[Moolre] Amount mismatch for', order.order_number, 'expected', order.total, 'got', status.amount);
        continue;
      }
      // Claim the order first so a callback and a redirect check racing each
      // other only send one confirmation.
      const { data: claimed } = await supabaseAdmin
        .from('orders')
        .update({ payment_status: 'paid' })
        .eq('order_number', order.order_number)
        .neq('payment_status', 'paid')
        .select('id');
      const won = Array.isArray(claimed) && claimed.length > 0;
      const { data: paidOrder, error } = await supabaseAdmin.rpc('mark_order_paid', {
        order_ref: order.order_number,
        moolre_ref: status.reference || ref,
      });
      if (error) {
        console.error('[Moolre] mark_order_paid failed:', error.message);
        return { paid: false, order, justPaid: false };
      }
      return { paid: true, order: paidOrder || order, justPaid: won };
    } catch (err: any) {
      console.warn('[Moolre] Status check failed for', ref, err?.message);
    }
  }
  return { paid: false, order, justPaid: false };
}

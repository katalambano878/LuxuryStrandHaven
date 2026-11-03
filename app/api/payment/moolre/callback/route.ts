import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendOrderConfirmation } from '@/lib/notifications';
import { checkRateLimit, getClientIdentifier, RATE_LIMITS } from '@/lib/rate-limit';
import { ORDER_REF, baseOrderRef, confirmMoolrePayment, mergeOrderMetadata } from '@/lib/moolre';

/**
 * Moolre callback (webhook). Payload shape:
 * {
 *   "status": 1, "code": "P01", "message": "Transaction Successful",
 *   "data": { "txtstatus": 1, "amount": "2", "transactionid": "42252702",
 *             "externalref": "ORD-1770330034217-441-R1770330034999", ... },
 *   "secret": "c23bc2ab-...", "ts": "2026-02-05 22:21:16"
 * }
 *
 * The body is only a hint. The order is marked paid after Moolre's status
 * API confirms the transaction and the amount (see lib/moolre.ts), so a forged
 * callback cannot mark anything paid.
 */
export async function POST(req: Request) {
    try {
        const clientId = getClientIdentifier(req);
        const rateLimitResult = checkRateLimit(`callback:${clientId}`, RATE_LIMITS.callback);
        if (!rateLimitResult.success) {
            return NextResponse.json({ success: false, message: 'Too many requests' }, { status: 429 });
        }

        let body: any = {};
        const contentType = req.headers.get('content-type') || '';
        try {
            if (contentType.includes('application/json')) {
                body = await req.json();
            } else if (contentType.includes('form')) {
                body = Object.fromEntries((await req.formData()).entries());
            } else {
                const rawText = await req.text();
                try {
                    body = JSON.parse(rawText);
                } catch {
                    body = Object.fromEntries(new URLSearchParams(rawText).entries());
                }
            }
        } catch {
            return NextResponse.json({ success: false, message: 'Invalid Request Body' }, { status: 400 });
        }

        const data = body.data || {};
        const rawExternalRef = String(
            data.externalref || data.external_reference || body.externalref || body.external_reference || ''
        );
        const orderRef = rawExternalRef
            ? baseOrderRef(rawExternalRef)
            : String(data.metadata?.original_order_number || body.metadata?.original_order_number || '');

        if (!orderRef || !ORDER_REF.test(orderRef)) {
            console.error('[Callback] Missing or invalid order reference');
            return NextResponse.json({ success: false, message: 'Missing order reference' }, { status: 400 });
        }

        const expectedSecret = process.env.MOOLRE_CALLBACK_SECRET;
        const secretOk = !!expectedSecret && body.secret === expectedSecret;
        if (expectedSecret && body.secret && !secretOk) {
            console.error('[Callback] Secret mismatch for', orderRef);
            return NextResponse.json({ success: false, message: 'Invalid secret' }, { status: 403 });
        }

        const result = await confirmMoolrePayment(orderRef, rawExternalRef ? [rawExternalRef] : []);
        if (!result.order) {
            return NextResponse.json({ success: false, message: 'Order not found' }, { status: 404 });
        }

        if (result.paid) {
            if (result.justPaid) {
                console.log('[Callback] Order paid:', orderRef);
                if (result.order.email) {
                    try {
                        await supabaseAdmin.rpc('update_customer_stats', {
                            p_customer_email: result.order.email,
                            p_order_total: result.order.total
                        });
                    } catch (statsError: any) {
                        console.error('[Callback] Customer stats failed:', statsError.message);
                    }
                }
                try {
                    await sendOrderConfirmation(result.order);
                } catch (notifyError: any) {
                    console.error('[Callback] Notification failed:', notifyError.message);
                }
            }
            return NextResponse.json({ success: true, message: 'Payment verified and order updated' });
        }

        // Only a callback carrying our secret may record a failure, and it never
        // overwrites the rest of the order's metadata.
        const txFailed = data.txtstatus === 2 || data.txtstatus === '2' || /fail|declin|cancel/i.test(String(body.message || ''));
        if (secretOk && txFailed && result.order.payment_status !== 'paid') {
            await supabaseAdmin
                .from('orders')
                .update({ payment_status: 'failed' })
                .eq('order_number', orderRef)
                .neq('payment_status', 'paid');
            await mergeOrderMetadata(orderRef, {
                moolre_reference: data.transactionid || null,
                failure_reason: String(body.message || 'Payment failed').slice(0, 200),
            });
        }

        return NextResponse.json({ success: false, message: 'Payment not confirmed' });
    } catch (error: any) {
        console.error('[Callback] Critical Error:', error.message);
        return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
    }
}

export async function GET() {
    return NextResponse.json({ message: 'Moolre callback endpoint ready' });
}

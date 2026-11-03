import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendOrderConfirmation } from '@/lib/notifications';
import { checkRateLimit, getClientIdentifier, RATE_LIMITS } from '@/lib/rate-limit';
import { ORDER_REF, confirmMoolrePayment } from '@/lib/moolre';

/**
 * Payment verification endpoint, called from the order-success and class
 * join pages after the customer comes back from Moolre.
 *
 * The redirect itself proves nothing (anyone can open that URL), so the order
 * is only marked paid when Moolre's status API confirms the transaction.
 */
export async function POST(req: Request) {
    try {
        const clientId = getClientIdentifier(req);
        const rateLimitResult = checkRateLimit(`verify:${clientId}`, RATE_LIMITS.payment);
        if (!rateLimitResult.success) {
            return NextResponse.json({ success: false, message: 'Too many requests' }, { status: 429 });
        }

        const { orderNumber } = await req.json().catch(() => ({}));

        if (!orderNumber || typeof orderNumber !== 'string' || !ORDER_REF.test(orderNumber)) {
            return NextResponse.json({ success: false, message: 'Missing or invalid orderNumber' }, { status: 400 });
        }

        const result = await confirmMoolrePayment(orderNumber);
        if (!result.order) {
            return NextResponse.json({ success: false, message: 'Order not found' }, { status: 404 });
        }

        if (!result.paid) {
            return NextResponse.json({
                success: false,
                status: result.order.status,
                payment_status: result.order.payment_status,
                message: 'Payment not yet confirmed by the payment provider',
            });
        }

        if (result.justPaid) {
            await afterPaid(result.order);
        }

        return NextResponse.json({
            success: true,
            status: result.order.status || 'processing',
            payment_status: 'paid',
            message: 'Payment verified',
        });
    } catch (error: any) {
        console.error('[Verify] Error:', error.message);
        return NextResponse.json({ success: false, message: 'Internal error' }, { status: 500 });
    }
}

async function afterPaid(order: any) {
    if (order?.email) {
        try {
            await supabaseAdmin.rpc('update_customer_stats', {
                p_customer_email: order.email,
                p_order_total: order.total
            });
        } catch (statsError: any) {
            console.error('[Verify] Customer stats failed:', statsError.message);
        }
    }
    try {
        await sendOrderConfirmation(order);
    } catch (notifyError: any) {
        console.error('[Verify] Notification failed:', notifyError.message);
    }
}

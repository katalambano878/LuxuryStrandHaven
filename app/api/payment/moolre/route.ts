import { NextResponse } from 'next/server';
import { checkRateLimit, getClientIdentifier, RATE_LIMITS } from '@/lib/rate-limit';
import { appBaseUrl, createMoolreLink, loadOrderByRef, moolreConfigured } from '@/lib/moolre';

export async function POST(req: Request) {
    try {
        // Rate limiting
        const clientId = getClientIdentifier(req);
        const rateLimitResult = checkRateLimit(`payment:${clientId}`, RATE_LIMITS.payment);

        if (!rateLimitResult.success) {
            return NextResponse.json(
                { success: false, message: 'Too many requests. Please try again later.' },
                {
                    status: 429,
                    headers: {
                        'X-RateLimit-Remaining': '0',
                        'X-RateLimit-Reset': rateLimitResult.resetIn.toString()
                    }
                }
            );
        }

        const body = await req.json().catch(() => ({}));
        const { orderId, customerEmail } = body;

        if (!orderId || typeof orderId !== 'string') {
            return NextResponse.json({ success: false, message: 'Missing orderId' }, { status: 400 });
        }

        if (!moolreConfigured()) {
            console.error('Missing Moolre credentials');
            return NextResponse.json({ success: false, message: 'Payment gateway configuration error' }, { status: 500 });
        }

        // The amount always comes from the order in the database, never from the browser.
        const order = await loadOrderByRef(orderId);
        if (!order) {
            return NextResponse.json({ success: false, message: 'Order not found' }, { status: 404 });
        }
        if (order.payment_status === 'paid') {
            return NextResponse.json({ success: false, message: 'This order is already paid' }, { status: 400 });
        }
        if (order.metadata?.type === 'academia') {
            return NextResponse.json({ success: false, message: 'Pay for classes from the Academia page' }, { status: 400 });
        }

        const link = await createMoolreLink(order, {
            baseUrl: appBaseUrl(req),
            redirectPath: `/order-success?order=${encodeURIComponent(order.order_number)}&payment_success=true`,
            customerEmail: typeof customerEmail === 'string' ? customerEmail : undefined,
        });

        if ('error' in link) {
            return NextResponse.json({ success: false, message: link.error }, { status: 502 });
        }
        return NextResponse.json({ success: true, url: link.url, reference: link.reference });
    } catch (error: any) {
        console.error('Payment API Error:', error);
        return NextResponse.json({ success: false, message: 'Internal Server Error' }, { status: 500 });
    }
}

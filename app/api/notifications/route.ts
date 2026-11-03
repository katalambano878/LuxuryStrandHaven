import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendOrderConfirmation, sendOrderStatusUpdate, sendWelcomeMessage, sendContactMessage, sendPaymentLink, sendEmail, sendSMS, emailLayout, escapeHtml } from '@/lib/notifications';
import { checkRateLimit, getClientIdentifier, RATE_LIMITS } from '@/lib/rate-limit';

export async function POST(request: Request) {
    try {
        // Rate limiting
        const clientId = getClientIdentifier(request);
        const rateLimitResult = checkRateLimit(`notification:${clientId}`, RATE_LIMITS.notification);
        
        if (!rateLimitResult.success) {
            return NextResponse.json(
                { error: 'Too many requests. Please try again later.' },
                { 
                    status: 429,
                    headers: {
                        'X-RateLimit-Remaining': '0',
                        'X-RateLimit-Reset': rateLimitResult.resetIn.toString()
                    }
                }
            );
        }

        const body = await request.json();
        const { type, payload } = body;

        if (!payload || typeof payload !== 'object') {
            return NextResponse.json({ error: 'Payload required' }, { status: 400 });
        }

        // Everything that sends to a customer or uses order data needs staff.
        // Only 'contact' (to the store) and 'welcome' (to the signed-in user) are public.
        const requiresAdminAuth = ['campaign', 'order_updated', 'order_status', 'order_created', 'payment_link'].includes(type);
        const authToken = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();

        if (requiresAdminAuth) {
            if (!authToken) {
                return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
            }

            const { data: { user }, error } = await supabaseAdmin.auth.getUser(authToken);
            if (error || !user) {
                console.error('[Notifications] Auth failed:', error?.message);
                return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
            }

            const { data: profile, error: profileError } = await supabaseAdmin
                .from('profiles')
                .select('role')
                .eq('id', user.id)
                .single();

            if (profileError) {
                console.error('[Notifications] Profile lookup failed:', profileError.message);
                return NextResponse.json({ error: 'Failed to verify admin role' }, { status: 500 });
            }

            if (!profile || (profile.role !== 'admin' && profile.role !== 'staff')) {
                return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 });
            }
        }

        if (type === 'welcome') {
            // Send only to the account that just signed up, never to an address in the body.
            if (!authToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
            const { data: { user } } = await supabaseAdmin.auth.getUser(authToken);
            if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
            const createdAt = new Date(user.created_at || 0).getTime();
            if (!createdAt || Date.now() - createdAt > 15 * 60 * 1000) {
                return NextResponse.json({ success: true, message: 'Welcome already sent' });
            }
            const meta = (user.user_metadata || {}) as Record<string, unknown>;
            await sendWelcomeMessage({
                email: user.email,
                firstName: escapeHtml(String(meta.first_name || meta.full_name || 'there').slice(0, 80)),
            });
            return NextResponse.json({ success: true, message: 'Welcome message sent' });
        }

        if (type === 'order_created') {
            const ref = payload.order_number || payload.id;
            const { data: dbOrder } = await supabaseAdmin
                .from('orders')
                .select('*')
                .eq(payload.order_number ? 'order_number' : 'id', ref)
                .maybeSingle();
            if (!dbOrder) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
            await sendOrderConfirmation(dbOrder);
            return NextResponse.json({ success: true, message: 'Order confirmation sent' });
        }

        if (type === 'order_updated') {
            const { order, status } = payload;
            await sendOrderStatusUpdate(order, status);
            return NextResponse.json({ success: true, message: 'Status update sent' });
        }

        // Handle order_status from admin panel (different payload structure)
        if (type === 'order_status') {
            const { email, name, orderNumber, status, trackingNumber, phone } = payload;
            
            // Fetch full order data to get metadata (tracking number etc.)
            const { data: fullOrder } = await supabaseAdmin
                .from('orders')
                .select('id, order_number, email, phone, shipping_address, metadata')
                .eq('order_number', orderNumber)
                .single();
            
            // Build order object for sendOrderStatusUpdate
            const orderData = fullOrder || {
                order_number: orderNumber,
                email: email,
                phone: phone,
                shipping_address: { firstName: name, phone: phone },
                metadata: { tracking_number: trackingNumber }
            };
            
            // Ensure phone is set (from payload if not in DB)
            if (!orderData.phone && phone) {
                orderData.phone = phone;
            }
            
            await sendOrderStatusUpdate(orderData, status);
            return NextResponse.json({ success: true, message: 'Status update sent' });
        }

        if (type === 'contact') {
            if (!payload.email || !payload.message) {
                return NextResponse.json({ error: 'Email and message are required' }, { status: 400 });
            }
            await sendContactMessage(payload);
            return NextResponse.json({ success: true, message: 'Contact message sent' });
        }

        if (type === 'payment_link') {
            const ref = payload.order_number || payload.id;
            const { data: dbOrder } = await supabaseAdmin
                .from('orders')
                .select('*')
                .eq(payload.order_number ? 'order_number' : 'id', ref)
                .maybeSingle();
            if (!dbOrder) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
            await sendPaymentLink(dbOrder);
            return NextResponse.json({ success: true, message: 'Payment link sent' });
        }

        if (type === 'campaign') {
            const { recipients, subject, message, channels } = payload;
            if (!Array.isArray(recipients) || typeof message !== 'string' || !channels) {
                return NextResponse.json({ error: 'Recipients, message and channels are required' }, { status: 400 });
            }

            // Deduplicate phone numbers and emails server-side as safety net
            const seenPhones = new Set<string>();
            const seenEmails = new Set<string>();
            const results = { email: 0, sms: 0, errors: 0 };

            for (const recipient of recipients) {
                try {
                    // Send email (skip duplicates)
                    if (channels.email && recipient.email) {
                        const emailKey = recipient.email.toLowerCase().trim();
                        if (!seenEmails.has(emailKey)) {
                            seenEmails.add(emailKey);
                            const brandedHtml = emailLayout(`
<h2 style="margin:0 0 16px;color:#111827;font-size:22px;text-align:center;">${subject}</h2>
<p style="color:#374151;font-size:14px;line-height:1.7;margin:16px 0;">Hi ${recipient.name || 'Valued Customer'},</p>
<p style="color:#374151;font-size:14px;line-height:1.7;margin:0 0 16px;">${message.replace(/\n/g, '</p><p style="color:#374151;font-size:14px;line-height:1.7;margin:0 0 16px;">')}</p>
`, subject);
                            await sendEmail({
                                to: recipient.email,
                                subject: subject,
                                html: brandedHtml
                            });
                            results.email++;
                        }
                    }

                    // Send SMS (skip duplicates)
                    if (channels.sms && recipient.phone) {
                        const phoneKey = recipient.phone.replace(/[\s\-\(\)\.]+/g, '');
                        if (!seenPhones.has(phoneKey)) {
                            seenPhones.add(phoneKey);
                            await sendSMS({
                                to: recipient.phone,
                                message: message
                            });
                            results.sms++;
                        }
                    }
                } catch (err: any) {
                    console.error(`[Campaign] Failed for ${recipient.email || recipient.phone}:`, err.message);
                    results.errors++;
                }
            }

            return NextResponse.json({ 
                success: true, 
                message: `Campaign sent: ${results.email} emails, ${results.sms} SMS.${results.errors > 0 ? ` (${results.errors} failed)` : ''}` 
            });
        }

        return NextResponse.json({ error: 'Invalid notification type' }, { status: 400 });

    } catch (error: any) {
        console.error('Notification API Error:', error);
        return NextResponse.json({ error: 'Could not send the notification' }, { status: 500 });
    }
}

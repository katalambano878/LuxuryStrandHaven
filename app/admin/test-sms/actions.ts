'use server';

import { verifyAdminToken } from '@/lib/auth';
import { sendSMS } from '@/lib/notifications';

/** Sends a test SMS through the same Moolre path real notifications use. */
export async function testSmsAction(phone: string, message: string, accessToken: string) {
    // Server actions are public endpoints; check the caller here, not just in middleware.
    if (!(await verifyAdminToken(accessToken))) {
        return { success: false, error: 'Admin access required' };
    }
    const to = String(phone || '').trim();
    const text = String(message || '').trim().slice(0, 480);
    if (!/^[+\d][\d\s()-]{6,20}$/.test(to) || !text) {
        return { success: false, error: 'Enter a phone number and a message.' };
    }
    try {
        const result: any = await sendSMS({ to, message: text });
        if (!result) {
            return { success: false, error: 'SMS is not configured (set MOOLRE_SMS_API_KEY).' };
        }
        return {
            success: result.status === 1,
            result,
        };
    } catch (error: any) {
        return { success: false, error: error?.message || 'SMS failed' };
    }
}

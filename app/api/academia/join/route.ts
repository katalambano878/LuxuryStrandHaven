import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sendOrderConfirmation } from "@/lib/notifications";
import { checkRateLimit, getClientIdentifier, RATE_LIMITS } from "@/lib/rate-limit";
import { ORDER_REF, confirmMoolrePayment } from "@/lib/moolre";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const rate = checkRateLimit(`academia-join:${getClientIdentifier(req)}`, RATE_LIMITS.payment);
    if (!rate.success) {
      return NextResponse.json({ success: false, message: "Too many attempts. Please wait and try again." }, { status: 429 });
    }

    const { orderNumber } = await req.json().catch(() => ({}));
    if (!orderNumber || typeof orderNumber !== "string" || !ORDER_REF.test(orderNumber)) {
      return NextResponse.json({ success: false, message: "Missing payment reference." }, { status: 400 });
    }

    // Only Moolre's status API can confirm the class was paid for.
    const verified = await confirmMoolrePayment(orderNumber);
    if (verified.justPaid) {
      sendOrderConfirmation(verified.order).catch((e: Error) => console.error("[Academia join] notify", e.message));
    }

    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("payment_status, metadata")
      .eq("order_number", orderNumber)
      .single();

    if (!order || order.metadata?.type !== "academia") {
      return NextResponse.json({ success: false, message: "Class payment not found." }, { status: 404 });
    }

    if (order.payment_status !== "paid" && !verified.paid) {
      return NextResponse.json({ success: false, message: "Payment is not confirmed yet." }, { status: 402 });
    }

    const url = order.metadata?.telegram_url || order.metadata?.youtube_url;
    if (!url) {
      return NextResponse.json({ success: false, message: "This class has no join link yet." }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      url,
      title: order.metadata?.course_title || "your class",
    });
  } catch (error) {
    console.error("[Academia join]", error);
    return NextResponse.json({ success: false, message: "Could not open the class." }, { status: 500 });
  }
}

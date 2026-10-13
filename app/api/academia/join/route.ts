import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { orderNumber } = await req.json();
    if (!orderNumber || typeof orderNumber !== "string") {
      return NextResponse.json({ success: false, message: "Missing payment reference." }, { status: 400 });
    }

    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin).replace(/\/+$/, "");
    const verifyRes = await fetch(`${baseUrl}/api/payment/moolre/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderNumber, fromRedirect: true }),
    });
    const verified = await verifyRes.json();

    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("payment_status, metadata")
      .eq("order_number", orderNumber)
      .single();

    if (!order || order.metadata?.type !== "academia") {
      return NextResponse.json({ success: false, message: "Class payment not found." }, { status: 404 });
    }

    if (order.payment_status !== "paid" && verified?.payment_status !== "paid") {
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

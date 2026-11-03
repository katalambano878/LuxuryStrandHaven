import { NextResponse } from "next/server";
import { randomInt } from "crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { checkRateLimit, getClientIdentifier, RATE_LIMITS } from "@/lib/rate-limit";
import { appBaseUrl, createMoolreLink, moolreConfigured } from "@/lib/moolre";

export const dynamic = "force-dynamic";

function clean(value: unknown, max = 120): string {
  return String(value || "").trim().slice(0, max);
}

export async function POST(req: Request) {
  try {
    const clientId = getClientIdentifier(req);
    const rate = checkRateLimit(`academia:${clientId}`, RATE_LIMITS.payment);
    if (!rate.success) {
      return NextResponse.json({ success: false, message: "Too many attempts. Please wait and try again." }, { status: 429 });
    }

    const body = await req.json();
    const courseId = clean(body.courseId, 80);
    const name = clean(body.name, 80);
    const email = clean(body.email, 120).toLowerCase();
    const phone = clean(body.phone, 30);

    if (!courseId || !name || !email || !phone) {
      return NextResponse.json({ success: false, message: "Name, email and phone are required." }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ success: false, message: "Enter a valid email address." }, { status: 400 });
    }

    const { data: course, error: courseError } = await supabaseAdmin
      .from("academia_courses")
      .select("id, title, price, telegram_url, youtube_url, status")
      .eq("id", courseId)
      .eq("status", "active")
      .single();

    if (courseError || !course) {
      return NextResponse.json({ success: false, message: "This class is not available." }, { status: 404 });
    }

    const price = Number(course.price) || 0;
    const classUrl = course.telegram_url || course.youtube_url || "";
    if (!classUrl) {
      return NextResponse.json({ success: false, message: "This class does not have a join link yet." }, { status: 400 });
    }

    if (price <= 0) {
      return NextResponse.json({ success: true, free: true, url: classUrl });
    }

    if (!moolreConfigured()) {
      return NextResponse.json({ success: false, message: "Payment is not configured." }, { status: 500 });
    }

    const orderNumber = `CLS-${Date.now()}-${randomInt(100000, 1000000)}`;
    const address = {
      full_name: name,
      email,
      phone,
      address_line1: "Online class",
      city: "Accra",
      country: "Ghana",
    };

    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .insert([{
        order_number: orderNumber,
        email,
        phone,
        status: "pending",
        payment_status: "pending",
        currency: "GHS",
        subtotal: price,
        tax_total: 0,
        shipping_total: 0,
        discount_total: 0,
        total: price,
        shipping_method: "digital",
        payment_method: "moolre",
        shipping_address: address,
        billing_address: address,
        metadata: {
          type: "academia",
          course_id: course.id,
          course_title: course.title,
          telegram_url: course.telegram_url,
          youtube_url: course.youtube_url,
          payment_method: "moolre",
          first_name: name,
        },
      }])
      .select("id, order_number")
      .single();

    if (orderError || !order) {
      console.error("[Academia checkout] order insert", orderError);
      return NextResponse.json({ success: false, message: "Could not start checkout." }, { status: 500 });
    }

    const { error: itemError } = await supabaseAdmin.from("order_items").insert([{
      order_id: order.id,
      product_name: course.title,
      quantity: 1,
      unit_price: price,
      total_price: price,
      metadata: { type: "academia", course_id: course.id },
    }]);

    if (itemError) {
      console.error("[Academia checkout] item insert", itemError);
      return NextResponse.json({ success: false, message: "Could not start checkout." }, { status: 500 });
    }

    const link = await createMoolreLink(
      { ...order, total: price, email, payment_status: "pending", metadata: null },
      {
        baseUrl: appBaseUrl(req),
        redirectPath: `/academia/join?order=${encodeURIComponent(orderNumber)}&payment_success=true`,
        customerEmail: email,
      }
    );
    if ("error" in link) {
      return NextResponse.json({ success: false, message: link.error }, { status: 502 });
    }
    return NextResponse.json({ success: true, url: link.url });
  } catch (error) {
    console.error("[Academia checkout]", error);
    return NextResponse.json({ success: false, message: "Could not start payment." }, { status: 500 });
  }
}

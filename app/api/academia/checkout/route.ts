import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { checkRateLimit, getClientIdentifier, RATE_LIMITS } from "@/lib/rate-limit";

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

    if (!process.env.MOOLRE_API_USER || !process.env.MOOLRE_API_PUBKEY || !process.env.MOOLRE_ACCOUNT_NUMBER) {
      return NextResponse.json({ success: false, message: "Payment is not configured." }, { status: 500 });
    }

    const orderNumber = `CLS-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
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

    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin).replace(/\/+$/, "");
    const payload = {
      type: 1,
      amount: price.toString(),
      email: process.env.MOOLRE_MERCHANT_EMAIL || email,
      externalref: `${orderNumber}-R${Date.now()}`,
      callback: `${baseUrl}/api/payment/moolre/callback`,
      redirect: `${baseUrl}/academia/join?order=${encodeURIComponent(orderNumber)}&payment_success=true`,
      reusable: "0",
      currency: "GHS",
      accountnumber: process.env.MOOLRE_ACCOUNT_NUMBER,
      metadata: {
        customer_email: email,
        original_order_number: orderNumber,
        course_id: course.id,
      },
    };

    const response = await fetch("https://api.moolre.com/embed/link", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-USER": process.env.MOOLRE_API_USER,
        "X-API-PUBKEY": process.env.MOOLRE_API_PUBKEY,
      },
      body: JSON.stringify(payload),
    });
    const result = await response.json();

    if (result.status === 1 && result.data?.authorization_url) {
      return NextResponse.json({ success: true, url: result.data.authorization_url });
    }

    return NextResponse.json(
      { success: false, message: result.message || "Could not open the payment page." },
      { status: 400 }
    );
  } catch (error) {
    console.error("[Academia checkout]", error);
    return NextResponse.json({ success: false, message: "Could not start payment." }, { status: 500 });
  }
}

-- ============================================================================
-- LUXURY STRAND HAVEN — COMPLETE DATABASE SCHEMA (single-shot clone)
--
-- Run this ONE file on a fresh Supabase project and it will create the
-- entire database: extensions, enums, tables, functions, indexes, triggers,
-- RLS policies, storage buckets and storage policies.
--
-- This file is IDEMPOTENT: you can run it multiple times without errors.
-- Use this when you want to clone the site into a brand-new Supabase project.
--
-- Usage (Supabase Dashboard):
--   1. Create a new Supabase project
--   2. Open SQL Editor
--   3. Paste this entire file and click Run
--   4. (Optional) Run supabase/seed.sql afterwards for default data
-- ============================================================================

-- ============================================================================
-- 1. EXTENSIONS
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

-- ============================================================================
-- 2. ENUM TYPES (guarded)
-- ============================================================================
DO $$ BEGIN CREATE TYPE user_role       AS ENUM ('admin','staff','customer'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE gender_type     AS ENUM ('male','female','other','prefer_not_to_say'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE address_type    AS ENUM ('shipping','billing','both'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE product_status  AS ENUM ('active','draft','archived'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE category_status AS ENUM ('active','inactive'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE order_status    AS ENUM ('pending','awaiting_payment','processing','shipped','delivered','cancelled','refunded'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE payment_status  AS ENUM ('pending','paid','failed','refunded','partially_refunded'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE discount_type   AS ENUM ('percentage','fixed_amount','free_shipping'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE review_status   AS ENUM ('pending','approved','rejected'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE blog_status     AS ENUM ('draft','published','archived'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ticket_status   AS ENUM ('open','in_progress','waiting_customer','resolved','closed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ticket_priority AS ENUM ('low','medium','high','urgent'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE return_status   AS ENUM ('pending','approved','rejected','processing','completed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- 3. UTILITY FUNCTION (no table deps — needed by triggers)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- ============================================================================
-- 4. TABLES
-- ============================================================================

-- Profiles (extends auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE,
  role user_role DEFAULT 'customer'::user_role,
  full_name text,
  phone text,
  avatar_url text,
  date_of_birth date,
  gender gender_type,
  preferences jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Addresses
CREATE TABLE IF NOT EXISTS public.addresses (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  type address_type DEFAULT 'shipping'::address_type,
  is_default boolean DEFAULT false,
  label text,
  full_name text NOT NULL,
  phone text NOT NULL,
  address_line1 text NOT NULL,
  address_line2 text,
  city text NOT NULL,
  state text NOT NULL,
  postal_code text NOT NULL,
  country text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Store Settings (key/value for CMS + toggles)
CREATE TABLE IF NOT EXISTS public.store_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  description text,
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

-- Audit Logs
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  user_id uuid REFERENCES auth.users(id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  details jsonb,
  ip_address text,
  created_at timestamptz DEFAULT now()
);

-- Categories
CREATE TABLE IF NOT EXISTS public.categories (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  parent_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  image_url text,
  position integer DEFAULT 0,
  status category_status DEFAULT 'active'::category_status,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Products
CREATE TABLE IF NOT EXISTS public.products (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  short_description text,
  price numeric NOT NULL,
  compare_at_price numeric,
  cost_per_item numeric,
  sku text UNIQUE,
  barcode text,
  quantity integer DEFAULT 0,
  track_quantity boolean DEFAULT true,
  continue_selling boolean DEFAULT false,
  weight numeric,
  weight_unit text DEFAULT 'kg'::text,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  brand text,
  vendor text,
  tags text[],
  status product_status DEFAULT 'active'::product_status,
  featured boolean DEFAULT false,
  options jsonb DEFAULT '[]'::jsonb,
  external_id text,
  external_source text,
  seo_title text,
  seo_description text,
  rating_avg numeric DEFAULT 0,
  review_count integer DEFAULT 0,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  moq integer DEFAULT 1 CHECK (moq >= 1)
);
COMMENT ON COLUMN public.products.moq IS 'Minimum Order Quantity';

-- Product Images
CREATE TABLE IF NOT EXISTS public.product_images (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  url text NOT NULL,
  alt_text text,
  position integer DEFAULT 0,
  width integer,
  height integer,
  created_at timestamptz DEFAULT now()
);

-- Product Variants
CREATE TABLE IF NOT EXISTS public.product_variants (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  name text NOT NULL,
  sku text UNIQUE,
  price numeric NOT NULL,
  compare_at_price numeric,
  cost_per_item numeric,
  quantity integer DEFAULT 0,
  weight numeric,
  option1 text,
  option2 text,
  option3 text,
  image_url text,
  barcode text,
  external_id text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Product <-> Category (many-to-many; primary category still in products.category_id)
CREATE TABLE IF NOT EXISTS public.product_category_links (
  product_id  uuid NOT NULL REFERENCES public.products(id)   ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  is_primary  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, category_id)
);

-- Coupons
CREATE TABLE IF NOT EXISTS public.coupons (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  code text NOT NULL UNIQUE,
  description text,
  type discount_type NOT NULL,
  value numeric NOT NULL,
  minimum_purchase numeric DEFAULT 0,
  maximum_discount numeric,
  usage_limit integer,
  usage_count integer DEFAULT 0,
  per_user_limit integer DEFAULT 1,
  start_date timestamptz,
  end_date timestamptz,
  is_active boolean DEFAULT true,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Orders
CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  order_number text NOT NULL UNIQUE,
  user_id uuid REFERENCES auth.users(id),
  email text NOT NULL,
  phone text,
  status order_status DEFAULT 'pending'::order_status,
  payment_status payment_status DEFAULT 'pending'::payment_status,
  currency text DEFAULT 'USD'::text,
  subtotal numeric NOT NULL,
  tax_total numeric DEFAULT 0,
  shipping_total numeric DEFAULT 0,
  discount_total numeric DEFAULT 0,
  total numeric NOT NULL,
  shipping_method text,
  payment_method text,
  payment_provider text,
  payment_transaction_id text,
  notes text,
  cancel_reason text,
  shipping_address jsonb NOT NULL,
  billing_address jsonb NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  payment_reminder_sent boolean DEFAULT false,
  payment_reminder_sent_at timestamptz
);

-- Order Items
CREATE TABLE IF NOT EXISTS public.order_items (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  variant_name text,
  sku text,
  quantity integer NOT NULL,
  unit_price numeric NOT NULL,
  total_price numeric NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Order Status History
CREATE TABLE IF NOT EXISTS public.order_status_history (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  status order_status NOT NULL,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

-- Cart Items
CREATE TABLE IF NOT EXISTS public.cart_items (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES public.product_variants(id) ON DELETE CASCADE,
  quantity integer NOT NULL DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, product_id, variant_id)
);

-- Wishlist Items
CREATE TABLE IF NOT EXISTS public.wishlist_items (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, product_id)
);

-- Reviews
CREATE TABLE IF NOT EXISTS public.reviews (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  title text,
  content text,
  status review_status DEFAULT 'pending'::review_status,
  verified_purchase boolean DEFAULT false,
  helpful_votes integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Review Images
CREATE TABLE IF NOT EXISTS public.review_images (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  review_id uuid REFERENCES public.reviews(id) ON DELETE CASCADE,
  url text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Blog Posts
CREATE TABLE IF NOT EXISTS public.blog_posts (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  title text NOT NULL,
  slug text NOT NULL UNIQUE,
  excerpt text,
  content text NOT NULL,
  featured_image text,
  author_id uuid REFERENCES auth.users(id),
  status blog_status DEFAULT 'draft'::blog_status,
  published_at timestamptz,
  seo_title text,
  seo_description text,
  tags text[],
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Support Tickets
CREATE SEQUENCE IF NOT EXISTS support_tickets_ticket_number_seq;
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  ticket_number integer NOT NULL DEFAULT nextval('support_tickets_ticket_number_seq'),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email text NOT NULL,
  subject text NOT NULL,
  description text,
  category text,
  status ticket_status DEFAULT 'open'::ticket_status,
  priority ticket_priority DEFAULT 'medium'::ticket_priority,
  assigned_to uuid REFERENCES auth.users(id),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Support Messages
CREATE TABLE IF NOT EXISTS public.support_messages (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  ticket_id uuid REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  message text NOT NULL,
  attachments jsonb DEFAULT '[]'::jsonb,
  is_internal boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Return Requests
CREATE TABLE IF NOT EXISTS public.return_requests (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status return_status DEFAULT 'pending'::return_status,
  reason text NOT NULL,
  description text,
  refund_amount numeric,
  refund_method text,
  admin_notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Return Items
CREATE TABLE IF NOT EXISTS public.return_items (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  return_request_id uuid REFERENCES public.return_requests(id) ON DELETE CASCADE,
  order_item_id uuid REFERENCES public.order_items(id) ON DELETE SET NULL,
  quantity integer NOT NULL,
  reason text,
  condition text,
  created_at timestamptz DEFAULT now()
);

-- Notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  message text,
  data jsonb,
  read_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Pages (CMS)
CREATE TABLE IF NOT EXISTS public.pages (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  title text NOT NULL,
  slug text NOT NULL UNIQUE,
  content text,
  status text DEFAULT 'draft'::text,
  seo_title text,
  seo_description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Site Settings (categorised key-value)
CREATE TABLE IF NOT EXISTS public.site_settings (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  key text NOT NULL UNIQUE,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  category text NOT NULL DEFAULT 'general'::text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- CMS Content blocks
CREATE TABLE IF NOT EXISTS public.cms_content (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  section text NOT NULL,
  block_key text NOT NULL,
  title text,
  subtitle text,
  content text,
  image_url text,
  button_text text,
  button_url text,
  metadata jsonb DEFAULT '{}'::jsonb,
  sort_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(section, block_key)
);

-- Banners
CREATE TABLE IF NOT EXISTS public.banners (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  name text NOT NULL,
  type text NOT NULL DEFAULT 'promotional'::text,
  title text,
  subtitle text,
  image_url text,
  background_color text DEFAULT '#000000'::text,
  text_color text DEFAULT '#FFFFFF'::text,
  button_text text,
  button_url text,
  start_date timestamptz,
  end_date timestamptz,
  is_active boolean DEFAULT true,
  position text DEFAULT 'top'::text,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Navigation
CREATE TABLE IF NOT EXISTS public.navigation_menus (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  name text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.navigation_items (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  menu_id uuid REFERENCES public.navigation_menus(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.navigation_items(id) ON DELETE CASCADE,
  label text NOT NULL,
  url text NOT NULL,
  icon text,
  is_external boolean DEFAULT false,
  is_active boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Store Modules (feature flags for admin dashboard)
CREATE TABLE IF NOT EXISTS public.store_modules (
  id text PRIMARY KEY,
  enabled boolean DEFAULT false,
  updated_at timestamptz DEFAULT now()
);

-- Customers (CRM / POS)
CREATE TABLE IF NOT EXISTS public.customers (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  email text NOT NULL UNIQUE,
  phone text,
  full_name text,
  first_name text,
  last_name text,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  default_address jsonb,
  notes text,
  tags text[],
  total_orders integer DEFAULT 0,
  total_spent numeric DEFAULT 0,
  last_order_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  secondary_phone text,
  secondary_email text
);

-- Academia Courses
CREATE TABLE IF NOT EXISTS public.academia_courses (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  title text NOT NULL,
  description text,
  icon text DEFAULT '📚',
  price numeric DEFAULT 0,
  youtube_url text,
  telegram_url text,
  thumbnail_url text,
  sort_order integer DEFAULT 0,
  status text DEFAULT 'active' CHECK (status IN ('active','draft')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
COMMENT ON TABLE public.academia_courses IS 'Online courses shown on /academia';

-- Contact Submissions (public contact form)
CREATE TABLE IF NOT EXISTS public.contact_submissions (
  id         uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  name       text NOT NULL,
  email      text NOT NULL,
  phone      text,
  subject    text,
  message    text NOT NULL,
  status     text NOT NULL DEFAULT 'new',
  metadata   jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- 5. TABLE-DEPENDENT FUNCTIONS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_admin_or_staff()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin','staff')
  );
END; $$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role)
  VALUES (NEW.id, NEW.email, 'customer')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.update_product_rating_stats()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  UPDATE products
  SET rating_avg = (
        SELECT COALESCE(AVG(rating), 0) FROM reviews
        WHERE product_id = COALESCE(NEW.product_id, OLD.product_id)
          AND status = 'approved'),
      review_count = (
        SELECT COUNT(*) FROM reviews
        WHERE product_id = COALESCE(NEW.product_id, OLD.product_id)
          AND status = 'approved'),
      updated_at = now()
  WHERE id = COALESCE(NEW.product_id, OLD.product_id);
  RETURN COALESCE(NEW, OLD);
END; $$;

CREATE OR REPLACE FUNCTION public.upsert_customer_from_order(
  p_email text, p_phone text, p_full_name text,
  p_first_name text, p_last_name text,
  p_user_id uuid DEFAULT NULL, p_address jsonb DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_customer_id uuid;
  v_existing_email text; v_existing_phone text;
  v_existing_secondary_email text; v_existing_secondary_phone text;
BEGIN
  SELECT id, email, phone, secondary_email, secondary_phone
  INTO   v_customer_id, v_existing_email, v_existing_phone,
         v_existing_secondary_email, v_existing_secondary_phone
  FROM   customers
  WHERE  email = p_email OR secondary_email = p_email
  LIMIT 1;

  IF v_customer_id IS NULL AND p_phone IS NOT NULL AND p_phone <> '' THEN
    SELECT id, email, phone, secondary_email, secondary_phone
    INTO   v_customer_id, v_existing_email, v_existing_phone,
           v_existing_secondary_email, v_existing_secondary_phone
    FROM   customers
    WHERE  phone = p_phone OR secondary_phone = p_phone
    LIMIT 1;
  END IF;

  IF v_customer_id IS NULL THEN
    INSERT INTO customers (email, phone, full_name, first_name, last_name, user_id, default_address)
    VALUES (p_email, p_phone, p_full_name, p_first_name, p_last_name, p_user_id, p_address)
    RETURNING id INTO v_customer_id;
  ELSE
    UPDATE customers SET
      secondary_email = CASE
        WHEN p_email IS NOT NULL AND p_email <> '' AND p_email <> v_existing_email
             AND (v_existing_secondary_email IS NULL OR v_existing_secondary_email = '' OR v_existing_secondary_email <> p_email)
        THEN p_email ELSE secondary_email END,
      secondary_phone = CASE
        WHEN p_phone IS NOT NULL AND p_phone <> '' AND p_phone <> v_existing_phone
             AND (v_existing_secondary_phone IS NULL OR v_existing_secondary_phone = '' OR v_existing_secondary_phone <> p_phone)
        THEN p_phone ELSE secondary_phone END,
      full_name  = COALESCE(NULLIF(p_full_name,  ''), full_name),
      first_name = COALESCE(NULLIF(p_first_name, ''), first_name),
      last_name  = COALESCE(NULLIF(p_last_name,  ''), last_name),
      user_id    = COALESCE(p_user_id, user_id),
      default_address = COALESCE(p_address, default_address),
      updated_at = NOW()
    WHERE id = v_customer_id;
  END IF;

  RETURN v_customer_id;
END; $$;

CREATE OR REPLACE FUNCTION public.update_customer_stats(p_customer_email text, p_order_total numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  UPDATE customers
  SET total_orders = total_orders + 1,
      total_spent  = total_spent  + p_order_total,
      last_order_at = NOW(),
      updated_at    = NOW()
  WHERE email = p_customer_email;
END; $$;

CREATE OR REPLACE FUNCTION public.mark_order_paid(order_ref text, moolre_ref text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE updated_order orders;
BEGIN
  UPDATE orders SET
    payment_status = 'paid',
    status = CASE
        WHEN status = 'pending'           THEN 'processing'::order_status
        WHEN status = 'awaiting_payment'  THEN 'processing'::order_status
        ELSE status
      END,
    metadata = COALESCE(metadata, '{}'::jsonb) ||
               jsonb_build_object(
                 'moolre_reference', moolre_ref,
                 'payment_verified_at', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
  WHERE order_number = order_ref
  RETURNING * INTO updated_order;

  IF updated_order.id IS NOT NULL THEN
    IF (updated_order.metadata->>'stock_reduced') IS NULL THEN
      UPDATE products p
      SET quantity = GREATEST(0, p.quantity - oi.quantity)
      FROM order_items oi
      WHERE oi.order_id = updated_order.id AND oi.product_id = p.id;

      UPDATE product_variants pv
      SET quantity = GREATEST(0, pv.quantity - oi.quantity)
      FROM order_items oi
      WHERE oi.order_id = updated_order.id
        AND oi.product_id = pv.product_id
        AND oi.variant_name IS NOT NULL
        AND oi.variant_name = pv.name;

      UPDATE orders
      SET metadata = metadata || '{"stock_reduced": true}'::jsonb
      WHERE id = updated_order.id;
    END IF;
  ELSE
    SELECT * INTO updated_order FROM orders WHERE order_number = order_ref;
  END IF;

  RETURN to_jsonb(updated_order);
END; $$;

CREATE OR REPLACE FUNCTION public.reduce_stock_on_order(p_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  UPDATE products p
  SET quantity = GREATEST(p.quantity - oi.quantity, 0),
      updated_at = now()
  FROM order_items oi
  WHERE oi.order_id = p_order_id AND oi.product_id = p.id;

  UPDATE product_variants pv
  SET quantity = GREATEST(pv.quantity - oi.quantity, 0),
      updated_at = now()
  FROM order_items oi
  WHERE oi.order_id = p_order_id
    AND oi.product_id = pv.product_id
    AND oi.variant_name IS NOT NULL
    AND oi.variant_name = pv.name;
END; $$;

CREATE OR REPLACE FUNCTION public.get_all_customer_emails()
RETURNS TABLE(email text) LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT e.email FROM (
    SELECT c.email FROM customers c WHERE c.email IS NOT NULL AND c.email <> ''
    UNION
    SELECT c.secondary_email FROM customers c WHERE c.secondary_email IS NOT NULL AND c.secondary_email <> ''
  ) e ORDER BY e.email;
END; $$;

CREATE OR REPLACE FUNCTION public.get_all_customer_phones()
RETURNS TABLE(phone text) LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT p.phone FROM (
    SELECT c.phone FROM customers c WHERE c.phone IS NOT NULL AND c.phone <> ''
    UNION
    SELECT c.secondary_phone FROM customers c WHERE c.secondary_phone IS NOT NULL AND c.secondary_phone <> ''
  ) p ORDER BY p.phone;
END; $$;

-- ============================================================================
-- 6. INDEXES
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_profiles_email          ON public.profiles (email);
CREATE INDEX IF NOT EXISTS idx_profiles_role           ON public.profiles (role);
CREATE INDEX IF NOT EXISTS idx_addresses_user_id       ON public.addresses (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action       ON public.audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id      ON public.audit_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_categories_parent       ON public.categories (parent_id);
CREATE INDEX IF NOT EXISTS idx_categories_slug         ON public.categories (slug);
CREATE INDEX IF NOT EXISTS idx_products_category       ON public.products (category_id);
CREATE INDEX IF NOT EXISTS idx_products_featured       ON public.products (featured);
CREATE INDEX IF NOT EXISTS idx_products_slug           ON public.products (slug);
CREATE INDEX IF NOT EXISTS idx_products_status         ON public.products (status);
CREATE INDEX IF NOT EXISTS idx_products_tags           ON public.products USING gin (tags);
CREATE INDEX IF NOT EXISTS idx_pcl_product_id          ON public.product_category_links (product_id);
CREATE INDEX IF NOT EXISTS idx_pcl_category_id         ON public.product_category_links (category_id);
CREATE INDEX IF NOT EXISTS idx_blog_slug               ON public.blog_posts (slug);
CREATE INDEX IF NOT EXISTS idx_blog_status             ON public.blog_posts (status);
CREATE INDEX IF NOT EXISTS idx_coupons_code            ON public.coupons (code);
CREATE INDEX IF NOT EXISTS idx_orders_order_number     ON public.orders (order_number);
CREATE INDEX IF NOT EXISTS idx_orders_status           ON public.orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_user             ON public.orders (user_id);
CREATE INDEX IF NOT EXISTS idx_orders_pending_reminders ON public.orders (created_at)
  WHERE payment_status <> 'paid'::payment_status AND payment_reminder_sent = false;
CREATE INDEX IF NOT EXISTS idx_order_items_order       ON public.order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user      ON public.notifications (user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread    ON public.notifications (user_id) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_reviews_product         ON public.reviews (product_id);
CREATE INDEX IF NOT EXISTS idx_reviews_status          ON public.reviews (status);
CREATE INDEX IF NOT EXISTS idx_tickets_status          ON public.support_tickets (status);
CREATE INDEX IF NOT EXISTS idx_tickets_user            ON public.support_tickets (user_id);
CREATE INDEX IF NOT EXISTS idx_customers_email         ON public.customers (email);
CREATE INDEX IF NOT EXISTS idx_customers_user_id       ON public.customers (user_id);
CREATE INDEX IF NOT EXISTS idx_customers_secondary_email ON public.customers (secondary_email);
CREATE INDEX IF NOT EXISTS idx_customers_secondary_phone ON public.customers (secondary_phone);
CREATE INDEX IF NOT EXISTS idx_contact_submissions_created_at ON public.contact_submissions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_submissions_status     ON public.contact_submissions (status);

-- ============================================================================
-- 7. TRIGGERS (drop + recreate so this script is idempotent)
-- ============================================================================
DO $$
DECLARE
  t record;
  trig text;
BEGIN
  FOR t, trig IN
    SELECT unnest(ARRAY[
      'profiles','addresses','categories','products','product_variants',
      'coupons','orders','cart_items','reviews','blog_posts','support_tickets',
      'return_requests','store_settings','pages','contact_submissions',
      'academia_courses'
    ]) AS t,
    unnest(ARRAY[
      'update_profiles_updated_at','update_addresses_updated_at',
      'update_categories_updated_at','update_products_updated_at',
      'update_product_variants_updated_at','update_coupons_updated_at',
      'update_orders_updated_at','update_cart_items_updated_at',
      'update_reviews_updated_at','update_blog_posts_updated_at',
      'update_support_tickets_updated_at','update_return_requests_updated_at',
      'update_store_settings_updated_at','update_pages_updated_at',
      'update_contact_submissions_updated_at','update_academia_courses_updated_at'
    ]) AS trig
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', trig, t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON public.%I
                    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()', trig, t);
  END LOOP;
END $$;

DROP TRIGGER IF EXISTS tr_update_product_rating ON public.reviews;
CREATE TRIGGER tr_update_product_rating
  AFTER INSERT OR DELETE OR UPDATE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.update_product_rating_stats();

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- 8. ENABLE RLS
-- ============================================================================
DO $$
DECLARE tbl text;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'profiles','addresses','store_settings','audit_logs','categories','products',
    'product_images','product_variants','product_category_links','coupons','orders',
    'order_items','order_status_history','cart_items','wishlist_items','reviews',
    'review_images','blog_posts','support_tickets','support_messages','return_requests',
    'return_items','notifications','pages','site_settings','cms_content','banners',
    'navigation_menus','navigation_items','store_modules','customers','academia_courses',
    'contact_submissions'
  ])
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
  END LOOP;
END $$;

-- ============================================================================
-- 9. RLS POLICIES (drop + recreate for idempotency)
-- ============================================================================

-- Profiles
DROP POLICY IF EXISTS "Users view own profile"   ON public.profiles;
DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Staff view any profile"   ON public.profiles;
CREATE POLICY "Users view own profile"   ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Staff view any profile"   ON public.profiles FOR SELECT USING (public.is_admin_or_staff());

-- Addresses
DROP POLICY IF EXISTS "Users manage own addresses" ON public.addresses;
DROP POLICY IF EXISTS "Staff manage all addresses" ON public.addresses;
CREATE POLICY "Users manage own addresses" ON public.addresses FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Staff manage all addresses" ON public.addresses FOR ALL USING (public.is_admin_or_staff()) WITH CHECK (public.is_admin_or_staff());

-- Store Settings
DROP POLICY IF EXISTS "Staff view settings"   ON public.store_settings;
DROP POLICY IF EXISTS "Staff manage settings" ON public.store_settings;
CREATE POLICY "Staff view settings"   ON public.store_settings FOR SELECT USING (true);
CREATE POLICY "Staff manage settings" ON public.store_settings FOR ALL USING (public.is_admin_or_staff()) WITH CHECK (public.is_admin_or_staff());

-- Audit Logs
DROP POLICY IF EXISTS "Staff view audit logs"   ON public.audit_logs;
DROP POLICY IF EXISTS "Staff insert audit logs" ON public.audit_logs;
CREATE POLICY "Staff view audit logs"   ON public.audit_logs FOR SELECT USING (public.is_admin_or_staff());
CREATE POLICY "Staff insert audit logs" ON public.audit_logs FOR INSERT WITH CHECK (public.is_admin_or_staff());

-- Categories
DROP POLICY IF EXISTS "Public view categories"  ON public.categories;
DROP POLICY IF EXISTS "Staff manage categories" ON public.categories;
CREATE POLICY "Public view categories"  ON public.categories FOR SELECT USING (true);
CREATE POLICY "Staff manage categories" ON public.categories FOR ALL USING (public.is_admin_or_staff()) WITH CHECK (public.is_admin_or_staff());

-- Products
DROP POLICY IF EXISTS "Public view active products" ON public.products;
DROP POLICY IF EXISTS "Staff manage products"       ON public.products;
CREATE POLICY "Public view active products" ON public.products FOR SELECT USING (status = 'active'::product_status OR public.is_admin_or_staff());
CREATE POLICY "Staff manage products"       ON public.products FOR ALL USING (public.is_admin_or_staff()) WITH CHECK (public.is_admin_or_staff());

-- Product Images
DROP POLICY IF EXISTS "Public view images"  ON public.product_images;
DROP POLICY IF EXISTS "Staff manage images" ON public.product_images;
CREATE POLICY "Public view images"  ON public.product_images FOR SELECT USING (true);
CREATE POLICY "Staff manage images" ON public.product_images FOR ALL USING (public.is_admin_or_staff()) WITH CHECK (public.is_admin_or_staff());

-- Product Variants
DROP POLICY IF EXISTS "Public view variants"  ON public.product_variants;
DROP POLICY IF EXISTS "Staff manage variants" ON public.product_variants;
CREATE POLICY "Public view variants"  ON public.product_variants FOR SELECT USING (true);
CREATE POLICY "Staff manage variants" ON public.product_variants FOR ALL USING (public.is_admin_or_staff()) WITH CHECK (public.is_admin_or_staff());

-- Product Category Links
DROP POLICY IF EXISTS "Public read product_category_links"  ON public.product_category_links;
DROP POLICY IF EXISTS "Staff manage product_category_links" ON public.product_category_links;
CREATE POLICY "Public read product_category_links"  ON public.product_category_links FOR SELECT USING (true);
CREATE POLICY "Staff manage product_category_links" ON public.product_category_links FOR ALL USING (public.is_admin_or_staff()) WITH CHECK (public.is_admin_or_staff());

-- Coupons
DROP POLICY IF EXISTS "Allow anon read access to coupons"          ON public.coupons;
DROP POLICY IF EXISTS "Allow authenticated read access to coupons" ON public.coupons;
DROP POLICY IF EXISTS "Allow admin insert on coupons"              ON public.coupons;
DROP POLICY IF EXISTS "Allow admin update on coupons"              ON public.coupons;
DROP POLICY IF EXISTS "Allow admin delete on coupons"              ON public.coupons;
CREATE POLICY "Allow anon read access to coupons"          ON public.coupons FOR SELECT TO anon           USING (true);
CREATE POLICY "Allow authenticated read access to coupons" ON public.coupons FOR SELECT TO authenticated  USING (true);
CREATE POLICY "Allow admin insert on coupons" ON public.coupons FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','staff')));
CREATE POLICY "Allow admin update on coupons" ON public.coupons FOR UPDATE TO authenticated USING     (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','staff')));
CREATE POLICY "Allow admin delete on coupons" ON public.coupons FOR DELETE TO authenticated USING     (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','staff')));

-- Orders
DROP POLICY IF EXISTS "Enable insert for all users"     ON public.orders;
DROP POLICY IF EXISTS "Users view own orders"           ON public.orders;
DROP POLICY IF EXISTS "Enable select for guest orders"  ON public.orders;
DROP POLICY IF EXISTS "Staff manage all orders"         ON public.orders;
CREATE POLICY "Enable insert for all users"    ON public.orders FOR INSERT WITH CHECK (
  ((auth.uid() IS NOT NULL) AND (auth.uid() = user_id)) OR
  ((auth.uid() IS NULL) AND (user_id IS NULL))
);
CREATE POLICY "Users view own orders"          ON public.orders FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Enable select for guest orders" ON public.orders FOR SELECT USING (user_id IS NULL);
CREATE POLICY "Staff manage all orders"        ON public.orders FOR ALL    USING (public.is_admin_or_staff()) WITH CHECK (public.is_admin_or_staff());

-- Order Items
DROP POLICY IF EXISTS "Users view own order items"           ON public.order_items;
DROP POLICY IF EXISTS "Enable select for guest order items"  ON public.order_items;
DROP POLICY IF EXISTS "Enable insert for order items"        ON public.order_items;
DROP POLICY IF EXISTS "Staff manage order items"             ON public.order_items;
CREATE POLICY "Users view own order items"          ON public.order_items FOR SELECT USING (EXISTS (SELECT 1 FROM orders WHERE orders.id = order_items.order_id AND orders.user_id = auth.uid()));
CREATE POLICY "Enable select for guest order items" ON public.order_items FOR SELECT USING (EXISTS (SELECT 1 FROM orders WHERE orders.id = order_items.order_id AND orders.user_id IS NULL));
CREATE POLICY "Enable insert for order items"       ON public.order_items FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM orders WHERE orders.id = order_items.order_id AND (orders.user_id = auth.uid() OR orders.user_id IS NULL)));
CREATE POLICY "Staff manage order items"            ON public.order_items FOR ALL    USING (public.is_admin_or_staff()) WITH CHECK (public.is_admin_or_staff());

-- Order Status History
DROP POLICY IF EXISTS "Users view order history"  ON public.order_status_history;
DROP POLICY IF EXISTS "Staff manage order history" ON public.order_status_history;
CREATE POLICY "Users view order history"  ON public.order_status_history FOR SELECT USING (EXISTS (SELECT 1 FROM orders WHERE orders.id = order_status_history.order_id AND orders.user_id = auth.uid()));
CREATE POLICY "Staff manage order history" ON public.order_status_history FOR ALL    USING (public.is_admin_or_staff()) WITH CHECK (public.is_admin_or_staff());

-- Cart / Wishlist
DROP POLICY IF EXISTS "Users manage own cart"     ON public.cart_items;
DROP POLICY IF EXISTS "Users manage own wishlist" ON public.wishlist_items;
CREATE POLICY "Users manage own cart"     ON public.cart_items     FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users manage own wishlist" ON public.wishlist_items FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Reviews
DROP POLICY IF EXISTS "Public view approved reviews" ON public.reviews;
DROP POLICY IF EXISTS "Users view own reviews"       ON public.reviews;
DROP POLICY IF EXISTS "Users create reviews"         ON public.reviews;
DROP POLICY IF EXISTS "Users update own reviews"     ON public.reviews;
DROP POLICY IF EXISTS "Staff manage reviews"         ON public.reviews;
CREATE POLICY "Public view approved reviews" ON public.reviews FOR SELECT USING (status = 'approved'::review_status);
CREATE POLICY "Users view own reviews"       ON public.reviews FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users create reviews"         ON public.reviews FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own reviews"     ON public.reviews FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Staff manage reviews"         ON public.reviews FOR ALL    USING (public.is_admin_or_staff()) WITH CHECK (public.is_admin_or_staff());

-- Review Images
DROP POLICY IF EXISTS "Public view review images"  ON public.review_images;
DROP POLICY IF EXISTS "Users manage review images" ON public.review_images;
CREATE POLICY "Public view review images"  ON public.review_images FOR SELECT USING (EXISTS (SELECT 1 FROM reviews WHERE reviews.id = review_images.review_id AND reviews.status = 'approved'::review_status));
CREATE POLICY "Users manage review images" ON public.review_images FOR ALL
  USING     (EXISTS (SELECT 1 FROM reviews WHERE reviews.id = review_images.review_id AND reviews.user_id = auth.uid()))
  WITH CHECK(EXISTS (SELECT 1 FROM reviews WHERE reviews.id = review_images.review_id AND reviews.user_id = auth.uid()));

-- Blog
DROP POLICY IF EXISTS "Public view published posts" ON public.blog_posts;
DROP POLICY IF EXISTS "Staff manage blog"           ON public.blog_posts;
CREATE POLICY "Public view published posts" ON public.blog_posts FOR SELECT USING (status = 'published'::blog_status OR public.is_admin_or_staff());
CREATE POLICY "Staff manage blog"           ON public.blog_posts FOR ALL    USING (public.is_admin_or_staff()) WITH CHECK (public.is_admin_or_staff());

-- Support
DROP POLICY IF EXISTS "Users manage own tickets" ON public.support_tickets;
DROP POLICY IF EXISTS "Staff manage tickets"     ON public.support_tickets;
CREATE POLICY "Users manage own tickets" ON public.support_tickets FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Staff manage tickets"     ON public.support_tickets FOR ALL USING (public.is_admin_or_staff()) WITH CHECK (public.is_admin_or_staff());

DROP POLICY IF EXISTS "Users view ticket messages" ON public.support_messages;
DROP POLICY IF EXISTS "Users create messages"      ON public.support_messages;
DROP POLICY IF EXISTS "Staff manage messages"      ON public.support_messages;
CREATE POLICY "Users view ticket messages" ON public.support_messages FOR SELECT USING (EXISTS (SELECT 1 FROM support_tickets WHERE support_tickets.id = support_messages.ticket_id AND support_tickets.user_id = auth.uid()));
CREATE POLICY "Users create messages"      ON public.support_messages FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM support_tickets WHERE support_tickets.id = support_messages.ticket_id AND support_tickets.user_id = auth.uid()));
CREATE POLICY "Staff manage messages"      ON public.support_messages FOR ALL    USING (public.is_admin_or_staff()) WITH CHECK (public.is_admin_or_staff());

-- Returns
DROP POLICY IF EXISTS "Users view own returns" ON public.return_requests;
DROP POLICY IF EXISTS "Users create returns"   ON public.return_requests;
DROP POLICY IF EXISTS "Staff manage returns"   ON public.return_requests;
CREATE POLICY "Users view own returns" ON public.return_requests FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users create returns"   ON public.return_requests FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Staff manage returns"   ON public.return_requests FOR ALL    USING (public.is_admin_or_staff()) WITH CHECK (public.is_admin_or_staff());

DROP POLICY IF EXISTS "Users view return items"  ON public.return_items;
DROP POLICY IF EXISTS "Staff manage return items" ON public.return_items;
CREATE POLICY "Users view return items"   ON public.return_items FOR SELECT USING (EXISTS (SELECT 1 FROM return_requests WHERE return_requests.id = return_items.return_request_id AND return_requests.user_id = auth.uid()));
CREATE POLICY "Staff manage return items" ON public.return_items FOR ALL    USING (public.is_admin_or_staff()) WITH CHECK (public.is_admin_or_staff());

-- Notifications
DROP POLICY IF EXISTS "Users manage own notifications" ON public.notifications;
CREATE POLICY "Users manage own notifications" ON public.notifications FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Pages
DROP POLICY IF EXISTS "Public can view pages"   ON public.pages;
DROP POLICY IF EXISTS "Staff can manage pages"  ON public.pages;
CREATE POLICY "Public can view pages"   ON public.pages FOR SELECT USING (true);
CREATE POLICY "Staff can manage pages"  ON public.pages FOR ALL    USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','staff')));

-- Site Settings
DROP POLICY IF EXISTS "Allow public read on site_settings" ON public.site_settings;
DROP POLICY IF EXISTS "Allow admin write on site_settings" ON public.site_settings;
CREATE POLICY "Allow public read on site_settings" ON public.site_settings FOR SELECT USING (true);
CREATE POLICY "Allow admin write on site_settings" ON public.site_settings FOR ALL    USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'::user_role));

-- CMS Content / Banners / Navigation
DROP POLICY IF EXISTS "Allow public read on cms_content" ON public.cms_content;
DROP POLICY IF EXISTS "Allow admin all on cms_content"   ON public.cms_content;
CREATE POLICY "Allow public read on cms_content" ON public.cms_content FOR SELECT USING (is_active = true);
CREATE POLICY "Allow admin all on cms_content"   ON public.cms_content FOR ALL    USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'::user_role));

DROP POLICY IF EXISTS "Allow public read on banners" ON public.banners;
DROP POLICY IF EXISTS "Allow admin all on banners"   ON public.banners;
CREATE POLICY "Allow public read on banners" ON public.banners FOR SELECT USING (is_active = true);
CREATE POLICY "Allow admin all on banners"   ON public.banners FOR ALL    USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'::user_role));

DROP POLICY IF EXISTS "Allow public read on navigation_menus" ON public.navigation_menus;
DROP POLICY IF EXISTS "Allow admin all on navigation_menus"   ON public.navigation_menus;
CREATE POLICY "Allow public read on navigation_menus" ON public.navigation_menus FOR SELECT USING (true);
CREATE POLICY "Allow admin all on navigation_menus"   ON public.navigation_menus FOR ALL    USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'::user_role));

DROP POLICY IF EXISTS "Allow public read on navigation_items" ON public.navigation_items;
DROP POLICY IF EXISTS "Allow admin all on navigation_items"   ON public.navigation_items;
CREATE POLICY "Allow public read on navigation_items" ON public.navigation_items FOR SELECT USING (is_active = true);
CREATE POLICY "Allow admin all on navigation_items"   ON public.navigation_items FOR ALL    USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'::user_role));

-- Store Modules
DROP POLICY IF EXISTS "Allow public read access"          ON public.store_modules;
DROP POLICY IF EXISTS "Allow admin insert on store_modules" ON public.store_modules;
DROP POLICY IF EXISTS "Allow authenticated update"        ON public.store_modules;
CREATE POLICY "Allow public read access"            ON public.store_modules FOR SELECT USING (true);
CREATE POLICY "Allow admin insert on store_modules" ON public.store_modules FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','staff')));
CREATE POLICY "Allow authenticated update"          ON public.store_modules FOR UPDATE USING (auth.role() = 'authenticated' OR auth.role() = 'anon');

-- Customers
DROP POLICY IF EXISTS "Staff can view all customers"            ON public.customers;
DROP POLICY IF EXISTS "Staff can manage customers"              ON public.customers;
DROP POLICY IF EXISTS "Service role full access to customers"   ON public.customers;
CREATE POLICY "Staff can view all customers"          ON public.customers FOR SELECT USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','staff')));
CREATE POLICY "Staff can manage customers"            ON public.customers FOR ALL    USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','staff')));
CREATE POLICY "Service role full access to customers" ON public.customers FOR ALL    USING (auth.role() = 'service_role');

-- Academia Courses
DROP POLICY IF EXISTS "Public read active courses"   ON public.academia_courses;
DROP POLICY IF EXISTS "Admin insert courses"         ON public.academia_courses;
DROP POLICY IF EXISTS "Admin update delete courses"  ON public.academia_courses;
DROP POLICY IF EXISTS "Admin delete courses"         ON public.academia_courses;
CREATE POLICY "Public read active courses"  ON public.academia_courses FOR SELECT
  USING (status = 'active' OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','staff')));
CREATE POLICY "Admin insert courses"        ON public.academia_courses FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','staff')));
CREATE POLICY "Admin update delete courses" ON public.academia_courses FOR UPDATE
  USING     (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','staff')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','staff')));
CREATE POLICY "Admin delete courses"        ON public.academia_courses FOR DELETE USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','staff')));

-- Contact Submissions
DROP POLICY IF EXISTS "Public insert contact_submissions"  ON public.contact_submissions;
DROP POLICY IF EXISTS "Staff read contact_submissions"     ON public.contact_submissions;
DROP POLICY IF EXISTS "Staff manage contact_submissions"   ON public.contact_submissions;
CREATE POLICY "Public insert contact_submissions" ON public.contact_submissions FOR INSERT WITH CHECK (true);
CREATE POLICY "Staff read contact_submissions"    ON public.contact_submissions FOR SELECT USING (public.is_admin_or_staff());
CREATE POLICY "Staff manage contact_submissions"  ON public.contact_submissions FOR ALL    USING (public.is_admin_or_staff()) WITH CHECK (public.is_admin_or_staff());

-- ============================================================================
-- 10. STORAGE BUCKETS
-- ============================================================================
INSERT INTO storage.buckets (id, name, public) VALUES ('products',    'products',    true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars',     'avatars',     true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('blog',        'blog',        true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('media',       'media',       true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('reviews',     'reviews',     true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('site-assets', 'site-assets', true) ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 11. STORAGE POLICIES
-- ============================================================================
DROP POLICY IF EXISTS "Public read access for products"   ON storage.objects;
DROP POLICY IF EXISTS "Admin upload access for products"  ON storage.objects;
DROP POLICY IF EXISTS "Admin update access for products"  ON storage.objects;
DROP POLICY IF EXISTS "Admin delete access for products"  ON storage.objects;
CREATE POLICY "Public read access for products"  ON storage.objects FOR SELECT USING (bucket_id = 'products');
CREATE POLICY "Admin upload access for products" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'products' AND public.is_admin_or_staff() = true);
CREATE POLICY "Admin update access for products" ON storage.objects FOR UPDATE USING     (bucket_id = 'products' AND public.is_admin_or_staff() = true);
CREATE POLICY "Admin delete access for products" ON storage.objects FOR DELETE USING     (bucket_id = 'products' AND public.is_admin_or_staff() = true);

DROP POLICY IF EXISTS "Public read access for media"   ON storage.objects;
DROP POLICY IF EXISTS "Admin upload access for media"  ON storage.objects;
DROP POLICY IF EXISTS "Admin delete access for media"  ON storage.objects;
CREATE POLICY "Public read access for media"  ON storage.objects FOR SELECT USING (bucket_id = 'media');
CREATE POLICY "Admin upload access for media" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'media' AND public.is_admin_or_staff() = true);
CREATE POLICY "Admin delete access for media" ON storage.objects FOR DELETE USING     (bucket_id = 'media' AND public.is_admin_or_staff() = true);

DROP POLICY IF EXISTS "Public read access for site-assets"   ON storage.objects;
DROP POLICY IF EXISTS "Admin upload access for site-assets"  ON storage.objects;
DROP POLICY IF EXISTS "Admin update access for site-assets"  ON storage.objects;
DROP POLICY IF EXISTS "Admin delete access for site-assets"  ON storage.objects;
CREATE POLICY "Public read access for site-assets"  ON storage.objects FOR SELECT USING (bucket_id = 'site-assets');
CREATE POLICY "Admin upload access for site-assets" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'site-assets' AND (auth.role() = 'service_role' OR public.is_admin_or_staff() = true));
CREATE POLICY "Admin update access for site-assets" ON storage.objects FOR UPDATE USING     (bucket_id = 'site-assets' AND (auth.role() = 'service_role' OR public.is_admin_or_staff() = true));
CREATE POLICY "Admin delete access for site-assets" ON storage.objects FOR DELETE USING     (bucket_id = 'site-assets' AND (auth.role() = 'service_role' OR public.is_admin_or_staff() = true));

-- ============================================================================
-- DONE.  Next step (optional): run supabase/seed.sql to load default data.
-- ============================================================================

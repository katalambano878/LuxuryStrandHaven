-- Telegram link and course thumbnail for Academia courses.
ALTER TABLE public.academia_courses
  ADD COLUMN IF NOT EXISTS telegram_url text,
  ADD COLUMN IF NOT EXISTS thumbnail_url text;

COMMENT ON COLUMN public.academia_courses.telegram_url IS 'Optional Telegram group or channel link shown on the course card';
COMMENT ON COLUMN public.academia_courses.thumbnail_url IS 'Optional cover image for the course card';

-- ============================================
-- Civic Complaint Management System
-- Supabase SQL Setup Script
-- Run this ONCE in Supabase SQL Editor
-- ============================================

-- 1. USERS TABLE
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  role TEXT NOT NULL DEFAULT 'citizen',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. COMPLAINTS TABLE
CREATE TABLE IF NOT EXISTS complaints (
  id SERIAL PRIMARY KEY,
  complaint_id TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  location TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Submitted',
  priority TEXT DEFAULT 'Medium',
  image_path TEXT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  assigned_to INTEGER REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  resolved_at TIMESTAMP WITH TIME ZONE
);

-- 3. COMMENTS TABLE
CREATE TABLE IF NOT EXISTS comments (
  id SERIAL PRIMARY KEY,
  complaint_id INTEGER NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  message TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. ROW LEVEL SECURITY (for MVP demo)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE complaints ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any, then recreate
DROP POLICY IF EXISTS "Allow all on users" ON users;
DROP POLICY IF EXISTS "Allow all on complaints" ON complaints;
DROP POLICY IF EXISTS "Allow all on comments" ON comments;

-- Allow public read/write for demo (in production, lock this down!)
CREATE POLICY "Allow all on users" ON users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on complaints" ON complaints FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on comments" ON comments FOR ALL USING (true) WITH CHECK (true);

-- 5. SEED DEFAULT USERS
INSERT INTO users (name, email, password, phone, role) VALUES
  ('Amarjeet',      'amarjeet@gmail.com', 'amarjeet@123', '1234567890', 'citizen'),
  ('Priya Verma',   'citizen2@demo.com',  'citizen123',   '9876543211', 'citizen'),
  ('Admin User',    'admin@gmail.com',    'admin123',     '9876543210', 'admin')
ON CONFLICT (email) DO NOTHING;

-- 6. SEED SAMPLE COMPLAINTS
INSERT INTO complaints (complaint_id, title, category, description, location, status, priority, user_id) VALUES
  ('CMP-2026-000001', 'Pothole on Main Road',     'Roads & Footpaths', 'There is a large pothole near the bus stop on Main Road causing accidents.', '45 Main Road, Sector 12',  'Submitted',   'High',   1),
  ('CMP-2026-000002', 'Streetlight Not Working',   'Electricity',       'The streetlight near the park entrance has been off for a week.',            'Park Avenue, Block B',     'In Progress', 'Medium', 1),
  ('CMP-2026-000003', 'Garbage Not Collected',     'Waste Management',  'Garbage has not been collected from our area for 3 days.',                   '12 Green Colony, Ward 5',  'Submitted',   'High',   2)
ON CONFLICT (complaint_id) DO NOTHING;

-- 7. SEED SAMPLE COMMENTS
INSERT INTO comments (complaint_id, user_id, message) VALUES
  (1, 1, 'Complaint submitted successfully.'),
  (2, 1, 'Complaint submitted successfully.'),
  (2, 3, 'Status changed to "In Progress". Our team has been dispatched.'),
  (3, 2, 'Complaint submitted successfully.');

-- 8. FUNCTION TO GET NEXT COMPLAINT ID (called from frontend)
CREATE OR REPLACE FUNCTION get_next_complaint_id()
RETURNS TEXT AS $$
DECLARE
  current_year TEXT;
  last_num INTEGER;
  next_id TEXT;
BEGIN
  current_year := EXTRACT(YEAR FROM NOW())::TEXT;
  SELECT COALESCE(MAX(CAST(SPLIT_PART(complaint_id, '-', 3) AS INTEGER)), 0)
    INTO last_num
    FROM complaints
    WHERE complaint_id LIKE 'CMP-' || current_year || '-%';
  next_id := 'CMP-' || current_year || '-' || LPAD((last_num + 1)::TEXT, 6, '0');
  RETURN next_id;
END;
$$ LANGUAGE plpgsql;

-- 9. STORAGE BUCKET FOR COMPLAINT IMAGES
INSERT INTO storage.buckets (id, name, public) VALUES ('complaint-images', 'complaint-images', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public access to complaint images
DROP POLICY IF EXISTS "Allow public read on complaint-images" ON storage.objects;
CREATE POLICY "Allow public read on complaint-images" ON storage.objects
  FOR SELECT USING (bucket_id = 'complaint-images');

DROP POLICY IF EXISTS "Allow public upload on complaint-images" ON storage.objects;
CREATE POLICY "Allow public upload on complaint-images" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'complaint-images');

DROP POLICY IF EXISTS "Allow public update on complaint-images" ON storage.objects;
CREATE POLICY "Allow public update on complaint-images" ON storage.objects
  FOR UPDATE USING (bucket_id = 'complaint-images');

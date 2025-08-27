-- Historical Analytics Tables Migration
-- Creates all required tables for the Historical Analytics Dashboard

-- 1. Daily Queue History Table
-- Stores daily snapshots of queue activity for historical analysis
CREATE TABLE IF NOT EXISTS daily_queue_history (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL UNIQUE,
    total_customers INTEGER DEFAULT 0,
    waiting_customers INTEGER DEFAULT 0,
    serving_customers INTEGER DEFAULT 0,
    processing_customers INTEGER DEFAULT 0,
    completed_customers INTEGER DEFAULT 0,
    cancelled_customers INTEGER DEFAULT 0,
    priority_customers INTEGER DEFAULT 0,
    avg_wait_time_minutes DECIMAL(10,2) DEFAULT 0,
    peak_queue_length INTEGER DEFAULT 0,
    operating_hours INTEGER DEFAULT 8,
    archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Display Monitor History Table
-- Stores historical display monitor performance metrics
CREATE TABLE IF NOT EXISTS display_monitor_history (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL UNIQUE,
    daily_customers_served INTEGER DEFAULT 0,
    daily_avg_wait_time INTEGER DEFAULT 0,
    daily_peak_queue_length INTEGER DEFAULT 0,
    daily_priority_customers INTEGER DEFAULT 0,
    operating_efficiency INTEGER DEFAULT 0, -- Percentage 0-100
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Customer History Archive Table
-- Stores archived customer records for historical reporting
CREATE TABLE IF NOT EXISTS customer_history (
    id SERIAL PRIMARY KEY,
    original_customer_id INTEGER NOT NULL,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(20),
    queue_status VARCHAR(50),
    token_number INTEGER,
    priority_flags JSONB DEFAULT '{}',
    estimated_wait_time INTEGER DEFAULT 0, -- in minutes
    served_at TIMESTAMP,
    counter_id INTEGER,
    archive_date DATE NOT NULL,
    created_at TIMESTAMP,
    archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(original_customer_id, archive_date)
);

-- 4. Daily Reset Log Table  
-- Stores daily queue reset operation logs for audit and monitoring
CREATE TABLE IF NOT EXISTS daily_reset_log (
    id SERIAL PRIMARY KEY,
    reset_date DATE NOT NULL,
    customers_archived INTEGER DEFAULT 0,
    customers_carried_forward INTEGER DEFAULT 0,
    customers_processed INTEGER DEFAULT 0,
    queues_reset INTEGER DEFAULT 0,
    success BOOLEAN DEFAULT true,
    error_message TEXT,
    duration_ms INTEGER DEFAULT 0,
    reset_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_daily_queue_history_date ON daily_queue_history(date DESC);
CREATE INDEX IF NOT EXISTS idx_display_monitor_history_date ON display_monitor_history(date DESC);
CREATE INDEX IF NOT EXISTS idx_customer_history_archive_date ON customer_history(archive_date DESC);
CREATE INDEX IF NOT EXISTS idx_customer_history_original_id ON customer_history(original_customer_id);
CREATE INDEX IF NOT EXISTS idx_daily_reset_log_date ON daily_reset_log(reset_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_reset_log_success ON daily_reset_log(success);

-- Insert sample data for testing if tables are empty
-- This ensures the Historical Analytics Dashboard has some data to display

-- Sample daily queue history data for the last 7 days
INSERT INTO daily_queue_history (date, total_customers, waiting_customers, serving_customers, processing_customers, completed_customers, cancelled_customers, priority_customers, avg_wait_time_minutes, peak_queue_length, operating_hours)
SELECT 
    (CURRENT_DATE - INTERVAL '1 day' * generate_series(0, 6))::DATE as date,
    (20 + RANDOM() * 30)::INTEGER as total_customers,
    (2 + RANDOM() * 5)::INTEGER as waiting_customers,
    (1 + RANDOM() * 3)::INTEGER as serving_customers,
    (0 + RANDOM() * 2)::INTEGER as processing_customers,
    (15 + RANDOM() * 25)::INTEGER as completed_customers,
    (0 + RANDOM() * 3)::INTEGER as cancelled_customers,
    (5 + RANDOM() * 10)::INTEGER as priority_customers,
    (8 + RANDOM() * 12)::DECIMAL(10,2) as avg_wait_time_minutes,
    (8 + RANDOM() * 15)::INTEGER as peak_queue_length,
    8 as operating_hours
WHERE NOT EXISTS (SELECT 1 FROM daily_queue_history LIMIT 1);

-- Sample display monitor history data
INSERT INTO display_monitor_history (date, daily_customers_served, daily_avg_wait_time, daily_peak_queue_length, daily_priority_customers, operating_efficiency)
SELECT 
    (CURRENT_DATE - INTERVAL '1 day' * generate_series(0, 6))::DATE as date,
    (15 + RANDOM() * 25)::INTEGER as daily_customers_served,
    (8 + RANDOM() * 12)::INTEGER as daily_avg_wait_time,
    (8 + RANDOM() * 15)::INTEGER as daily_peak_queue_length,
    (5 + RANDOM() * 10)::INTEGER as daily_priority_customers,
    (75 + RANDOM() * 20)::INTEGER as operating_efficiency
WHERE NOT EXISTS (SELECT 1 FROM display_monitor_history LIMIT 1);

-- Sample reset log data
INSERT INTO daily_reset_log (reset_date, customers_archived, customers_carried_forward, customers_processed, queues_reset, success, duration_ms)
SELECT 
    (CURRENT_DATE - INTERVAL '1 day' * generate_series(1, 7))::DATE as reset_date,
    (15 + RANDOM() * 25)::INTEGER as customers_archived,
    (2 + RANDOM() * 5)::INTEGER as customers_carried_forward,
    (18 + RANDOM() * 28)::INTEGER as customers_processed,
    2 as queues_reset,
    true as success,
    (500 + RANDOM() * 1500)::INTEGER as duration_ms
WHERE NOT EXISTS (SELECT 1 FROM daily_reset_log LIMIT 1);

-- Add some sample customer history entries
INSERT INTO customer_history (
    original_customer_id, name, email, phone, queue_status, 
    token_number, priority_flags, estimated_wait_time, 
    archive_date, created_at
)
SELECT 
    100 + generate_series(1, 20) as original_customer_id,
    'Sample Customer ' || generate_series(1, 20) as name,
    'customer' || generate_series(1, 20) || '@example.com' as email,
    '+63912345' || LPAD(generate_series(1, 20)::TEXT, 4, '0') as phone,
    CASE 
        WHEN RANDOM() < 0.7 THEN 'completed'
        WHEN RANDOM() < 0.9 THEN 'cancelled'
        ELSE 'serving'
    END as queue_status,
    generate_series(1, 20) as token_number,
    CASE 
        WHEN RANDOM() < 0.3 THEN '{"senior_citizen": true}'::jsonb
        WHEN RANDOM() < 0.6 THEN '{"pregnant": true}'::jsonb
        WHEN RANDOM() < 0.8 THEN '{"pwd": true}'::jsonb
        ELSE '{}'::jsonb
    END as priority_flags,
    (5 + RANDOM() * 20)::INTEGER as estimated_wait_time,
    (CURRENT_DATE - INTERVAL '1 day' * (RANDOM() * 6)::INTEGER)::DATE as archive_date,
    CURRENT_TIMESTAMP - INTERVAL '1 day' * (RANDOM() * 6) as created_at
WHERE NOT EXISTS (SELECT 1 FROM customer_history LIMIT 1);

COMMIT;

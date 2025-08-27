-- Create analytics tables for queue management system

-- Table to store hourly queue analytics
CREATE TABLE IF NOT EXISTS queue_analytics (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL,
    hour INTEGER NOT NULL,
    total_customers INTEGER DEFAULT 0,
    priority_customers INTEGER DEFAULT 0,
    avg_wait_time_minutes DECIMAL(10,2) DEFAULT 0,
    avg_service_time_minutes DECIMAL(10,2) DEFAULT 0,
    peak_queue_length INTEGER DEFAULT 0,
    customers_served INTEGER DEFAULT 0,
    avg_processing_duration_minutes DECIMAL(10,2) DEFAULT 0,
    total_processing_count INTEGER DEFAULT 0,
    max_processing_duration_minutes DECIMAL(10,2) DEFAULT 0,
    min_processing_duration_minutes DECIMAL(10,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(date, hour)
);

-- Table to store daily queue summaries
CREATE TABLE IF NOT EXISTS daily_queue_summary (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL UNIQUE,
    total_customers INTEGER DEFAULT 0,
    priority_customers INTEGER DEFAULT 0,
    avg_wait_time_minutes DECIMAL(10,2) DEFAULT 0,
    avg_service_time_minutes DECIMAL(10,2) DEFAULT 0,
    peak_hour INTEGER DEFAULT 0,
    peak_queue_length INTEGER DEFAULT 0,
    customers_served INTEGER DEFAULT 0,
    busiest_counter_id INTEGER,
    avg_processing_duration_minutes DECIMAL(10,2) DEFAULT 0,
    total_processing_count INTEGER DEFAULT 0,
    max_processing_duration_minutes DECIMAL(10,2) DEFAULT 0,
    min_processing_duration_minutes DECIMAL(10,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table to store queue events for detailed analytics
CREATE TABLE IF NOT EXISTS queue_events (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER NOT NULL,
    event_type VARCHAR(20) NOT NULL CHECK (event_type IN ('joined', 'called', 'served', 'left', 'cancelled')),
    counter_id INTEGER,
    queue_position INTEGER,
    wait_time_minutes DECIMAL(10,2),
    service_time_minutes DECIMAL(10,2),
    processing_duration_minutes DECIMAL(10,2),
    is_priority BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    FOREIGN KEY (counter_id) REFERENCES counters(id) ON DELETE SET NULL
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_queue_analytics_date_hour ON queue_analytics(date, hour);
CREATE INDEX IF NOT EXISTS idx_daily_queue_summary_date ON daily_queue_summary(date);
CREATE INDEX IF NOT EXISTS idx_queue_events_customer_id ON queue_events(customer_id);
CREATE INDEX IF NOT EXISTS idx_queue_events_event_type ON queue_events(event_type);
CREATE INDEX IF NOT EXISTS idx_queue_events_created_at ON queue_events(created_at);
CREATE INDEX IF NOT EXISTS idx_queue_events_processing_duration ON queue_events(processing_duration_minutes);
CREATE INDEX IF NOT EXISTS idx_queue_analytics_processing ON queue_analytics(avg_processing_duration_minutes);
CREATE INDEX IF NOT EXISTS idx_daily_summary_processing ON daily_queue_summary(avg_processing_duration_minutes);

-- Insert some initial data for today if tables are empty
INSERT INTO queue_analytics (date, hour, total_customers, priority_customers, avg_wait_time_minutes, avg_service_time_minutes, peak_queue_length, customers_served)
SELECT 
    CURRENT_DATE,
    EXTRACT(HOUR FROM CURRENT_TIMESTAMP)::INTEGER,
    COALESCE(COUNT(*), 0),
    COALESCE(COUNT(*) FILTER (WHERE priority_flags::json->>'senior_citizen' = 'true' OR priority_flags::json->>'pwd' = 'true' OR priority_flags::json->>'pregnant' = 'true'), 0),
    COALESCE(AVG(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - created_at)) / 60), 0),
    COALESCE(AVG(5), 5), -- Default service time
    COALESCE(MAX(token_number), 0),
    COALESCE(COUNT(*) FILTER (WHERE queue_status = 'completed'), 0)
FROM customers 
WHERE DATE(created_at) = CURRENT_DATE
ON CONFLICT (date, hour) DO NOTHING;

-- Insert daily summary for today
INSERT INTO daily_queue_summary (date, total_customers, priority_customers, avg_wait_time_minutes, avg_service_time_minutes, peak_hour, peak_queue_length, customers_served, busiest_counter_id)
SELECT 
    CURRENT_DATE,
    COALESCE(COUNT(*), 0),
    COALESCE(COUNT(*) FILTER (WHERE priority_flags::json->>'senior_citizen' = 'true' OR priority_flags::json->>'pwd' = 'true' OR priority_flags::json->>'pregnant' = 'true'), 0),
    COALESCE(AVG(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - created_at)) / 60), 0),
    5, -- Default service time
    EXTRACT(HOUR FROM CURRENT_TIMESTAMP)::INTEGER,
    COALESCE(MAX(token_number), 0),
    COALESCE(COUNT(*) FILTER (WHERE queue_status = 'completed'), 0),
    1 -- Default counter ID
FROM customers 
WHERE DATE(created_at) = CURRENT_DATE
ON CONFLICT (date) DO NOTHING;

COMMIT;

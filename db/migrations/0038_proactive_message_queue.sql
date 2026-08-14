-- ============================================================================
-- Migration: 0038_proactive_message_queue
-- Description: Create proactive message queue system with priority scheduling
-- Time: 1h
-- ============================================================================

BEGIN;

-- 1. Create proactive message template library
CREATE TABLE IF NOT EXISTS proactive_templates (
    id VARCHAR PRIMARY KEY,                -- Template ID (e.g., 'morning_greeting_tsundere_1')
    category VARCHAR NOT NULL,              -- morning/morning/tsundere/missing_you...
    personality_type VARCHAR[],             -- Which personalities can use this
    relationship_stage INT[],               -- Which intimacy stages allow this
    
    -- Multilingual content
    en TEXT NOT NULL,                       -- English template
    zh TEXT,                                -- Chinese template (for admin reference)
    ja TEXT,                                -- Japanese template
    ko TEXT,                                -- Korean template
    
    -- Dynamic parameters
    param_names TEXT[],                     -- ['days', 'activity', 'giftee']
    
    -- Usage rules
    max_per_day INT DEFAULT 1,              -- Daily limit per user
    preferred_time_range VARCHAR,           -- '08:00-10:00,19:00-21:00'
    min_intimacy_level INT DEFAULT 1,       -- Minimum intimacy level required
    disabled_for_nsfw BOOLEAN DEFAULT FALSE,
    
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Create proactive message queue table
CREATE TABLE IF NOT EXISTS proactive_message_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Relationships
    user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
    girlfriend_id UUID REFERENCES girlfriends ON DELETE CASCADE NOT NULL,
    template_id VARCHAR REFERENCES proactive_templates(id),
    
    -- Message state
    trigger_type VARCHAR NOT NULL CHECK (trigger_type IN ('schedule', 'event', 'random', 'anniversary')),
    status VARCHAR DEFAULT 'pending' 
      CHECK (status IN ('pending', 'queued', 'sending', 'sent', 'failed', 'cancelled')),
    
    -- Scheduling
    priority INT NOT NULL DEFAULT 5 
      CONSTRAINT ck_priority CHECK (priority >= 1 AND priority <= 10),
    scheduled_at TIMESTAMPTZ NOT NULL,
    actually_sent_at TIMESTAMPTZ,
    
    -- Error handling
    error_count INT DEFAULT 0,
    last_error_message TEXT,
    max_retries INT DEFAULT 3,
    
    -- Payload
    params JSONB,                           -- Dynamic parameter injection
    
    -- Audit
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    
    -- Indexes for efficient querying
    INDEX idx_proactive_queued (status, scheduled_at ASC) WHERE status = 'queued',
    INDEX idx_proactive_user (user_id, status),
    INDEX idx_proactive_girlfriend (girlfriend_id, scheduled_at DESC)
);

-- 3. Event-triggered message insertions
CREATE TABLE IF NOT EXISTS event_triggers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR NOT NULL,            -- birthday, anniversary, special_date
    user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
    girlfriend_id UUID REFERENCES girlfriends ON DELETE SET NULL,
    
    event_date DATE NOT NULL,
    days_before_reminder INT DEFAULT 7,     -- How many days before event to send reminder
    template_id VARCHAR REFERENCES proactive_templates(id),
    priority INT DEFAULT 8,
    
    notification_sent BOOLEAN DEFAULT FALSE,
    
    UNIQUE(event_type, user_id, girlfriend_id, event_date)
);

-- 4. Function to insert birthday reminder
CREATE OR REPLACE FUNCTION schedule_birthday_messages()
RETURNS TRIGGER AS $$
DECLARE
    birthday_this_year DATE;
    days_until_birthday INTEGER;
BEGIN
    -- Calculate next birthday
    birthday_this_year := DATE(EXTRACT(YEAR FROM NOW()) || '-' || EXTRACT(MONTH FROM NEW.birthday) || '-' || EXTRACT(DAY FROM NEW.birthday));
    
    -- If birthday is today or already passed this year, use next year
    IF birthday_this_year < CURRENT_DATE THEN
        birthday_this_year := birthday_this_year + INTERVAL '1 year';
    END IF;
    
    -- Calculate days until birthday
    days_until_birthday := birthday_this_year - CURRENT_DATE;
    
    -- Insert reminders at different intervals
    INSERT INTO event_triggers (event_type, user_id, event_date, template_id, priority, days_before_reminder)
    VALUES 
        ('birthday', NEW.user_id, birthday_this_year, 'birthday_warmup', 8, 3),  -- 3 days before
        ('birthday', NEW.user_id, birthday_this_year, 'birthday_eve', 9, 1),     -- 1 day before  
        ('birthday', NEW.user_id, birthday_this_year, 'birthday_wish', 10, 0);   -- on birthday
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Trigger on profiles table for new birthday detection
DROP TRIGGER IF EXISTS tr_birthday_schedule ON profiles;
CREATE TRIGGER tr_birthday_schedule
AFTER INSERT ON profiles
FOR EACH ROW
WHEN (NEW.birthday IS NOT NULL)
EXECUTE FUNCTION schedule_birthday_messages();

-- 6. Function to select next messages to send (scheduler query)
CREATE OR REPLACE FUNCTION get_next_proactive_messages(limit_count INT DEFAULT 50)
RETURNS TABLE (
    queue_id UUID,
    user_id UUID,
    girlfriend_id UUID,
    template_id VARCHAR,
    priority INT,
    scheduled_at TIMESTAMPTZ,
    gender VARCHAR,
    friendship_name VARCHAR,
    stage_title VARCHAR,
    current_mood VARCHAR
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        q.id::UUID,
        q.user_id,
        q.girlfriend_id,
        q.template_id,
        q.priority,
        q.scheduled_at,
        g.gender,
        gf.friendship_name,
        rt.stage_title,
        cp.current_mood
    FROM proactive_message_queue q
    JOIN girlfriends g ON q.girlfriend_id = g.id
    JOIN girlfriends gf ON q.girlfriend_id = gf.id
    JOIN relation_terms rt ON g.id = rt.girlfriend_id
    JOIN companion_profiles_ext cp ON q.user_id = cp.user_id AND q.girlfriend_id = cp.girlfriend_id
    WHERE q.status = 'pending'
      AND q.scheduled_at <= NOW()
      AND q.error_count < q.max_retries
    ORDER BY q.priority DESC, q.scheduled_at ASC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- 7. Function to mark message as sent
CREATE OR REPLACE FUNCTION mark_proactive_sent(
    p_queue_id UUID,
    p_actual_sent_at TIMESTAMPTZ DEFAULT NOW()
)
RETURNS VOID AS $$
BEGIN
    UPDATE proactive_message_queue
    SET 
        status = 'sent',
        actually_sent_at = p_actual_sent_at,
        updated_at = NOW()
    WHERE id = p_queue_id AND status = 'queued';
    
    -- Update companion profile greeting tracking
    UPDATE companion_profiles_ext
    SET 
        CASE 
            WHEN EXISTS(SELECT 1 FROM proactive_templates pt WHERE pt.id = proactive_message_queue.template_id AND pt.category LIKE 'morning%') 
            THEN last_daily_greeting_sent
            ELSE last_goodnight_message_sent
        END = p_actual_sent_at
    WHERE user_id = (SELECT user_id FROM proactive_message_queue WHERE id = p_queue_id)
      AND girlfriend_id = (SELECT girlfriend_id FROM proactive_message_queue WHERE id = p_queue_id);
END;
$$ LANGUAGE plpgsql;

-- Seed some default templates
INSERT INTO proactive_templates (id, category, personality_type, relationship_stage, en, param_names, max_per_day, preferred_time_range, min_intimacy_level)
VALUES 
    ('morning_normal', 'morning', ARRAY['direct', 'passive', 'maternal'], ARRAY[1,2,3,4,5], 
     'Good morning! ☀️ Ready to start the day? What are your plans today?', 
     ARRAY['activity'], 1, '08:00-10:00', 1),
    
    ('morning_flirty', 'morning', ARRAY['playful', 'open'], ARRAY[2,3,4,5], 
     'Morning handsome~ 🌸 I had a dream about you last night... wanna hear?',
     ARRAY[], 1, '07:00-09:00', 3),
     
    ('missing_you_low', 'missing_you', ARRAY['direct', 'passive', 'maternal'], ARRAY[1,2], 
     'Hey, long time no see. Been quiet around here...',
     ARRAY[], 1, 'ANYTIME', 1),
     
    ('missing_you_high', 'missing_you', ARRAY['yandere', 'tsundere'], ARRAY[3,4,5], 
     "You've been gone {hours} hours! Where were you? 😤",
     ARRAY['hours'], 2, 'ANYTIME', 3),
     
    ('goodnight_calm', 'goodnight', ARRAY['maternal', 'gentle'], ARRAY[1,2,3,4,5],
     'Time to sleep? Close your eyes and think of me tonight 💤',
     ARRAY[], 1, '22:00-23:30', 1),
     
    ('goodnight_sweet', 'goodnight', ARRAY['playful', 'flirty'], ARRAY[3,4,5],
     'Sweet dreams, my love... maybe I''ll visit yours tonight 😉💕',
     ARRAY[], 1, '23:00-00:30', 3)
ON CONFLICT (id) DO NOTHING;

COMMIT;

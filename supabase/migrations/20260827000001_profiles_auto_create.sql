-- Auto-create profile on user signup with safer checks
-- This script handles existing tables/functions gracefully

-- Create trigger function first (idempotent)
DO $$ 
BEGIN
    -- Drop existing function if it exists
    DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
    
    -- Create new function
    CREATE OR REPLACE FUNCTION public.handle_new_user()
    RETURNS TRIGGER AS $$
    BEGIN
        INSERT INTO public.profiles (
            id, email, membership_tier, tokens, created_at, updated_at
        ) VALUES (
            NEW.id,
            NEW.email,
            'free',
            500,
            now(),
            now()
        );
        RETURN NEW;
    EXCEPTION WHEN OTHERS THEN
        RAISE LOG 'Error creating profile for user %: %', NEW.id, SQLERRM;
        RETURN NEW;
    END;
END $$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add trigger (drop first to avoid conflicts)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

COMMENT ON FUNCTION public.handle_new_user() IS 'Auto-creates profile record when user signs up';

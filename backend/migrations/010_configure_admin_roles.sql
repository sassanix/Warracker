-- Migration: Configure PostgreSQL Admin Role
-- This is optional role management - will be skipped if permissions are insufficient

DO $$ 
BEGIN
    -- Try to create admin role, but continue if it fails
    BEGIN
        -- Check if the db_admin_user exists, if not create it
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = %(db_admin_user_name)s) THEN
            CREATE ROLE %(db_admin_user)s WITH LOGIN PASSWORD %(db_admin_password)s;
            RAISE NOTICE 'Successfully created admin role %(db_admin_user)s';
        END IF;
        
        -- Grant privileges to the admin role
        GRANT ALL PRIVILEGES ON DATABASE %(db_name)s TO %(db_admin_user)s;
        GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO %(db_admin_user)s;
        GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO %(db_admin_user)s;
        GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO %(db_admin_user)s;
        
        -- Try to grant CREATEROLE, but continue if it fails
        BEGIN
            ALTER ROLE %(db_admin_user)s WITH CREATEROLE;
            RAISE NOTICE 'Successfully granted CREATEROLE to %(db_admin_user)s';
        EXCEPTION WHEN insufficient_privilege THEN
            RAISE NOTICE 'Insufficient privileges to grant CREATEROLE to %(db_admin_user)s - role management features may be limited';
        WHEN OTHERS THEN
            RAISE NOTICE 'Could not grant CREATEROLE to %(db_admin_user)s - role management features may be limited';
        END;
        
    EXCEPTION WHEN insufficient_privilege THEN
        RAISE NOTICE 'Insufficient privileges to create admin role %(db_admin_user)s - this is optional and the application will work without it';
    WHEN OTHERS THEN
        RAISE NOTICE 'Could not create admin role %(db_admin_user)s - this is optional and the application will work without it';
    END;
END
$$;

-- Ensure the db_user can still access all application tables
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO %(db_user)s;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO %(db_user)s;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO %(db_user)s;

-- Make db_admin_user the owner of all existing users
-- Note: This would require superuser privileges to execute
-- ALTER ROLE %(db_user)s OWNER TO %(db_admin_user)s; 

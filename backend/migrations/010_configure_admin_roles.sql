-- Migration: Configure PostgreSQL Admin Role
-- This is optional role management - skipped when DB_ADMIN_USER and
-- DB_ADMIN_PASSWORD are not set, or if privileges are insufficient.

DO $$
DECLARE
    admin_user text := %(db_admin_user_name)s;
    admin_password text := %(db_admin_password)s;
    target_db text := %(db_name_literal)s;
BEGIN
    IF admin_user IS NULL OR admin_user = '' OR admin_password IS NULL OR admin_password = '' THEN
        RAISE NOTICE 'DB_ADMIN_USER/DB_ADMIN_PASSWORD not set - skipping optional admin role configuration';
        RETURN;
    END IF;

    -- Try to create admin role, but continue if it fails
    BEGIN
        -- Check if the db_admin_user exists, if not create it
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = admin_user) THEN
            EXECUTE format('CREATE ROLE %%I WITH LOGIN PASSWORD %%L', admin_user, admin_password);
            RAISE NOTICE 'Successfully created admin role %%', admin_user;
        END IF;
        
        -- Grant privileges to the admin role
        EXECUTE format('GRANT ALL PRIVILEGES ON DATABASE %%I TO %%I', target_db, admin_user);
        EXECUTE format('GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO %%I', admin_user);
        EXECUTE format('GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO %%I', admin_user);
        EXECUTE format('GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO %%I', admin_user);
        
        -- Try to grant CREATEROLE, but continue if it fails
        BEGIN
            EXECUTE format('ALTER ROLE %%I WITH CREATEROLE', admin_user);
            RAISE NOTICE 'Successfully granted CREATEROLE to %%', admin_user;
        EXCEPTION WHEN insufficient_privilege THEN
            RAISE NOTICE 'Insufficient privileges to grant CREATEROLE to %% - role management features may be limited', admin_user;
        WHEN OTHERS THEN
            RAISE NOTICE 'Could not grant CREATEROLE to %% - role management features may be limited', admin_user;
        END;
        
    EXCEPTION WHEN insufficient_privilege THEN
        RAISE NOTICE 'Insufficient privileges to create admin role %% - this is optional and the application will work without it', admin_user;
    WHEN OTHERS THEN
        RAISE NOTICE 'Could not create admin role %% - this is optional and the application will work without it', admin_user;
    END;
END
$$;

-- Ensure the db_user can still access all application tables
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO %(db_user)s;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO %(db_user)s;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO %(db_user)s;

-- Make db_admin_user the owner of all existing users
-- Note: This would require superuser privileges to execute
-- ALTER ROLE <db_user> OWNER TO <db_admin_user>;

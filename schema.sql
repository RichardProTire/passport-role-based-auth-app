-- schema.sql
-- Create the users table for storing user credentials
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL
);

-- Create the session table for connect-pg-simple
CREATE TABLE IF NOT EXISTS "session" (
    "sid" varchar NOT NULL COLLATE "default",
    "sess" json NOT NULL,
    "expire" timestamp(6) NOT NULL
);

ALTER TABLE "session" ADD CONSTRAINT "session_pkey" PRIMARY KEY ("sid");

-- Optional: Index to optimize session expiration cleanup
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");

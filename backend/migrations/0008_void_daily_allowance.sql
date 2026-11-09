ALTER TABLE gc2_accounts ADD COLUMN usage_day text NOT NULL DEFAULT '';
ALTER TABLE gc2_accounts ADD COLUMN sessions_today integer NOT NULL DEFAULT 0;

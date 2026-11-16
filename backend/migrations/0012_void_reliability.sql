CREATE TABLE gc2_provider_operations (
 id text PRIMARY KEY, account_id uuid NOT NULL REFERENCES gc2_accounts(id) ON DELETE CASCADE,
 session_id uuid NOT NULL REFERENCES gc2_sessions(id) ON DELETE CASCADE,
 operation_id text NOT NULL, parent_id text, kind text NOT NULL, resource_group text NOT NULL,
 provider text NOT NULL, status text NOT NULL, error_kind text,
 expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz
);
CREATE INDEX gc2_provider_capacity ON gc2_provider_operations(resource_group,status,expires_at);
CREATE INDEX gc2_provider_usage ON gc2_provider_operations(account_id,kind,created_at);
CREATE INDEX gc2_provider_session ON gc2_provider_operations(session_id,kind);
CREATE TABLE gc2_provider_circuits (provider text PRIMARY KEY, failures integer NOT NULL DEFAULT 0, open_until timestamptz);
ALTER TABLE gc2_graph_nodes ADD COLUMN metadata jsonb;
ALTER TABLE gc2_graph_nodes ADD COLUMN metadata_version integer NOT NULL DEFAULT 1;
ALTER TABLE gc2_graph_edges ADD COLUMN similarity real;
ALTER TABLE gc2_analysis_runs ADD COLUMN schema_version integer NOT NULL DEFAULT 1;

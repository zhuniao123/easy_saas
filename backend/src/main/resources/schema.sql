CREATE TABLE IF NOT EXISTS lc_entity_model (
    entity_code        VARCHAR(100) PRIMARY KEY,
    table_name         VARCHAR(100) NOT NULL,
    primary_key        VARCHAR(50) NOT NULL DEFAULT 'id',
    label_field        VARCHAR(100),
    fields_json        JSONB NOT NULL,
    created_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lc_query_model (
    query_code         VARCHAR(100) PRIMARY KEY,
    anchor_entity      VARCHAR(100) REFERENCES lc_entity_model(entity_code),
    sql_text           TEXT NOT NULL,
    query_mode         VARCHAR(50) NOT NULL DEFAULT 'rawSql',
    params_json        JSONB NOT NULL DEFAULT '[]'::jsonb,
    result_fields_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    groovy_script_code VARCHAR(100),
    timeout_ms         INTEGER NOT NULL DEFAULT 5000
);

-- Existing databases created before query_mode existed
ALTER TABLE lc_query_model ADD COLUMN IF NOT EXISTS query_mode VARCHAR(50) NOT NULL DEFAULT 'rawSql';

CREATE TABLE IF NOT EXISTS lc_page_model (
    page_code          VARCHAR(100) PRIMARY KEY,
    title              VARCHAR(200) NOT NULL,
    route_path         VARCHAR(200) NOT NULL UNIQUE,
    query_code         VARCHAR(100) REFERENCES lc_query_model(query_code),
    entity_code        VARCHAR(100) REFERENCES lc_entity_model(entity_code),
    config_json        JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS lc_script (
    script_code        VARCHAR(100) PRIMARY KEY,
    script_type        VARCHAR(50) NOT NULL,
    script_content     TEXT NOT NULL,
    created_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lc_query_log (
    id                 BIGSERIAL PRIMARY KEY,
    query_code         VARCHAR(100) NOT NULL,
    params_json        JSONB NOT NULL DEFAULT '{}'::jsonb,
    duration_ms        INTEGER,
    success            BOOLEAN NOT NULL,
    error_message      TEXT,
    created_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Phase C: reusable SQL transaction actions (execution catalog)
CREATE TABLE IF NOT EXISTS lc_action (
    action_code        VARCHAR(100) PRIMARY KEY,
    action_type        VARCHAR(50)  NOT NULL DEFAULT 'sqlTransaction',
    label              VARCHAR(200) NOT NULL,
    config_json        JSONB        NOT NULL,
    enabled            BOOLEAN      NOT NULL DEFAULT true,
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lc_action_log (
    id                 BIGSERIAL PRIMARY KEY,
    action_code        VARCHAR(100) NOT NULL,
    page_code          VARCHAR(100),
    params_json        JSONB        NOT NULL DEFAULT '{}'::jsonb,
    success            BOOLEAN      NOT NULL,
    error_message      TEXT,
    duration_ms        INTEGER,
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lc_action_log_action_created
    ON lc_action_log (action_code, created_at DESC);

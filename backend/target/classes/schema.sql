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
    params_json        JSONB NOT NULL DEFAULT '[]'::jsonb,
    result_fields_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    groovy_script_code VARCHAR(100),
    timeout_ms         INTEGER NOT NULL DEFAULT 5000
);

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

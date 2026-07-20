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

CREATE TABLE IF NOT EXISTS lc_client_log (
    id                 BIGSERIAL PRIMARY KEY,
    page_code          VARCHAR(100) NOT NULL,
    event_type         VARCHAR(50) NOT NULL,
    element_code       VARCHAR(100),
    message            TEXT,
    details_json       JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lc_client_log_page_created
    ON lc_client_log (page_code, created_at DESC);

-- Dictionary (minimal)
CREATE TABLE IF NOT EXISTS lc_dict_type (
    dict_code          VARCHAR(100) PRIMARY KEY,
    name               VARCHAR(200) NOT NULL,
    description        TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lc_dict_item (
    id                 BIGSERIAL PRIMARY KEY,
    dict_code          VARCHAR(100) NOT NULL REFERENCES lc_dict_type(dict_code) ON DELETE CASCADE,
    item_value         VARCHAR(100) NOT NULL,
    item_label         VARCHAR(200) NOT NULL,
    sort_order         INTEGER NOT NULL DEFAULT 0,
    enabled            BOOLEAN NOT NULL DEFAULT true,
    UNIQUE (dict_code, item_value)
);

CREATE INDEX IF NOT EXISTS idx_lc_dict_item_code_sort
    ON lc_dict_item (dict_code, sort_order, item_value);

-- Server error log
CREATE TABLE IF NOT EXISTS lc_error_log (
    id                 BIGSERIAL PRIMARY KEY,
    source             VARCHAR(50) NOT NULL DEFAULT 'api',
    path               VARCHAR(500),
    http_method        VARCHAR(20),
    error_type         VARCHAR(200),
    message            TEXT,
    stack_trace        TEXT,
    request_json       JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lc_error_log_created
    ON lc_error_log (created_at DESC);

-- Seed common dictionaries (idempotent)
INSERT INTO lc_dict_type (dict_code, name, description) VALUES
    ('common.enabled_status', '启用状态', '0停用 1启用'),
    ('common.draft_posted', '草稿/已过账', '0草稿 1已过账'),
    ('shop.move_type', '库存流水类型', 'IN/OUT/ADJ')
ON CONFLICT (dict_code) DO NOTHING;

INSERT INTO lc_dict_item (dict_code, item_value, item_label, sort_order) VALUES
    ('common.enabled_status', '1', '启用', 1),
    ('common.enabled_status', '0', '停用', 2),
    ('common.draft_posted', '0', '草稿', 1),
    ('common.draft_posted', '1', '已过账', 2),
    ('shop.move_type', 'IN', '入库', 1),
    ('shop.move_type', 'OUT', '出库', 2),
    ('shop.move_type', 'ADJ', '调整', 3)
ON CONFLICT (dict_code, item_value) DO NOTHING;

-- RBAC (v1.2 Slice A)
CREATE TABLE IF NOT EXISTS lc_user (
    user_id            BIGSERIAL PRIMARY KEY,
    login_name         VARCHAR(100) NOT NULL UNIQUE,
    password_hash      VARCHAR(200) NOT NULL,
    display_name       VARCHAR(200) NOT NULL,
    org_id             BIGINT NOT NULL DEFAULT 1,
    enabled            BOOLEAN NOT NULL DEFAULT true,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lc_role (
    role_code          VARCHAR(50) PRIMARY KEY,
    name               VARCHAR(100) NOT NULL,
    data_scope         VARCHAR(20) NOT NULL DEFAULT 'all'
);

CREATE TABLE IF NOT EXISTS lc_user_role (
    user_id            BIGINT NOT NULL REFERENCES lc_user(user_id) ON DELETE CASCADE,
    role_code          VARCHAR(50) NOT NULL REFERENCES lc_role(role_code) ON DELETE CASCADE,
    PRIMARY KEY (user_id, role_code)
);

CREATE TABLE IF NOT EXISTS lc_permission (
    perm_code          VARCHAR(200) PRIMARY KEY,
    perm_type          VARCHAR(20) NOT NULL,
    resource_code      VARCHAR(200) NOT NULL,
    description        VARCHAR(500)
);

CREATE TABLE IF NOT EXISTS lc_role_permission (
    role_code          VARCHAR(50) NOT NULL REFERENCES lc_role(role_code) ON DELETE CASCADE,
    perm_code          VARCHAR(200) NOT NULL REFERENCES lc_permission(perm_code) ON DELETE CASCADE,
    PRIMARY KEY (role_code, perm_code)
);

INSERT INTO lc_role (role_code, name, data_scope) VALUES
    ('owner', '老板', 'all'),
    ('clerk', '店员', 'org')
ON CONFLICT (role_code) DO NOTHING;


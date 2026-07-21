#!/usr/bin/env python3
"""
easy_saas CLI (v0 prototype) — AI / agent friendly page scaffold.

Environment:
  EASY_SAAS_URL       default http://127.0.0.1:8081
  EASY_SAAS_USER      default owner
  EASY_SAAS_PASSWORD  default owner123

Examples:
  python3 tools/easy_saas_cli/easy_saas_cli.py templates
  python3 tools/easy_saas_cli/easy_saas_cli.py create \\
      --page-code demo_items --title 'Demo Items' --route /demo/items --template crud_grid
  python3 tools/easy_saas_cli/easy_saas_cli.py apply --spec templates/example-page-spec.json
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


def env(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


class EasySaasClient:
    def __init__(self, base_url: str, token: str | None = None):
        self.base = base_url.rstrip("/")
        self.token = token

    def _req(
        self,
        method: str,
        path: str,
        body: dict | list | None = None,
        auth: bool = True,
    ) -> Any:
        url = f"{self.base}{path}"
        data = None
        headers = {"Accept": "application/json"}
        if body is not None:
            data = json.dumps(body).encode("utf-8")
            headers["Content-Type"] = "application/json"
        if auth and self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                raw = resp.read().decode("utf-8")
                if not raw:
                    return {"status": "ok", "httpStatus": resp.status}
                return json.loads(raw)
        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8", errors="replace")
            try:
                parsed = json.loads(err_body)
            except Exception:
                parsed = {"message": err_body}
            raise SystemExit(
                f"HTTP {e.code} {method} {path}: {parsed.get('message') or parsed.get('error') or err_body}"
            ) from e
        except urllib.error.URLError as e:
            raise SystemExit(f"Connection failed {self.base}: {e}") from e

    def login(self, login_name: str, password: str) -> str:
        data = self._req(
            "POST",
            "/api/v1/auth/login",
            {"loginName": login_name, "password": password},
            auth=False,
        )
        token = data.get("token")
        if not token:
            raise SystemExit(f"Login failed: {data}")
        self.token = str(token)
        return self.token

    def templates(self) -> list:
        return self._req("GET", "/api/v1/pages/templates")

    def list_pages(self) -> list:
        return self._req("GET", "/api/v1/pages")

    def create_page(
        self,
        page_code: str,
        title: str,
        route_path: str,
        template: str = "crud_grid",
    ) -> dict:
        return self._req(
            "POST",
            "/api/v1/pages",
            {
                "pageCode": page_code,
                "title": title,
                "routePath": route_path,
                "template": template,
            },
        )

    def get_page(self, page_code: str) -> dict:
        return self._req("GET", f"/api/v1/pages/{page_code}")

    def configure_page(self, page_code: str, config: dict | str) -> dict:
        if isinstance(config, dict):
            config_json = json.dumps(config, ensure_ascii=False)
        else:
            config_json = config
        return self._req(
            "POST",
            f"/api/v1/pages/{page_code}/configure",
            {"configJson": config_json},
        )

    def configure_query(
        self,
        query_code: str,
        sql_text: str,
        query_mode: str | None = None,
        anchor_entity: str | None = None,
    ) -> dict:
        body: dict[str, Any] = {"sqlText": sql_text}
        if query_mode:
            body["queryMode"] = query_mode
        if anchor_entity:
            body["anchorEntity"] = anchor_entity
        return self._req("POST", f"/api/v1/queries/{query_code}/configure", body)

    def configure_entity(
        self,
        entity_code: str,
        fields: list | str,
        primary_key: str | None = "id",
    ) -> dict:
        if isinstance(fields, list):
            fields_json = json.dumps(fields, ensure_ascii=False)
        else:
            fields_json = fields
        body: dict[str, Any] = {"fieldsJson": fields_json}
        if primary_key:
            body["primaryKey"] = primary_key
        return self._req(
            "POST",
            f"/api/v1/pages/entities/{entity_code}/configure",
            body,
        )

    def refresh_permissions(self) -> dict:
        return self._req("POST", "/api/v1/auth/refresh-permissions")


def load_json_file(path: str) -> Any:
    p = Path(path)
    if not p.is_file():
        raise SystemExit(f"File not found: {path}")
    return json.loads(p.read_text(encoding="utf-8"))


def cmd_templates(client: EasySaasClient, _args: argparse.Namespace) -> None:
    data = client.templates()
    print(json.dumps(data, ensure_ascii=False, indent=2))


def cmd_list_pages(client: EasySaasClient, _args: argparse.Namespace) -> None:
    data = client.list_pages()
    print(json.dumps(data, ensure_ascii=False, indent=2))


def cmd_create(client: EasySaasClient, args: argparse.Namespace) -> None:
    res = client.create_page(args.page_code, args.title, args.route, args.template)
    print(json.dumps(res, ensure_ascii=False, indent=2))
    try:
        client.refresh_permissions()
    except SystemExit:
        pass
    page = client.get_page(args.page_code)
    print(
        json.dumps(
            {
                "pageCode": page.get("pageCode"),
                "queryCode": page.get("queryCode"),
                "entityCode": page.get("entityCode"),
                "writable": page.get("writable"),
            },
            ensure_ascii=False,
            indent=2,
        )
    )


def cmd_configure_page(client: EasySaasClient, args: argparse.Namespace) -> None:
    cfg = load_json_file(args.config_file)
    res = client.configure_page(args.page_code, cfg)
    print(json.dumps(res, ensure_ascii=False, indent=2))


def cmd_configure_query(client: EasySaasClient, args: argparse.Namespace) -> None:
    sql = Path(args.sql_file).read_text(encoding="utf-8") if args.sql_file else args.sql
    if not sql:
        raise SystemExit("Provide --sql or --sql-file")
    res = client.configure_query(
        args.query_code, sql, query_mode=args.query_mode, anchor_entity=args.anchor_entity
    )
    print(json.dumps(res, ensure_ascii=False, indent=2))


def cmd_configure_entity(client: EasySaasClient, args: argparse.Namespace) -> None:
    fields = load_json_file(args.fields_file)
    res = client.configure_entity(args.entity_code, fields, primary_key=args.primary_key)
    print(json.dumps(res, ensure_ascii=False, indent=2))


def cmd_apply(client: EasySaasClient, args: argparse.Namespace) -> None:
    """
    Apply a full page-spec JSON produced by AI.

    Spec schema (v0):
    {
      "pageCode": "demo_items",
      "title": "Demo Items",
      "routePath": "/demo/items",
      "template": "crud_grid",
      "sqlText": "optional override after create",
      "queryMode": "singleTableTemplate",
      "pageConfig": { ... optional page DSL ... },
      "entityFields": [ { "field","label","type" }, ... ],
      "primaryKey": "id",
      "dataSourceCode": null
    }
    """
    spec = load_json_file(args.spec)
    page_code = spec["pageCode"]
    title = spec.get("title") or page_code
    route = spec.get("routePath") or f"/{page_code.replace('_', '-')}"
    template = spec.get("template") or "crud_grid"

    print(f"[1/4] create page {page_code} template={template}", file=sys.stderr)
    try:
        client.create_page(page_code, title, route, template)
    except SystemExit as e:
        # allow re-apply if page exists: continue to configure
        if "already" not in str(e).lower() and "exist" not in str(e).lower() and "409" not in str(e):
            # still try get
            pass
        print(f"  create note: {e}", file=sys.stderr)

    try:
        client.refresh_permissions()
    except SystemExit:
        pass

    page = client.get_page(page_code)
    query_code = page.get("queryCode") or f"q_{page_code}"
    entity_code = page.get("entityCode") or f"{page_code}_entity"

    if spec.get("sqlText"):
        print(f"[2/4] configure query {query_code}", file=sys.stderr)
        client.configure_query(
            query_code,
            spec["sqlText"],
            query_mode=spec.get("queryMode"),
            anchor_entity=entity_code if page.get("entityCode") else None,
        )
    else:
        print("[2/4] skip sql (using template default)", file=sys.stderr)

    if spec.get("entityFields") is not None and page.get("entityCode"):
        print(f"[3/4] configure entity {entity_code}", file=sys.stderr)
        client.configure_entity(
            entity_code,
            spec["entityFields"],
            primary_key=spec.get("primaryKey") or "id",
        )
    else:
        print("[3/4] skip entity", file=sys.stderr)

    if spec.get("pageConfig"):
        print(f"[4/4] configure page {page_code}", file=sys.stderr)
        client.configure_page(page_code, spec["pageConfig"])
    else:
        print("[4/4] skip pageConfig (template default)", file=sys.stderr)

    out = {
        "status": "success",
        "pageCode": page_code,
        "queryCode": query_code,
        "entityCode": page.get("entityCode"),
        "routePath": route,
        "template": template,
    }
    print(json.dumps(out, ensure_ascii=False, indent=2))


def cmd_get_page(client: EasySaasClient, args: argparse.Namespace) -> None:
    print(json.dumps(client.get_page(args.page_code), ensure_ascii=False, indent=2))


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="easy-saas-cli",
        description="easy_saas AI page scaffold CLI (prototype)",
    )
    p.add_argument("--url", default=env("EASY_SAAS_URL", "http://127.0.0.1:8081"))
    p.add_argument("--user", default=env("EASY_SAAS_USER", "owner"))
    p.add_argument("--password", default=env("EASY_SAAS_PASSWORD", "owner123"))
    p.add_argument("--token", default=env("EASY_SAAS_TOKEN", ""), help="Skip login if set")

    sub = p.add_subparsers(dest="command", required=True)

    sub.add_parser("templates", help="List page templates")
    sub.add_parser("list-pages", help="List pages")

    c = sub.add_parser("create", help="Create page from factory template")
    c.add_argument("--page-code", required=True)
    c.add_argument("--title", required=True)
    c.add_argument("--route", required=True)
    c.add_argument(
        "--template",
        default="crud_grid",
        choices=["crud_grid", "status_board", "readonly_sql", "blank"],
    )

    g = sub.add_parser("get-page", help="Get page config")
    g.add_argument("--page-code", required=True)

    cp = sub.add_parser("configure-page", help="PUT page DSL JSON")
    cp.add_argument("--page-code", required=True)
    cp.add_argument("--config-file", required=True)

    cq = sub.add_parser("configure-query", help="Update query SQL")
    cq.add_argument("--query-code", required=True)
    cq.add_argument("--sql", default="")
    cq.add_argument("--sql-file", default="")
    cq.add_argument("--query-mode", default=None)
    cq.add_argument("--anchor-entity", default=None)

    ce = sub.add_parser("configure-entity", help="Update entity fields JSON")
    ce.add_argument("--entity-code", required=True)
    ce.add_argument("--fields-file", required=True)
    ce.add_argument("--primary-key", default="id")

    a = sub.add_parser("apply", help="Apply full AI page-spec JSON")
    a.add_argument("--spec", required=True, help="Path to page-spec JSON")

    return p


def main(argv: list[str] | None = None) -> None:
    parser = build_parser()
    args = parser.parse_args(argv)
    client = EasySaasClient(args.url, token=args.token or None)
    if not client.token:
        client.login(args.user, args.password)

    handlers = {
        "templates": cmd_templates,
        "list-pages": cmd_list_pages,
        "create": cmd_create,
        "get-page": cmd_get_page,
        "configure-page": cmd_configure_page,
        "configure-query": cmd_configure_query,
        "configure-entity": cmd_configure_entity,
        "apply": cmd_apply,
    }
    handlers[args.command](client, args)


if __name__ == "__main__":
    main()

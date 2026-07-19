package com.example.lowcode.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class DictService {
    @Autowired
    private NamedParameterJdbcTemplate jdbcTemplate;

    public List<Map<String, Object>> listTypes() {
        return jdbcTemplate.query(
                """
                SELECT dict_code AS "dictCode", name, description
                FROM lc_dict_type
                ORDER BY dict_code
                """,
                new HashMap<>(),
                (rs, rowNum) -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("dictCode", rs.getString("dictCode"));
                    m.put("name", rs.getString("name"));
                    m.put("description", rs.getString("description"));
                    return m;
                }
        );
    }

    public List<Map<String, Object>> listItems(String dictCode, boolean enabledOnly) {
        Map<String, Object> params = new HashMap<>();
        params.put("code", dictCode);
        String sql = """
                SELECT item_value AS "value", item_label AS "label", sort_order AS "sortOrder", enabled
                FROM lc_dict_item
                WHERE dict_code = :code
                """;
        if (enabledOnly) {
            sql += " AND enabled = true ";
        }
        sql += " ORDER BY sort_order, item_value";
        return jdbcTemplate.query(sql, params, (rs, rowNum) -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("value", rs.getString("value"));
            m.put("label", rs.getString("label"));
            m.put("sortOrder", rs.getInt("sortOrder"));
            m.put("enabled", rs.getBoolean("enabled"));
            return m;
        });
    }

    /** Options shape compatible with filter select: [{label,value}] */
    public List<Map<String, Object>> listOptions(String dictCode) {
        List<Map<String, Object>> items = listItems(dictCode, true);
        return items.stream().map(item -> {
            Map<String, Object> opt = new LinkedHashMap<>();
            opt.put("label", item.get("label"));
            opt.put("value", item.get("value"));
            return opt;
        }).toList();
    }
}

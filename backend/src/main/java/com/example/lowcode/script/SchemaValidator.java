package com.example.lowcode.script;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Minimal request/response schema checks (object + required + property types).
 * Not a full JSON Schema engine — enough for governed dynamic endpoints.
 */
public final class SchemaValidator {
    private SchemaValidator() {}

    @SuppressWarnings("unchecked")
    public static List<String> validate(Object schemaObj, Object data, String path) {
        List<String> errors = new ArrayList<>();
        if (schemaObj == null) {
            return errors;
        }
        if (!(schemaObj instanceof Map<?, ?> schemaMap)) {
            errors.add(path + ": schema must be an object");
            return errors;
        }
        Map<String, Object> schema = (Map<String, Object>) schemaMap;
        String type = schema.get("type") == null ? "object" : String.valueOf(schema.get("type"));

        if ("object".equalsIgnoreCase(type)) {
            if (!(data instanceof Map<?, ?> dataMap)) {
                errors.add(path + ": expected object");
                return errors;
            }
            Map<String, Object> body = (Map<String, Object>) dataMap;
            Object requiredObj = schema.get("required");
            if (requiredObj instanceof List<?> required) {
                for (Object key : required) {
                    String k = String.valueOf(key);
                    Object val = body.get(k);
                    if (val == null || (val instanceof String s && s.isBlank())) {
                        errors.add(path + "." + k + ": required");
                    }
                }
            }
            Object propsObj = schema.get("properties");
            if (propsObj instanceof Map<?, ?> props) {
                for (Map.Entry<?, ?> e : props.entrySet()) {
                    String key = String.valueOf(e.getKey());
                    if (!body.containsKey(key) || body.get(key) == null) {
                        continue;
                    }
                    if (e.getValue() instanceof Map<?, ?> propSchema) {
                        errors.addAll(validateProperty(path + "." + key, (Map<String, Object>) propSchema, body.get(key)));
                    }
                }
            }
            return errors;
        }

        errors.addAll(validateProperty(path, schema, data));
        return errors;
    }

    private static List<String> validateProperty(String path, Map<String, Object> schema, Object value) {
        List<String> errors = new ArrayList<>();
        String type = schema.get("type") == null ? null : String.valueOf(schema.get("type"));
        if (type == null) {
            return errors;
        }
        switch (type.toLowerCase()) {
            case "string" -> {
                if (!(value instanceof String)) {
                    errors.add(path + ": expected string");
                }
            }
            case "number", "integer" -> {
                if (!(value instanceof Number) && !isNumericString(value)) {
                    errors.add(path + ": expected number");
                }
            }
            case "boolean" -> {
                if (!(value instanceof Boolean) && !(value instanceof String s && ("true".equalsIgnoreCase(s) || "false".equalsIgnoreCase(s)))) {
                    errors.add(path + ": expected boolean");
                }
            }
            case "object" -> {
                if (!(value instanceof Map)) {
                    errors.add(path + ": expected object");
                }
            }
            case "array" -> {
                if (!(value instanceof List)) {
                    errors.add(path + ": expected array");
                }
            }
            default -> {
                // unknown types ignored
            }
        }
        return errors;
    }

    private static boolean isNumericString(Object value) {
        if (!(value instanceof String s) || s.isBlank()) {
            return false;
        }
        try {
            Double.parseDouble(s);
            return true;
        } catch (NumberFormatException ex) {
            return false;
        }
    }
}

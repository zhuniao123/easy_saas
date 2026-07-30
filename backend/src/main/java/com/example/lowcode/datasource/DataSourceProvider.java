package com.example.lowcode.datasource;

import com.example.lowcode.datatable.DataTable;

/**
 * Pluggable resolver for a single DataSourceSpec {@code type}.
 * New source kinds register here; Smart Grid must not branch on type.
 */
public interface DataSourceProvider {
    String type();

    DataTable resolve(DataSourceSpec spec);
}

package com.example.lowcode;

import com.example.lowcode.service.ActionLockService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;

@SpringBootTest
public class ActionLockServiceTest {

    @Autowired
    private ActionLockService actionLockService;
    @Autowired
    private NamedParameterJdbcTemplate jdbcTemplate;

    @Test
    void advisoryLockApplies() {
        assertDoesNotThrow(() ->
                jdbcTemplate.getJdbcOperations().execute((ConnectionCallback<Void>) connection -> {
                    try {
                        connection.setAutoCommit(false);
                        actionLockService.applyLocks(
                                connection,
                                List.of(Map.of("mode", "advisory", "key", 424242, "order", 0)),
                                Map.of()
                        );
                        connection.commit();
                    } catch (Exception ex) {
                        throw new RuntimeException(ex);
                    }
                    return null;
                })
        );
    }

    @Test
    void rowLockRejectsUnsafeWhere() {
        assertThrows(RuntimeException.class, () ->
                jdbcTemplate.getJdbcOperations().execute((ConnectionCallback<Void>) connection -> {
                    try {
                        connection.setAutoCommit(false);
                        actionLockService.applyLocks(
                                connection,
                                List.of(Map.of(
                                        "mode", "row",
                                        "table", "lc_user",
                                        "where", "1=1; DROP TABLE x",
                                        "order", 1
                                )),
                                Map.of()
                        );
                    } catch (RuntimeException ex) {
                        throw ex;
                    } catch (Exception ex) {
                        throw new RuntimeException(ex);
                    }
                    return null;
                })
        );
    }
}

package com.example.lowcode.service;

import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;

/**
 * AES-256-GCM for JDBC passwords at rest.
 * Ciphertext = Base64( IV(12) || ciphertext+tag ).
 */
@Service
public class DataSourceCryptoService {
    private static final int GCM_IV_LENGTH = 12;
    private static final int GCM_TAG_BITS = 128;

    @Value("${lowcode.datasource.crypto-key:}")
    private String configuredKey;

    private SecretKey secretKey;
    private boolean usingDevFallback;

    @PostConstruct
    public void init() {
        byte[] keyBytes = resolveKeyBytes(configuredKey);
        this.secretKey = new SecretKeySpec(keyBytes, "AES");
        if (usingDevFallback) {
            System.err.println("[DataSourceCrypto] WARN: using local-dev crypto key. Set LOWCODE_DS_CRYPTO_KEY in production.");
        }
    }

    public String encrypt(String plaintext) {
        if (plaintext == null || plaintext.isEmpty()) {
            return null;
        }
        try {
            byte[] iv = new byte[GCM_IV_LENGTH];
            new SecureRandom().nextBytes(iv);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, secretKey, new GCMParameterSpec(GCM_TAG_BITS, iv));
            byte[] cipherBytes = cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));
            ByteBuffer buf = ByteBuffer.allocate(iv.length + cipherBytes.length);
            buf.put(iv);
            buf.put(cipherBytes);
            return Base64.getEncoder().encodeToString(buf.array());
        } catch (Exception ex) {
            throw new IllegalStateException("Failed to encrypt datasource password", ex);
        }
    }

    public String decrypt(String cipherText) {
        if (cipherText == null || cipherText.isBlank()) {
            return null;
        }
        try {
            byte[] all = Base64.getDecoder().decode(cipherText);
            if (all.length < GCM_IV_LENGTH + 16) {
                throw new IllegalArgumentException("Invalid password_cipher payload");
            }
            byte[] iv = new byte[GCM_IV_LENGTH];
            System.arraycopy(all, 0, iv, 0, GCM_IV_LENGTH);
            byte[] body = new byte[all.length - GCM_IV_LENGTH];
            System.arraycopy(all, GCM_IV_LENGTH, body, 0, body.length);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, secretKey, new GCMParameterSpec(GCM_TAG_BITS, iv));
            byte[] plain = cipher.doFinal(body);
            return new String(plain, StandardCharsets.UTF_8);
        } catch (IllegalArgumentException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new IllegalStateException("Failed to decrypt datasource password", ex);
        }
    }

    public boolean isUsingDevFallback() {
        return usingDevFallback;
    }

    private byte[] resolveKeyBytes(String raw) {
        if (raw != null && !raw.isBlank()) {
            String t = raw.trim();
            // 64 hex chars → 32 bytes
            if (t.matches("(?i)^[0-9a-f]{64}$")) {
                byte[] out = new byte[32];
                for (int i = 0; i < 32; i++) {
                    out[i] = (byte) Integer.parseInt(t.substring(i * 2, i * 2 + 2), 16);
                }
                return out;
            }
            try {
                byte[] decoded = Base64.getDecoder().decode(t);
                if (decoded.length >= 32) {
                    byte[] out = new byte[32];
                    System.arraycopy(decoded, 0, out, 0, 32);
                    return out;
                }
                // short key material → digest
                return sha256(decoded);
            } catch (IllegalArgumentException ignore) {
                return sha256(t.getBytes(StandardCharsets.UTF_8));
            }
        }
        usingDevFallback = true;
        return sha256("easy_saas-local-dev-datasource-key-v1".getBytes(StandardCharsets.UTF_8));
    }

    private static byte[] sha256(byte[] input) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(input);
        } catch (Exception ex) {
            throw new IllegalStateException(ex);
        }
    }
}

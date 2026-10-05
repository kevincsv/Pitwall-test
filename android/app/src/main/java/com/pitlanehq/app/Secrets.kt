package com.pitlanehq.app

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Small secrets (the Pitlane HQ session and data key) encrypted with an AES key that
 * lives in the Android Keystore: it never leaves the phone's secure hardware and is
 * not included in backups.
 */
object Secrets {
    private const val ALIAS = "pitlanehq-secrets"
    private const val PREFS = "pitlane-secrets"

    private fun key(): SecretKey {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (ks.getEntry(ALIAS, null) as? KeyStore.SecretKeyEntry)?.let { return it.secretKey }
        val gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        gen.init(
            KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build()
        )
        return gen.generateKey()
    }

    fun put(ctx: Context, name: String, value: String) {
        if (name.isEmpty()) return
        val c = Cipher.getInstance("AES/GCM/NoPadding")
        c.init(Cipher.ENCRYPT_MODE, key())
        val data = c.iv + c.doFinal(value.toByteArray(Charsets.UTF_8))
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString(name, Base64.encodeToString(data, Base64.NO_WRAP)).apply()
    }

    fun get(ctx: Context, name: String): String? {
        val s = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(name, null) ?: return null
        return try {
            val data = Base64.decode(s, Base64.NO_WRAP)
            val c = Cipher.getInstance("AES/GCM/NoPadding")
            c.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, data, 0, 12))
            String(c.doFinal(data, 12, data.size - 12), Charsets.UTF_8)
        } catch (e: Exception) {
            null
        }
    }

    fun remove(ctx: Context, name: String) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(name).apply()
    }
}

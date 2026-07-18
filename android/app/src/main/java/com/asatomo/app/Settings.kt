package com.asatomo.app

import android.content.Context

/**
 * 実験用の接続設定（SharedPreferences）。
 * 開発中は adb reverse tcp:5173 tcp:5173 により端末の localhost:5173 が PC の dev サーバーへ届く。
 * 認証は開発用バイパス（Authorization: Bearer <secret>:<userId>）。本番では Better Auth に置き換える。
 */
class Settings(context: Context) {
    private val prefs = context.getSharedPreferences("asatomo", Context.MODE_PRIVATE)

    var baseUrl: String
        get() = prefs.getString("baseUrl", "http://localhost:5173") ?: ""
        set(v) = prefs.edit().putString("baseUrl", v).apply()

    var devSecret: String
        get() = prefs.getString("devSecret", "") ?: ""
        set(v) = prefs.edit().putString("devSecret", v).apply()

    var userId: String
        get() = prefs.getString("userId", "seed-subject-sato") ?: ""
        set(v) = prefs.edit().putString("userId", v).apply()
}

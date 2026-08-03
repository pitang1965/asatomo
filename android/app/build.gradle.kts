import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
}

// Google の Web クライアントID（Credential Manager の serverClientId）。
// 秘密ではないがリポジトリに固定しないため local.properties から注入する。
val localProps =
    Properties().apply {
        val f = rootProject.file("local.properties")
        if (f.exists()) f.inputStream().use { load(it) }
    }

// Play 公開用アップロード署名鍵。keystore.properties は git に載せない。
// 存在すれば正式署名、無ければ debug 署名へフォールバック（他環境でも壊れない）。
val keystoreProps =
    Properties().apply {
        val f = rootProject.file("keystore.properties")
        if (f.exists()) f.inputStream().use { load(it) }
    }
val hasReleaseSigning = keystoreProps.getProperty("storeFile") != null

android {
    namespace = "com.asatomo.app"
    compileSdk {
        version = release(36) {
            minorApiLevel = 1
        }
    }

    defaultConfig {
        applicationId = "com.asatomo.app"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "1.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        buildConfigField(
            "String",
            "GOOGLE_WEB_CLIENT_ID",
            "\"${localProps.getProperty("googleWebClientId") ?: ""}\"",
        )
    }

    signingConfigs {
        if (hasReleaseSigning) {
            create("release") {
                storeFile = rootProject.file(keystoreProps.getProperty("storeFile"))
                storePassword = keystoreProps.getProperty("storePassword")
                keyAlias = keystoreProps.getProperty("keyAlias")
                keyPassword = keystoreProps.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        // サーバーURLはビルド種別で固定（グリル決定: 実行時の接続設定UIは持たない）。
        // debug は adb reverse tcp:5173 tcp:5173 で PC の Vite dev サーバーへ届く。
        debug {
            buildConfigField("String", "BASE_URL", "\"http://127.0.0.1:5173\"")
            // LINE ログイン（Custom Tab で開く Web OAuth）のオリジン。API 呼び出し（BASE_URL）は
            // adb reverse 経由で 127.0.0.1 を使うが、OAuth は BETTER_AUTH_URL と同一オリジンで
            // 完結させないと PKCE state Cookie が別オリジンに付いて失敗する。dev の BETTER_AUTH_URL
            // は localhost:5173 なのでそれに合わせる（localhost も端末では loopback→adb reverse）。
            buildConfigField("String", "AUTH_ORIGIN", "\"http://localhost:5173\"")
        }
        release {
            buildConfigField(
                "String",
                "BASE_URL",
                "\"https://asatomo.nafuda.me\"",
            )
            // 本番は BASE_URL と同一オリジン（BETTER_AUTH_URL も同じ）なので OAuth も同オリジンで完結。
            buildConfigField(
                "String",
                "AUTH_ORIGIN",
                "\"https://asatomo.nafuda.me\"",
            )
            // 署名の振り分け（ドッグフードで「Googleログインできない」を構造的に防ぐ）:
            //   - bundleRelease（Play へ上げる AAB）だけ Play アップロード鍵で署名する。
            //   - assembleRelease（端末へ直接入れる APK）はデバッグ鍵で署名する。
            // アップロード鍵は「Play へ渡す時専用」で、その SHA-1 は OAuth 未登録。この鍵で
            // 署名した APK を実機に入れると Credential Manager が "No credentials available" を
            // 返す（Google ログイン不可）。デバッグ鍵の SHA-1 は登録済みなのでログインが通る。
            // keystore.properties が無い環境では常にデバッグ署名へフォールバック（他環境でも壊れない）。
            // 注意: `./gradlew build` 等で assemble と bundle を同時実行すると APK もアップロード
            // 署名になる。実機へ入れる時は assembleRelease 単独で（install スクリプトはそうしている）。
            val isBundleTask =
                gradle.startParameter.taskNames.any { it.contains("bundle", ignoreCase = true) }
            signingConfig =
                if (hasReleaseSigning && isBundleTask) {
                    signingConfigs.getByName("release")
                } else {
                    signingConfigs.getByName("debug")
                }
            optimization {
                enable = false
            }
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
    lint {
        // Fragment 非使用（ComponentActivity + Compose のみ）のため、release の
        // lintVital が出す InvalidFragmentVersionForActivityResult は誤検知。
        disable += "InvalidFragmentVersionForActivityResult"
    }
}

dependencies {
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.work.runtime.ktx)
    implementation(libs.androidx.browser)
    implementation(libs.androidx.credentials)
    implementation(libs.androidx.credentials.play.services)
    implementation(libs.googleid)
    testImplementation(libs.junit)
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.compose.ui.test.junit4)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(libs.androidx.junit)
    debugImplementation(libs.androidx.compose.ui.test.manifest)
    debugImplementation(libs.androidx.compose.ui.tooling)
}
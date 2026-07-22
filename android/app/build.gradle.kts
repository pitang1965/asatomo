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

    buildTypes {
        // サーバーURLはビルド種別で固定（グリル決定: 実行時の接続設定UIは持たない）。
        // debug は adb reverse tcp:5173 tcp:5173 で PC の Vite dev サーバーへ届く。
        debug {
            buildConfigField("String", "BASE_URL", "\"http://127.0.0.1:5173\"")
        }
        release {
            buildConfigField(
                "String",
                "BASE_URL",
                "\"https://asatomo.nafuda.me\"",
            )
            // 自分専用段階の暫定: debug 鍵で署名して実機に入れられるようにする
            // （日常利用は本番を向く release を使う。Play 公開時に正式署名へ差し替え）。
            signingConfig = signingConfigs.getByName("debug")
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
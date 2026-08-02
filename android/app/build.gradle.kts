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
        }
        release {
            buildConfigField(
                "String",
                "BASE_URL",
                "\"https://asatomo.nafuda.me\"",
            )
            // keystore.properties があれば Play アップロード用の正式署名。
            // 無ければ debug 署名へフォールバック（実機ドッグフード用ビルドを壊さない）。
            signingConfig =
                if (hasReleaseSigning) {
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
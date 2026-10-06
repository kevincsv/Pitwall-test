plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.pitlanehq.app"
    compileSdk = 34
    defaultConfig {
        applicationId = "com.pitlanehq.app"
        minSdk = 26
        targetSdk = 34
        versionCode = 10
        versionName = "0.24.0"
    }
    // Signing: the private key from the GitHub secrets when it is set (ANDROID_KEYSTORE_B64 and
    // its passwords, see .github/workflows/android.yml), so nobody else can sign an update.
    // Without it, the old public debug key, so builds keep installing over the current app.
    signingConfigs {
        getByName("debug") {
            val ks = System.getenv("PITLANE_KEYSTORE_FILE")
            if (!ks.isNullOrEmpty() && file(ks).exists()) {
                storeFile = file(ks)
                storePassword = System.getenv("PITLANE_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("PITLANE_KEY_ALIAS")
                keyPassword = System.getenv("PITLANE_KEY_PASSWORD")
            } else {
                storeFile = file("pitlane-debug.keystore")
                storePassword = "android"
                keyAlias = "androiddebugkey"
                keyPassword = "android"
            }
        }
    }
    buildTypes {
        release { isMinifyEnabled = false }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    // the app pages are the same ones PitlaneHQ.exe serves (web/dist), bundled in assets/app
    sourceSets["main"].assets.srcDir(layout.buildDirectory.dir("generated/connect"))
}

val copyConnect by tasks.registering(Copy::class) {
    from("../../ios/PitWall/connect.html")
    from("../../web/dist") {
        include("index.html", "demo-series.json", "server.json")
        into("app")
    }
    into(layout.buildDirectory.dir("generated/connect"))
}
tasks.named("preBuild") { dependsOn(copyConnect) }

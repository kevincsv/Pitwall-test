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
        versionCode = 3
        versionName = "0.17.0"
    }
    // The same (public, debug) key on every build, so a new .apk installs over the
    // old one without uninstalling. It only proves the updates come from this build.
    signingConfigs {
        getByName("debug") {
            storeFile = file("pitlane-debug.keystore")
            storePassword = "android"
            keyAlias = "androiddebugkey"
            keyPassword = "android"
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
    // the connect screen is shared with the iPhone app
    sourceSets["main"].assets.srcDir(layout.buildDirectory.dir("generated/connect"))
}

val copyConnect by tasks.registering(Copy::class) {
    from("../../ios/PitWall/connect.html")
    into(layout.buildDirectory.dir("generated/connect"))
}
tasks.named("preBuild") { dependsOn(copyConnect) }

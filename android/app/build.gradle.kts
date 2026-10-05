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
        versionCode = 1
        versionName = "0.8.0"
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

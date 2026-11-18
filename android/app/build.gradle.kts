import java.util.Properties

plugins {
    id("com.android.application")
}

// The website this app opens. Keep in sync with assetlinks.json on the site
// (project/public/.well-known/assetlinks.json) and res/values/strings.xml.
val siteHost = "surgery-practice-app.vercel.app"

// Release signing: the key lives OUTSIDE the repository. Point to it with a
// keystore.properties file (see README.md); without it only debug builds work.
val signingProps = Properties().apply {
    val f = file(System.getenv("SURGERY_KEYSTORE_PROPS") ?: "D:/nivas software/android-signing/keystore.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}

android {
    namespace = "com.surgerypractice.app"
    compileSdk = 37

    defaultConfig {
        applicationId = "com.surgerypractice.app"
        minSdk = 24
        targetSdk = 36
        versionCode = 1
        versionName = "1.0.0"
        manifestPlaceholders["siteHost"] = siteHost
    }

    signingConfigs {
        if (signingProps.containsKey("storeFile")) {
            create("release") {
                storeFile = file(signingProps.getProperty("storeFile"))
                storePassword = signingProps.getProperty("storePassword")
                keyAlias = signingProps.getProperty("keyAlias")
                keyPassword = signingProps.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.findByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    // Google's helper for Trusted Web Activities: opens the site full-screen
    // in Chrome (with a WebView fallback when Chrome isn't installed).
    implementation("com.google.androidbrowserhelper:androidbrowserhelper:2.7.4")
}

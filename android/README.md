# Surgery Practice — Android app

A Trusted Web Activity (TWA): the app opens https://surgery-practice-app.vercel.app
full-screen in Chrome. Website updates reach the app instantly — rebuild only to
change the icon, name, colours or version.

## Build

Open this `android` folder in Android Studio, or from a terminal:

```
set JAVA_HOME=C:\Program Files\Android\Android Studio\jbr
gradlew.bat assembleRelease bundleRelease
```

- `app/build/outputs/apk/release/app-release.apk` — install directly on a phone
- `app/build/outputs/bundle/release/app-release.aab` — upload to Google Play

## Signing key — back it up

Release builds are signed with `D:/nivas software/android-signing/surgery-practice.jks`,
configured by `keystore.properties` in the same folder (kept **outside** this repository).
Back up that folder somewhere safe. Without it you can never publish an update to the
same Play Store listing. To use a different location, set the `SURGERY_KEYSTORE_PROPS`
environment variable to the path of `keystore.properties`.

## Full-screen verification

The site serves `project/public/.well-known/assetlinks.json`, which lists this app's
package name (`com.surgerypractice.app`) and the SHA-256 fingerprint of the signing key.
If it doesn't match, the app still works but shows a Chrome address bar.

**When publishing on Google Play:** Play re-signs apps with its own key. Copy the
"App signing key certificate" SHA-256 from Play Console → Setup → App signing and add it
as a second entry in `sha256_cert_fingerprints` in assetlinks.json, then redeploy the site.

## New version

Increase `versionCode` (and `versionName`) in `app/build.gradle.kts` before each Play upload.

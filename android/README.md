# Vertex Studio 1.12-demo

Android 8.0+ preview, applicationId `com.vertex.studio.preview`, versionCode 16.
Core static assets are bundled and open offline. External links need internet.

Build: JDK 21, SDK 35, build-tools 35.0.0, Gradle 8.11.1. Run `npm install`, `npm run sync:android`, `npm test`, then `gradle -p android assembleDebug`.

This preview uses a CI-generated debug certificate, not the historical release key. It installs alongside the old `com.vertex.demo` app: do not uninstall the old app. Existing app data is not migrated.

Production payments, shared accounts, OTA synchronization and AI providers remain unconnected.

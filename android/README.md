# Vertex Demo APK

Android 8.0 or later. The demo HTML, JavaScript, styles, icons and photos are bundled in `app/src/main/assets/site`; hosting is not required. External maps open in a browser and need internet. No real payments or bookings are performed.

## Build

Use JDK 21, Android SDK platform 35 / build-tools 35.0.0, and Gradle 8.11.1. Set `ANDROID_HOME` or create an untracked `local.properties` with `sdk.dir` pointing to the SDK. From this directory run:

```text
gradle assembleDebug
```

Output: `app/build/outputs/apk/debug/app-debug.apk`. This is a signed debug APK for client demonstrations, not a store release. Keep the same debug signing key when distributing updates, or uninstall the earlier demo before installing a differently signed build (which clears saved demo data).

For the bundled Windows tools, run this PowerShell command from the project root. It reuses the existing SDK, Gradle cache and demo signing key:

```powershell
$vertexRoot = (Get-Location).Path
$env:JAVA_HOME = Join-Path $vertexRoot '.android-tools/jdk/jdk-21.0.12.1+1'
$env:ANDROID_HOME = Join-Path $vertexRoot '.android-tools/sdk'
$env:ANDROID_USER_HOME = Join-Path $vertexRoot '.android-tools/android-user'
$env:GRADLE_USER_HOME = Join-Path $vertexRoot '.android-tools/gradle-cache'
& "$vertexRoot/.android-tools/gradle/gradle-8.11.1/bin/gradle.bat" -p android --offline --no-daemon assembleDebug
```

The asset snapshot has Android-specific installation messaging, disables the web service worker, and uses bundled photographs. `business.js/css` and `rentals.js/css` are shared with the website under `vertex/dist`; copy updated versions into the APK assets before rebuilding.

Version 1.1-demo adds CRM, demo messages/calls, an online map, favorites, local rental requests, a host dashboard and a monthly availability calendar. These features do not contact real guests or process payments. The old service cart remains separate from rental requests. Visual and product materials are organized in `../project-materials`.

Version 1.2-demo (code 3) adds the vivid blue/lavender design, shared SVG controls and press/transition effects. The shared design.css, design-modules.css, design-shell.js and design-interactions.js assets must stay synchronized with vertex/dist. Updated APK: ../artifacts/Vertex-Design-1.2.apk. Signing certificate matches 1.1-demo; the 1.2 build and packaged assets were verified. Physical-device installation was not tested.

Version 1.3-demo (code 5) is the current update, including the Android concierge speech bridge. Delivery path: `../artifacts/Vertex-MVP-1.3.apk` (689,800 bytes). The offline build succeeded; `aapt` confirms package `com.vertex.demo`, version code 5 and version name `1.3-demo`. `apksigner` verifies the APK and the same signing certificate as 1.2-demo. All 24 packaged site assets match the Android source snapshot by SHA-256. Physical-device installation and speech output were not tested.

APK SHA-256: `91e032dbcfdda5338979d3c40969122ccdea374e9817bfbe8540a359f31cdaa6`.

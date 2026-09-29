# היט דיינע אויגן – Android app

An unofficial, personal Android client for [hitdanoigen.com](https://hitdanoigen.com).
It runs entirely on the phone and talks straight to the website – there is no server of its own.

## Features

- **Login** with your hitdanoigen.com username and password (optionally remembered, encrypted with the Android Keystore; the 1-day site token renews itself).
- **Home** – live clean-days counter, level, statistics, leaderboard rank.
- **Big ✓ button** – update the 90-day chart / Wall of Honor (daily check-in) or report a fall.
- **Chart** – 90-day chart, Wall of Honor and your diary as native lists; your own chart settings (public/private, streak on forum, forum link, reset).
- **Chats** – the forum in a WhatsApp-style look (groups, topics, bubbles, replies with formatting, pin / subscribe / favorites) and the live chat (conversations, reactions, replies, @mentions).
- **Reminders** to update the chart (skips days already updated and Shabbos) and a **home-screen widget**.
- **Fingerprint / face lock**, **in-app updates** from this repo's releases.

## Install

Download the newest `HitDaneOigen-*.apk` from [Releases](https://github.com/yoely0966/hitdanoigen-app/releases/latest) and open it on the phone (allow "install unknown apps" once). Later versions install from inside the app: **מער → טשעק פאר אפדעיטס**.

## Build

Needs the Android SDK (build-tools 34+, platform 35) and a JDK (Android Studio's `jbr` works). No Gradle.

```bash
bash android/build.sh          # -> dist/HitDaneOigen.apk
bash release.sh 1.4.1 "notes"  # bump version, build, push, publish a GitHub release
```

The first build creates a signing key (`android/hdo-release.jks` + `android/keystore.properties`). They are git-ignored – keep a private backup, every update must be signed with the same key.

## Layout

- `android/src/org/hdo/app/` – Java: WebView host + `Native` bridge, login/token renewal, widget, reminders, lock, updater.
- `android/assets/ui/` – the app's screens (HTML/CSS/JS, Yiddish, RTL).
- `android/res/` – icons, widget layout, themes.

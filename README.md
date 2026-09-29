# היט דיינע אויגן – Android app

### [⬇️ Download the app (newest version)](https://github.com/yoely0966/hitdanoigen-app/releases/latest/download/HitDaneOigen.apk)

Open the downloaded file on your Android phone and allow "install unknown apps" once. After that the app updates itself: **מער → טשעק פאר אפדעיטס**.

---

An unofficial, personal Android client for [hitdanoigen.com](https://hitdanoigen.com).
It runs entirely on the phone and talks straight to the website – there is no server of its own.

## Features

- **Login** with your hitdanoigen.com username and password (optionally remembered, encrypted with the Android Keystore; the 1-day site token renews itself).
- **Home** – live clean-days counter, level, statistics, leaderboard rank.
- **Big ✓ button** – update the 90-day chart / Wall of Honor (daily check-in) or report a fall.
- **Chart** – 90-day chart, Wall of Honor and your diary as native lists; your own chart settings (public/private, streak on forum, forum link, reset).
- **Chats** – the forum in a WhatsApp-style look (groups, topics, bubbles, replies with formatting, pin / subscribe / favorites) and the live chat (conversations, reactions, replies, @mentions).
- **Handbook** – the site's handbook (downloaded from hitdanoigen.com on first open), shown one column at a time, remembers your place, bookmarks, go-to-page, zoom.
- **AI helpers** – quick access to the site's Motivation and Planning AI chat helpers.
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

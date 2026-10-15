<p align="center">
  🇷🇺 <b>Русский</b> | 🇬🇧 <a href="README.en.md">English</a>
</p>

<p align="center">
  <a href="https://github.com/xreamm1/patrium-browser/releases/latest"><img src="https://img.shields.io/github/v/release/xreamm1/patrium-browser?style=for-the-badge&label=release&color=0A6CFF" alt="Release"></a>
  <img src="https://img.shields.io/badge/platform-windows%2010%20%7C%2011-0078D6?style=for-the-badge" alt="Windows 10 | 11">
  <img src="https://img.shields.io/badge/engine-gecko%20160-E66000?style=for-the-badge" alt="Gecko 160">
  <img src="https://img.shields.io/badge/adblock-rust-B7410E?style=for-the-badge" alt="Rust adblock">
  <a href="LICENSE"><img src="https://img.shields.io/github/license/xreamm1/patrium-browser?style=for-the-badge&color=4CAF50" alt="License"></a>
  <a href="https://github.com/xreamm1/patrium-browser/releases"><img src="https://img.shields.io/github/downloads/xreamm1/patrium-browser/total?style=for-the-badge&color=7C4DFF" alt="Downloads"></a>
  <a href="https://github.com/xreamm1/patrium-browser/stargazers"><img src="https://img.shields.io/github/stars/xreamm1/patrium-browser?style=for-the-badge&color=E3B341" alt="Stars"></a>
</p>

<p align="center">
  <img src="docs/icon.png" width="128" alt="Patrium">
</p>

<h1 align="center">Patrium</h1>

<p align="center">
  Быстрый и приватный браузер на движке Gecko (Firefox) для Windows<br>
  со встроенным блокировщиком рекламы, VPN через Tor и обходом блокировок zapret.
</p>

<p align="center">
  <a href="https://github.com/xreamm1/patrium-browser/releases/latest"><b>⬇️ Скачать последнюю версию</b></a>
</p>

---

## Возможности

### 🛡️ Нативный блокировщик рекламы и трекеров
- Встроен прямо в браузер на Rust (движок [adblock-rust](https://github.com/brave/adblock-rust) от Brave), **не расширение**.
- Списки: EasyList, EasyPrivacy, uBlock filters (основной, privacy, badware, quick fixes), **RuAdList** для русских сайтов.
- Блокирует запросы к рекламе и трекерам и скрывает рекламные блоки на страницах.
- Счётчик заблокированного на кнопке, отключение блокировки для отдельного сайта.
- Списки обновляются автоматически раз в 4 дня, движок собирается в фоне.

### 🌐 VPN через Tor
- Кнопка рядом с «Загрузками». При первом включении скачивается Tor Expert Bundle с torproject.org (с проверкой SHA-256).
- Мосты **snowflake** (по умолчанию), obfs4, meek — работает там, где Tor заблокирован.
- Через Tor идёт только трафик браузера; DNS через Tor; WebRTC без утечек.

### ⚡ Zapret (обход DPI для YouTube, Discord и др.)
- Использует [zapret-discord-youtube от Flowseal](https://github.com/Flowseal/zapret-discord-youtube), скачивается при первом включении (с проверкой SHA-256).
- Работает как служба Windows `PatriumZapret`: права администратора нужны только при настройке службы, дальше кнопка включает и выключает её без UAC.
- Выбор стратегии (general, ALT, FAKE TLS и др.) прямо в панели кнопки.

### 🧠 Экономия памяти
- Неактивные вкладки выгружаются через 30 минут (закреплённые и играющие музыку/видео не трогаются).
- Меньше процессов, урезанные кеши. Режим «Экономия памяти» в *Настройки → Производительность*.
- Замер на 8 сайтах: **1340 МБ против 1940 МБ** с обычными настройками Firefox (−31%).

### 🔒 Приватность по умолчанию
- Без телеметрии, исследований, Pocket и спонсорского контента.
- Строгая защита от трекинга, Global Privacy Control, удаление трекинговых параметров из ссылок, DNS через HTTPS.

### 🔄 Автообновление
- Раз в сутки Patrium проверяет релизы этого репозитория и предлагает обновиться (установщик проверяется по SHA-256).

## Установка

1. Скачайте `Patrium-Setup-<версия>-ru-x64.exe` (или `-en-x64` для английского интерфейса) из [релизов](https://github.com/xreamm1/patrium-browser/releases/latest).
2. Запустите. Установщик не подписан цифровой подписью, поэтому Windows SmartScreen может предупредить: *Подробнее → Выполнить в любом случае*.

Требования: Windows 10/11 x64.

## Сборка из исходников

Patrium — это набор изменений поверх Firefox. Нужны Windows 10/11, [MozillaBuild](https://wiki.mozilla.org/MozillaBuild), ~60 ГБ диска, 16 ГБ ОЗУ.

```powershell
git clone https://github.com/xreamm1/patrium-browser
git clone https://github.com/mozilla-firefox/firefox patrium-browser\src
cd patrium-browser\src
git checkout 5c124bc00a6d475d4ea42297cb60de9bf5884844
git apply ..\patches\patrium-tracked.patch
xcopy /E /Y ..\overlay\* .
cd ..
powershell -ExecutionPolicy Bypass -File tools\apply-branding.ps1
powershell -ExecutionPolicy Bypass -File tools\mach.ps1 bootstrap --application-choice browser
powershell -ExecutionPolicy Bypass -File tools\mach.ps1 vendor rust --ignore-modified
powershell -ExecutionPolicy Bypass -File tools\mach.ps1 build
powershell -ExecutionPolicy Bypass -File tools\mach.ps1 package
```

Русская версия: склонируйте папку `ru` из [mozilla-l10n/firefox-l10n](https://github.com/mozilla-l10n/firefox-l10n) в `l10n\`, скопируйте туда `l10n\ru\browser\browser\patrium.ftl` из этого репозитория и выполните `tools\mach.ps1 build installers-ru`.

Финальная оптимизированная сборка (PGO + ThinLTO): в оболочке MozillaBuild `MOZCONFIG=mozconfig.release ./mach build`.

Примечание: `tools\mach.ps1` и `tools\apply-branding.ps1` ожидают проект в `C:\patrium` — поправьте пути, если клонируете в другое место.

## Структура репозитория

| Путь | Содержимое |
|---|---|
| `patches/patrium-tracked.patch` | Изменения в существующих файлах Firefox |
| `overlay/` | Новые файлы Patrium (компоненты, Rust-движок, строки, mozconfig) |
| `branding-src/privacy-prefs.js` | Настройки Patrium по умолчанию |
| `l10n/ru/` | Русский перевод интерфейса Patrium |
| `tools/` | Брендинг, иконки, запуск mach, автотесты через Marionette |

## Лицензия

[Mozilla Public License 2.0](LICENSE), как и у Firefox. Сторонние компоненты — в [NOTICE.md](NOTICE.md).

Patrium не связан с Mozilla Foundation. Firefox — товарный знак Mozilla Foundation.

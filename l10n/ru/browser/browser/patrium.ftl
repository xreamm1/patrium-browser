# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

## Patrium: zapret toolbar button and panel

patrium-zapret-button =
    .label = Zapret
    .tooltiptext = Zapret (обход DPI)
patrium-zapret-panel-header =
    .title = Zapret
patrium-zapret-status-missing = Не установлен
patrium-zapret-status-installing = Загрузка…
patrium-zapret-status-off = Выключен
patrium-zapret-status-starting = Запуск…
patrium-zapret-status-on = Включён
patrium-zapret-status-stopping = Остановка…
patrium-zapret-status-error = Ошибка
patrium-zapret-status-external = Работает другой zapret
patrium-zapret-install-button =
    .label = Скачать zapret
patrium-zapret-turn-on-button =
    .label = Включить
patrium-zapret-turn-off-button =
    .label = Выключить
patrium-zapret-update-button =
    .label = Проверить обновления
patrium-zapret-strategy-label = Стратегия
patrium-zapret-version = Версия { $version }
patrium-zapret-admin-note = Zapret работает как служба Windows PatriumZapret для всей системы. Права администратора запрашиваются только при настройке службы или смене стратегии.
patrium-zapret-install-confirm-title = Скачать zapret?
patrium-zapret-install-confirm-text = Patrium скачает последний релиз zapret-discord-youtube от Flowseal с GitHub (около 1,5 МБ) и проверит его контрольную сумму. Zapret использует драйвер WinDivert, на который реагируют некоторые антивирусы.

## Patrium: Tor toolbar button and panel

patrium-tor-button =
    .label = VPN
    .tooltiptext = VPN (Tor)
patrium-tor-panel-header =
    .title = VPN (Tor)
patrium-tor-status-missing = Не установлен
patrium-tor-status-installing = Загрузка…
patrium-tor-status-off = Отключён
patrium-tor-status-starting = Подключение… { $progress }%
patrium-tor-status-on = Подключён
patrium-tor-status-error = Ошибка
patrium-tor-install-button =
    .label = Скачать Tor
patrium-tor-turn-on-button =
    .label = Подключиться
patrium-tor-turn-off-button =
    .label = Отключиться
patrium-tor-bridges-label = Мосты
patrium-tor-bridges-snowflake =
    .label = Snowflake
patrium-tor-bridges-obfs4 =
    .label = obfs4
patrium-tor-bridges-meek =
    .label = meek
patrium-tor-bridges-none =
    .label = Без мостов
patrium-tor-version = Tor Expert Bundle { $version }
patrium-tor-note = Через Tor идёт только трафик Patrium. Мосты помогают там, где Tor заблокирован.
patrium-tor-install-confirm-title = Скачать Tor?
patrium-tor-install-confirm-text = Patrium скачает Tor Expert Bundle с torproject.org (около 20 МБ) и проверит его контрольную сумму.

## Patrium: native content blocker

patrium-adblock-button =
    .label = Блокировщик
    .tooltiptext = Блокировщик рекламы и трекеров
patrium-adblock-panel-header =
    .title = Блокировщик рекламы и трекеров
patrium-adblock-blocked-count =
    { $count ->
        [one] На этой странице заблокирован { $count } запрос
        [few] На этой странице заблокировано { $count } запроса
       *[many] На этой странице заблокировано { $count } запросов
    }
patrium-adblock-site-enabled =
    .label = Блокировать на этом сайте
patrium-adblock-update-button =
    .label = Обновить списки фильтров
patrium-adblock-lists-updated = Списки фильтров обновлены { DATETIME($date, dateStyle: "short", timeStyle: "short") }
patrium-adblock-lists-never = Списки фильтров ещё не загружены

## Patrium: memory settings in about:preferences

patrium-memory-tab-unload =
    .label = Выгружать неактивные вкладки для экономии памяти
    .description = Вкладки, которыми вы давно не пользовались, выгружаются и загружаются снова при возврате, а введённый текст сохраняется. Закреплённые вкладки, вкладки с музыкой или видео и активные звонки остаются загруженными.
patrium-memory-saver =
    .label = Режим экономии памяти
    .description = Сайты делят общие процессы вместо изоляции каждого сайта. Памяти расходуется заметно меньше, но ослабевает защита от атак типа Spectre. Вступает в силу после перезапуска.

## Patrium: Tor and zapret running together

patrium-conflict-title = Включить Tor и zapret одновременно?
patrium-conflict-tor-text = Zapret включён. Он меняет сетевые пакеты во всей системе и может мешать подключению Tor к мостам. Пока включён Tor, трафику Patrium zapret не нужен.
patrium-conflict-zapret-text = Tor включён. Zapret меняет сетевые пакеты во всей системе и может мешать подключению Tor к мостам.

## Patrium: browser updates

patrium-update-available = Доступна новая версия Patrium { $version }.
patrium-update-install = Обновить
patrium-update-whats-new = Что нового
patrium-update-later = Позже
patrium-update-skip = Пропустить эту версию
patrium-update-downloading = Загрузка обновления Patrium…
patrium-update-failed = Не удалось скачать обновление: { $error }
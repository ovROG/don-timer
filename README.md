# Chronation

Таймер для донатонов. Стример входит через DonationAlerts, создаёт таймеры и добавляет страницу таймера в OBS как источник «Браузер». Каждый донат добавляет к таймеру время по заданному курсу (например, 1 минута за 100 ₽).

## Возможности

- Вход через DonationAlerts OAuth.
- Несколько таймеров на пользователя, свой формат времени (dayjs) и свой CSS для каждого.
- Донаты автоматически конвертируются в рубли и добавляют время во все таймеры, где они включены.
- Ограничения: максимум оставшегося времени или максимум общего времени таймера.
- Панель управления для OBS (`/panel`): пауза, запуск, добавление и вычитание времени.
- Журнал действий и статус подключения к DonationAlerts.
- Админ-панель: пользователи, таймеры, переподключение к DonationAlerts.

## Стек

Remix v2 (Vite), Mantine v8, Drizzle ORM + SQLite (libsql), Redis, Express.

## Локальная разработка

Нужны Node.js 20+ и Redis на `localhost:6379`.

1. Установите зависимости:

   ```sh
   npm install
   ```

2. Задайте переменные окружения (см. `.env.example`). Приложение само не читает `.env`, поэтому экспортируйте их в оболочке:

   | Переменная                         | Назначение                                                                                                                    |
   | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
   | `COOKIES_SALT`                     | секрет для подписи cookie сессии                                                                                              |
   | `DA_CLIENT_ID`, `DA_CLIENT_SECRET` | данные приложения в DonationAlerts                                                                                            |
   | `DA_REDIRECT`                      | адрес возврата OAuth, например `http://localhost:5173/auth/callback`                                                          |
   | `AES_KEY`                          | ключ шифрования ссылок для OBS (используются первые 32 байта). **Если его поменять, все выданные ссылки перестанут работать** |
   | `DONATION_LINK`                    | ссылка на донат автору, показывается в интерфейсе                                                                             |

3. Создайте базу данных и запустите сервер:

   ```sh
   npx drizzle-kit migrate
   npm run dev
   ```

Другие команды:

```sh
npm run build       # сборка в build/server и build/client
npm start           # запуск собранного приложения (server.js)
npm run lint        # eslint
npm run typecheck   # проверка типов
npx drizzle-kit generate --name <имя>   # новая миграция после изменения db/schema.server.ts
```

## Установка на VPS

Скрипт `deploy/setup.sh` рассчитан на Ubuntu/Debian и не мешает другим сайтам на сервере: он не создаёт пользователей, не трогает чужие сайты nginx, не перенастраивает уже установленный Redis и не обновляет уже установленный Node.js.

```sh
git clone https://github.com/<you>/don-timer.git /tmp/don-timer
sudo DOMAIN=timer.example.com \
     REPO_URL=https://github.com/<you>/don-timer.git \
     LETSENCRYPT_EMAIL=you@example.com \
     /tmp/don-timer/deploy/setup.sh
```

Скрипт:

- устанавливает недостающие пакеты (Node.js 22, Redis, nginx);
- клонирует репозиторий в `/opt/chronation` и создаёт `/opt/chronation/.env` со случайными секретами;
- ставит systemd-сервис `chronation` и сайт nginx для `DOMAIN`;
- при указанном `LETSENCRYPT_EMAIL` получает HTTPS-сертификат через certbot;
- собирает и запускает приложение.

Необязательные переменные: `APP_USER` (по умолчанию пользователь, запустивший `sudo`), `APP_DIR`, `APP_PORT` (по умолчанию `3000`), `BRANCH`, `DA_CLIENT_ID`, `DA_CLIENT_SECRET`, `DONATION_LINK`.

Если `DA_CLIENT_ID` и `DA_CLIENT_SECRET` не были переданы, впишите их в `/opt/chronation/.env` и перезапустите сервис:

```sh
sudo systemctl restart chronation
```

В настройках приложения DonationAlerts укажите redirect URI `https://<DOMAIN>/auth/callback`.

### Обновление

```sh
sudo /opt/chronation/deploy.sh
```

Скрипт делает `git pull`, `npm ci`, сборку, миграции базы и перезапуск сервиса.

### Логи и состояние

```sh
systemctl status chronation
journalctl -u chronation -f
```

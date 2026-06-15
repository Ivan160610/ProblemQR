# Pro-Max Sync Server

Локальный сервер для синхронизации данных между телефоном и ПК.

Основные возможности:
- GET/POST `/api/db` — чтение/запись данных (JSON { data: [...] })
- SSE `/events` — уведомления об обновлениях (событие `dbUpdated`)
- Бэкапы сохраняются в папку `backups/`
- Логи в `logs/server.log`

Запуск локально:
1. Убедитесь, что у вас установлен Node.js (>=18).
2. Установите зависимости:
```powershell
cd "C:\Users\NastavnikiSklad\Desktop\Сайт"
npm install
```
3. Запустите сервер:
```powershell
npm start
```
4. Проверка кода и форматирования:
```powershell
npm run lint
npm run format
```

Docker:
```bash
docker build -t pro-max .
docker run -p 3000:3000 -e API_KEY=your_api_key pro-max
```
или с docker-compose:
```bash
docker-compose up --build -d
```

Публичный доступ (быстро):
- Установите `ngrok` и выполните `ngrok http 3000` — в выводе получите публичный HTTPS URL, используйте `https://.../api` на телефоне.

Безопасность:
- Рекомендуется задать `API_KEY` в окружении или в `docker-compose.yml` и ввести тот же ключ в настройках приложения на телефоне (поле `API ключ`). Сервер потребует заголовок `X-API-KEY` для доступа к API.

SQLite migration:
- Если `better-sqlite3` установлен, сервер автоматически создаст `data.db` и перенесёт записи из `remote-data.json` в таблицу `items` при первом запуске (если таблица пустая).
- После миграции сервер использует SQLite как основное хранилище; `remote-data.json` остаётся как резервная копия.


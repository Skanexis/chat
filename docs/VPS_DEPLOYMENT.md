# VPS Deployment Runbook

Полный процесс для первого прод-выклада проекта `phantom-lab-chat` на новый VPS (Ubuntu 24.04 LTS).

## 0) Что должно быть заранее

- Домен, который указывает на IP VPS (например, `chat.example.com`).
- SSH-доступ на VPS под `root` (временно, для первичной настройки).
- Docker Hub не обязателен: проект собирается прямо на VPS.

## 1) Подключить Git и отправить проект

Если в папке проекта еще нет `.git`:

```bash
cd /path/to/phantom-lab-chat
git init
git branch -M main
git add .
git commit -m "Initial project import"
```

Создайте репозиторий на GitHub/GitLab (например, `git@github.com:YOUR_USER/phantom-lab-chat.git`) и привяжите remote:

```bash
git remote add origin git@github.com:YOUR_USER/phantom-lab-chat.git
git push -u origin main
```

Если push не проходит по SSH, создайте ключ на локальной машине:

```bash
ssh-keygen -t ed25519 -C "you@example.com"
cat ~/.ssh/id_ed25519.pub
```

Добавьте публичный ключ в GitHub/GitLab и проверьте:

```bash
ssh -T git@github.com
```

## 2) Базовая подготовка VPS

Подключитесь на сервер:

```bash
ssh root@YOUR_SERVER_IP
```

Обновите систему и установите базовые утилиты:

```bash
apt update && apt upgrade -y
apt install -y ca-certificates curl gnupg ufw fail2ban git nginx certbot python3-certbot-nginx
```

Создайте отдельного пользователя для деплоя:

```bash
adduser deploy
usermod -aG sudo deploy
```

Скопируйте ваш SSH-ключ root -> deploy:

```bash
rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy
```

Ограничьте порты файрволом:

```bash
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
```

Включите fail2ban:

```bash
systemctl enable fail2ban --now
```

## 3) Установить Docker + Compose plugin

Выполните на VPS:

```bash
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  tee /etc/apt/sources.list.d/docker.list > /dev/null

apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

Добавьте пользователя `deploy` в группу docker:

```bash
usermod -aG docker deploy
```

Перелогиньтесь:

```bash
exit
ssh deploy@YOUR_SERVER_IP
```

Проверьте:

```bash
docker --version
docker compose version
```

## 4) Клонировать проект на VPS

На сервере под `deploy`:

```bash
ssh-keygen -t ed25519 -C "deploy@vps"
cat ~/.ssh/id_ed25519.pub
```

Добавьте этот ключ в GitHub/GitLab как Deploy Key (read-only) или как ключ пользователя.

Дальше:

```bash
sudo mkdir -p /opt/phantom-lab-chat
sudo chown -R deploy:deploy /opt/phantom-lab-chat
git clone git@github.com:Skanexis/chat.git /opt/phantom-lab-chat
cd /opt/phantom-lab-chat
```

## 5) Подготовить env-файлы прода

Скопируйте шаблоны:

```bash
cp deploy/env/postgres.env.example deploy/env/postgres.env
cp deploy/env/redis.env.example deploy/env/redis.env
cp deploy/env/api.env.example deploy/env/api.env
cp deploy/env/web.env.example deploy/env/web.env
```

Отредактируйте значения:

```bash
nano deploy/env/postgres.env
nano deploy/env/api.env
nano deploy/env/web.env
```

Минимум, что обязательно поменять:

- `deploy/env/postgres.env`
  - `POSTGRES_PASSWORD`
- `deploy/env/api.env`
  - `DATABASE_URL` (должен совпадать с логином/паролем Postgres)
  - `JWT_SECRET` (строка 32+ символа)
  - `TELEGRAM_BOT_TOKEN` (реальный токен бота)
  - `API_CORS_ORIGINS` и `WS_CORS_ORIGINS` (ваш домен)
- `deploy/env/web.env`
  - `NEXT_PUBLIC_API_BASE_URL=https://chat.example.com/v1`

## 6) Первый запуск контейнеров

```bash
chmod +x deploy/scripts/deploy.sh
./deploy/scripts/deploy.sh
```

Проверка:

```bash
docker compose -f deploy/docker-compose.prod.yml ps
docker compose -f deploy/docker-compose.prod.yml logs -f api
```

## 7) Настроить Nginx reverse proxy

Скопируйте и отредактируйте конфиг:

```bash
sudo cp deploy/nginx/phantom-lab.conf /etc/nginx/sites-available/phantom-lab
sudo nano /etc/nginx/sites-available/phantom-lab
```

Замените `chat.example.com` на ваш домен, затем включите сайт:

```bash
sudo ln -s /etc/nginx/sites-available/phantom-lab /etc/nginx/sites-enabled/phantom-lab
sudo nginx -t
sudo systemctl reload nginx
```

## 8) Выпустить SSL-сертификат

```bash
sudo certbot --nginx -d chat.example.com
```

Проверьте автопродление:

```bash
systemctl status certbot.timer
sudo certbot renew --dry-run
```

После выпуска сертификата перезагрузите Nginx:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

## 9) Smoke-проверка после выклада

На сервере:

```bash
curl -I https://chat.ristoranti-d-italia.com
curl -sS https://chat.ristoranti-d-italia.com/v1/health
```

Должно вернуться `200 OK` и JSON c `health`.

## 10) Включить watchdog для зависших контейнеров

Docker `restart: unless-stopped` перезапускает контейнер, если процесс завершился, но не лечит случай,
когда контейнер продолжает работать и становится `unhealthy`. Для прод-сервера включите systemd timer,
который проверяет `api` и `web` раз в минуту и перезапускает их при плохом состоянии.

На сервере:

```bash
cd /opt/phantom-lab-chat
chmod +x deploy/scripts/health-watchdog.sh
sudo cp deploy/systemd/phantom-lab-health-watchdog.service /etc/systemd/system/
sudo cp deploy/systemd/phantom-lab-health-watchdog.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now phantom-lab-health-watchdog.timer
```

Проверка:

```bash
systemctl list-timers phantom-lab-health-watchdog.timer
sudo systemctl status phantom-lab-health-watchdog.timer
sudo journalctl -u phantom-lab-health-watchdog.service -n 50 --no-pager
```

Ручной запуск проверки:

```bash
sudo systemctl start phantom-lab-health-watchdog.service
```

## 11) Быстрая диагностика инцидента

Если ночью снова будет `Network error`, сначала снимите состояние и события до ручного рестарта:

```bash
cd /opt/phantom-lab-chat
docker compose -f deploy/docker-compose.prod.yml ps
docker compose -f deploy/docker-compose.prod.yml logs --since 24h --tail 500 api web postgres redis
docker compose -f deploy/docker-compose.prod.yml events --since 24h
docker inspect -f '{{.Name}} restart={{.RestartCount}} oom={{.State.OOMKilled}} status={{.State.Status}} health={{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}} started={{.State.StartedAt}} finished={{.State.FinishedAt}}' \
  $(docker compose -f deploy/docker-compose.prod.yml ps -q api web postgres redis)
sudo journalctl -u docker --since "24 hours ago" --no-pager
sudo journalctl -u nginx --since "24 hours ago" --no-pager
```

После этого можно перезапустить web/API:

```bash
docker compose -f deploy/docker-compose.prod.yml restart api web
docker compose -f deploy/docker-compose.prod.yml ps
curl -fsS https://chat.ristoranti-d-italia.com/v1/health
```

## 12) Релиз обновлений

Каждый следующий релиз:

```bash
cd /opt/phantom-lab-chat
git pull --ff-only origin main
./deploy/scripts/deploy.sh
```

`deploy.sh` делает:

- pull базовых образов (`postgres`, `redis`)
- rebuild `api` и `web`
- `up -d --remove-orphans`
- Prisma миграции автоматически в `api` контейнере при старте

## 13) Быстрый откат

Откат к предыдущему коммиту:

```bash
cd /opt/phantom-lab-chat
git log --oneline -n 5
git checkout <OLD_COMMIT_SHA>
./deploy/scripts/deploy.sh
```

Когда нужно вернуться на `main`:

```bash
git checkout main
git pull --ff-only origin main
./deploy/scripts/deploy.sh
```

## 14) Бэкап и восстановление PostgreSQL

Бэкап:

```bash
cd /opt/phantom-lab-chat
mkdir -p backups
docker compose -f deploy/docker-compose.prod.yml exec -T postgres \
  pg_dump -U phantom -d phantom_lab_chat > backups/phantom_lab_chat_$(date +%F_%H-%M).sql
```

Восстановление:

```bash
cat backups/your_backup.sql | docker compose -f deploy/docker-compose.prod.yml exec -T postgres \
  psql -U phantom -d phantom_lab_chat
```

## 15) Что важно по безопасности

- Не храните реальные `.env` в Git.
- `JWT_SECRET` и `POSTGRES_PASSWORD` должны быть длинными случайными строками.
- Держите открытыми только `22`, `80`, `443`.
- Регулярно применяйте обновления безопасности:

```bash
sudo apt update && sudo apt upgrade -y
```

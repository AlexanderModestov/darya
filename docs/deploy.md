# LeadOS — Deploy Guide

Backend: Railway (GitHub auto-deploy)
Frontend: Vercel (GitHub auto-deploy)

---

## 1. Push repo to GitHub

```bash
git remote add origin https://github.com/YOUR_USER/Daria.git
git push -u origin main
```

---

## 2. Backend — Railway

1. Открыть https://railway.app → **New Project** → **Deploy from GitHub Repo**
2. Выбрать репо `Daria`, установить **Root Directory**: `/backend`
3. Добавить PostgreSQL: **+ New → Database → PostgreSQL**
   - `DATABASE_URL` пробросится автоматически
4. Перейти в **Variables**, добавить:

   | Variable | Value |
   |---|---|
   | `JWT_SECRET` | `openssl rand -hex 32` |
   | `JWT_EXPIRES_IN` | `7d` |
   | `RESEND_API_KEY` | твой ключ Resend |
   | `EMAIL_FROM` | `sales@yourdomain.com` |
   | `NODE_ENV` | `production` |
   | `CORS_ORIGINS` | `https://your-app.vercel.app` |

5. **Settings → Networking → Generate Domain** — получить URL бэкенда

Миграции запускаются автоматически при старте (Dockerfile: `node src/migrate.js && node src/app.js`).

---

## 3. Frontend — Vercel

1. Открыть https://vercel.com → **Add New Project** → **Import Git Repository**
2. Выбрать репо `Daria`
3. Настройки:
   - **Root Directory**: `frontend`
   - **Framework Preset**: Other
   - **Build Command**: оставить пустым
   - **Output Directory**: `.`
4. Нажать **Deploy**

`vercel.json` уже в `frontend/` — маршрутизация настроена.

---

## 4. Связать frontend и backend

1. Скопировать Railway domain (например `https://daria-production.up.railway.app`)
2. Открыть свой сайт в браузере (Vercel URL) → внутри LeadOS перейти в **Einstellungen** → в поле **Backend URL** вставить Railway URL → нажать **Testen**
3. В Railway dashboard → Variables → обновить `CORS_ORIGINS` на URL Vercel-приложения (например `https://daria.vercel.app`)

---

## Последующие деплои

Просто push в `main` — оба сервиса передеплоятся автоматически.

```bash
git push origin main
```

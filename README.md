# TutorSurvey Bot

Xususiy maktablar va o'quv markazlari uchun **Telegram bot + veb admin panel**: tutorlar va o'qituvchilardan so'rovnomalar, hisobotlar va KPI ma'lumotlarini yig'ish, tahlil qilish va boshqarish tizimi.

| Qism | Texnologiya |
|---|---|
| Backend / API | Node.js 20, TypeScript, Express 5, Prisma 7, PostgreSQL 16, Zod, JWT, Pino |
| Telegram bot | Telegraf 4 (polling yoki webhook) |
| Admin panel | Next.js 15 (App Router), React 19, Tailwind CSS 4, shadcn/ui, Recharts, TanStack Query |
| Infratuzilma | Docker, Railway / Render (API), Vercel (web) |

Asosiy til — **O'zbek** (RU/EN keyinroq qo'shish uchun matnlar `apps/web/src/lib/labels.ts` va `apps/api/src/bot/flows/*.ts` ichida markazlashtirilgan).

---

## 1. Imkoniyatlar

### Telegram bot
- `/start` — salomlashuv, telefon raqami orqali ro'yxatdan o'tish / mavjud profilga ulash, asosiy menyu:
  `📋 So'rovnomalar · 📝 Hisobot topshirish · 📢 E'lonlar · 📊 Mening natijalarim · 👤 Profil · ❓ Yordam`
- Buyruqlar: `/start /menu /surveys /reports /profile /help`; adminlar uchun `/admin /users /surveys /reports /analytics /pending`
- So'rovnoma oqimi: matn, uzun matn, bitta / ko'p tanlov, reyting 1–5, ha/yo'q, raqam; progress ko'rsatkichi, orqaga qaytish, bekor qilish, anonim rejim
- Hisobot topshirish: kunlik / haftalik / oylik / muammo / o'quvchi fikri / dars hisoboti; ko'rib chiqish holati bot orqali xabar qilinadi
- Bildirishnomalar: yangi so'rovnoma, muddat eslatmasi, yakunlanganlik, e'lon, vazifa, hisobot muddati, admin xabari; yetkazilmagan xabarlar navbatga tushadi va qayta yuboriladi
- Deep link: `https://t.me/<bot>?start=survey_<id>`

### Admin panel (`/dashboard`)
Dashboard · Foydalanuvchilar · Tutorlar · O'qituvchilar · So'rovnomalar (yaratish / tahrirlash / nusxalash / rejalashtirish / yuborish / natijalar / CSV-XLSX-PDF eksport) · Savollar banki · Analitika · Hisobotlar (ko'rib chiqish oqimi) · Filiallar (+ bo'limlar, guruhlar, filial analitikasi) · E'lonlar · Vazifalar · KPI (metrikalar, leaderboard, avtomatik hisoblash) · Bildirishnomalar · Audit jurnali · Sozlamalar · Profil.
Mobil-first, light/dark rejim, rolga qarab menyu va amallar cheklanadi.

### Rollar (RBAC)
| Rol | Kalit | Qisqacha |
|---|---|---|
| Super Admin | `SUPER_ADMIN` | Barcha huquqlar |
| Direktor | `DIRECTOR` | O'z filiali doirasida to'liq boshqaruv |
| CEO | `CEO` | Barcha filiallar analitikasi, biznes ko'rsatkichlar, faqat ko'rish |
| HR / Admin | `HR_ADMIN` | Foydalanuvchilar, so'rovnoma yuborish (faqat tutor/teacher), natijalar |
| Tutor | `TUTOR` | Bot orqali so'rovnoma va hisobot topshiradi |
| O'qituvchi | `TEACHER` | Bot orqali so'rovnoma va hisobot topshiradi |

Ruxsatlar `permissions` jadvalida (`surveys.create`, `reports.review`, `kpi.manage`, …) va `role_permissions` orqali biriktiriladi; API `requirePermission()` middleware bilan himoyalangan.

### Xavfsizlik
JWT (access + refresh, httpOnly cookie yoki Bearer), bcrypt, Telegram ID tekshiruvi, rate limiting, Zod validatsiya, Helmet, CORS ro'yxati, audit log (kim, nima, qachon, IP), webhook secret token.

---

## 2. Loyihaning tuzilishi

```
.
├── apps/
│   ├── api/                         # Backend + Telegram bot
│   │   ├── prisma/
│   │   │   ├── schema.prisma        # 20+ jadval (users, roles, permissions, branches, departments,
│   │   │   │                        #  surveys, survey_questions/options/assignments/responses/answers,
│   │   │   │                        #  reports, notifications, announcements, tasks, kpi_metrics,
│   │   │   │                        #  kpi_results, audit_logs, settings, …)
│   │   │   ├── migrations/          # SQL migratsiyalar
│   │   │   └── seed.ts              # Demo ma'lumotlar (3 filial, 6 rol, ~40 foydalanuvchi, so'rovnomalar,
│   │   │                            #  javoblar, hisobotlar, KPI, e'lonlar)
│   │   ├── scripts/
│   │   │   ├── set-webhook.ts       # Telegram webhook o'rnatish / o'chirish / ma'lumot
│   │   │   ├── migrate.ts           # Offline muhit uchun migratsiya (wasm engine)
│   │   │   └── bot-simulate.ts      # Botni Telegram'siz sinash (oqimlar simulyatsiyasi)
│   │   ├── src/
│   │   │   ├── app.ts / server.ts   # Express app, graceful shutdown
│   │   │   ├── config/env.ts        # Zod bilan tekshiriladigan muhit o'zgaruvchilari
│   │   │   ├── middleware/          # auth, rbac, rate-limit, validate, error-handler, audit
│   │   │   ├── modules/             # auth, users, branches, surveys, reports, analytics, kpi,
│   │   │   │                        #  announcements, tasks, notifications, settings, audit, dashboard
│   │   │   ├── bot/                 # Telegraf: flows/ (register, survey, report, admin, misc), keyboards/
│   │   │   ├── jobs/scheduler.ts    # node-cron: rejalashtirilgan so'rovnomalar, muddat eslatmalari,
│   │   │   │                        #  hisobot eslatmasi 18:00, vazifalar 09:00, KPI (yakshanba 23:30)
│   │   │   └── docs/openapi.ts      # Swagger UI → /api/docs
│   │   ├── assets/fonts/            # PDF eksport uchun DejaVu (kirill/lotin)
│   │   ├── Dockerfile
│   │   └── .env.example
│   └── web/                         # Next.js admin panel
│       ├── src/app/                 # login, (dashboard)/… sahifalar
│       ├── src/components/          # ui/ (shadcn), layout/, shared/, charts/, users/, surveys/, branches/
│       ├── src/lib/                 # api.ts (fetch wrapper), auth.tsx, types.ts, labels.ts, queries.ts
│       ├── next.config.ts           # /api/* → backend proxy (rewrites)
│       ├── vercel.json
│       └── .env.example
├── docker-compose.yml               # db + api + web lokal to'liq stack
├── railway.json  /  render.yaml     # API deploy konfiguratsiyasi
└── package.json                     # npm workspaces
```

---

## 3. Tez boshlash (lokal)

**Talablar:** Node.js ≥ 20, PostgreSQL 14+ (yoki Docker), Telegram bot tokeni ([@BotFather](https://t.me/BotFather)).

```bash
git clone <repo> && cd Tutorlar_so-rovnomasi
npm install

# 1) Muhit o'zgaruvchilari
cp apps/api/.env.example apps/api/.env      # DATABASE_URL, JWT_*, TELEGRAM_BOT_TOKEN ni to'ldiring
cp apps/web/.env.example apps/web/.env.local

# 2) Ma'lumotlar bazasi
npm run db:generate          # Prisma client
npm run db:migrate           # migratsiyalar (dev)   |  prod: npm run db:deploy
npm run db:seed              # demo ma'lumotlar

# 3) Ishga tushirish (API :4000 + Web :3000, bot polling rejimida)
npm run dev
```

Yoki Docker bilan: `docker compose up --build` (`apps/api/.env` bo'lishi shart).

Ochish: **http://localhost:3000** · API hujjatlari: **http://localhost:4000/api/docs** · Health: `GET /health`.

### Demo hisoblar (seed)
| Rol | Login | Parol |
|---|---|---|
| Super Admin | `admin@tutorsurvey.uz` | `Admin123!` |
| Direktor (Chilonzor) | `director@tutorsurvey.uz` | `Director123!` |
| Direktor (Yunusobod / Samarqand) | `director.yun@…` / `director.sam@…` | `Director123!` |
| CEO | `ceo@tutorsurvey.uz` | `Ceo123!` |
| HR / Admin | `hr@tutorsurvey.uz` | `Hr123!` |
| Tutor | `tutor@tutorsurvey.uz` | `Tutor123!` |
| O'qituvchi | `teacher@tutorsurvey.uz` | `Teacher123!` |

Tutor va o'qituvchilar odatda faqat bot orqali ishlaydi. Telegram akkauntini tizimga ulashning 3 xavfsiz yo'li: **(a)** admin panelda (`Foydalanuvchi → Telegram kodi`) olingan bir martalik kod → botda `/link 123456`; **(b)** `/start` → telefon raqamini ulashish → HR oldindan kiritgan raqam bo'yicha avtomatik ulanish; **(c)** o'zi ro'yxatdan o'tish → `Kutilmoqda` holati → HR/Admin tasdiqlaydi.

> Ishlab chiqarishda seed'dagi parollarni albatta almashtiring (`Profil → Parolni o'zgartirish`).

---

## 4. Muhit o'zgaruvchilari

`apps/api/.env`
| O'zgaruvchi | Tavsif |
|---|---|
| `DATABASE_URL` | PostgreSQL ulanish satri |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | `openssl rand -base64 48` |
| `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL` | default `15m`, `30d` |
| `TELEGRAM_BOT_TOKEN` | BotFather tokeni (**hech qachon commit qilmang**) |
| `TELEGRAM_MODE` | `polling` (dev) yoki `webhook` (prod) |
| `TELEGRAM_WEBHOOK_SECRET` | webhook so'rovlarini tekshirish uchun tasodifiy satr |
| `TELEGRAM_SUPER_ADMIN_IDS` | birinchi `/start`da avtomatik Super Admin bo'ladigan Telegram ID'lar |
| `API_PUBLIC_URL`, `WEB_PUBLIC_URL` | ommaviy URL'lar (webhook va bot xabarlaridagi havolalar) |
| `CORS_ORIGINS` | vergul bilan ajratilgan ruxsat etilgan originlar |
| `TZ` | `Asia/Tashkent` |
| `DISABLE_BOT`, `DISABLE_CRON` | `true` → botsiz / cronsiz ishlash |

`apps/web/.env.local`
| O'zgaruvchi | Tavsif |
|---|---|
| `API_INTERNAL_URL` | Next.js serveri `/api/*` so'rovlarini shu manzilga proksilaydi |
| `NEXT_PUBLIC_API_URL` | (ixtiyoriy) brauzer to'g'ridan-to'g'ri API'ga murojaat qilsin desangiz |

---

## 5. Deploy

### Backend → Railway
1. Yangi loyiha → **Deploy from GitHub repo**; Railway `railway.json` orqali `apps/api/Dockerfile` ni ishlatadi.
2. **PostgreSQL** plagini qo'shing → `DATABASE_URL` avtomatik.
3. Variables: `.env.example` dagi barcha kalitlar; `TELEGRAM_MODE=webhook`, `API_PUBLIC_URL=https://<app>.up.railway.app`, `WEB_PUBLIC_URL=https://<web>.vercel.app`, `CORS_ORIGINS=https://<web>.vercel.app`.
4. Start buyrug'i migratsiyalarni o'zi bajaradi (`prisma migrate deploy`). Demo ma'lumot kerak bo'lsa bir marta: `npm run db:seed -w apps/api`.
5. Webhook: bot ishga tushganda o'zi ro'yxatdan o'tadi; qo'lda tekshirish — `npm run bot:webhook -w apps/api -- --info`.

### Backend → Render
`render.yaml` (Blueprint) → **New → Blueprint** → repo tanlang; `TELEGRAM_BOT_TOKEN`, `API_PUBLIC_URL`, `WEB_PUBLIC_URL`, `CORS_ORIGINS` ni kiriting. PostgreSQL avtomatik yaratiladi.

### Frontend → Vercel
1. **Import project** → Root Directory: `apps/web` (`vercel.json` install buyrug'ini workspace'ga moslaydi).
2. Environment: `API_INTERNAL_URL=https://<api-domen>` (rewrites shu orqali ishlaydi, CORS talab qilinmaydi).
3. Deploy. So'ng backend'da `WEB_PUBLIC_URL` va `CORS_ORIGINS` ni Vercel domeniga yangilang.

### Telegram webhook (qo'lda)
```bash
cd apps/api
npm run bot:webhook            # set   → $API_PUBLIC_URL/api/telegram/webhook
npm run bot:webhook -- --info  # holat
npm run bot:webhook -- --delete# polling'ga qaytish
```

---

## 6. API

Swagger UI: `GET /api/docs` (OpenAPI 3). Barcha endpointlar `/api` prefiksi bilan, JSON, `Authorization: Bearer <accessToken>` yoki httpOnly cookie. Xato formati: `{ "error": { "code", "message", "details" } }`.

| Guruh | Endpointlar (qisqacha) |
|---|---|
| Auth | `POST /auth/login`, `/auth/refresh`, `/auth/logout`, `GET /auth/me`, `POST /auth/change-password`, `POST /auth/telegram-link-code` |
| Users | `GET/POST /users`, `GET/PATCH/DELETE /users/:id`, `GET /users/roles`, `POST /users/:id/unlink-telegram` |
| Branches | `GET/POST /branches`, `GET/PATCH/DELETE /branches/:id`, `/branches/departments/*`, `/branches/groups/*` |
| Surveys | `GET/POST /surveys`, `GET/PATCH/DELETE /surveys/:id`, `POST /surveys/:id/{duplicate,send,schedule,remind,status}`, `GET /surveys/:id/results`, `GET /surveys/:id/export?format=csv\|xlsx\|pdf` |
| Reports | `GET /reports`, `GET /reports/:id`, `POST /reports/:id/review`, `DELETE /reports/:id` |
| Analytics | `GET /analytics/{dashboard,overview,completion,activity,branches,rating,reports,performers}` (`range=7d\|30d\|90d\|12m`, `branchId`) |
| KPI | `GET /kpi/metrics`, `PATCH /kpi/metrics/:id`, `GET /kpi/leaderboard?period=`, `GET /kpi/user/:id`, `POST /kpi/compute` |
| Announcements | `GET/POST /announcements`, `PATCH/DELETE /announcements/:id`, `POST /announcements/:id/resend` |
| Tasks | `GET/POST /tasks`, `PATCH/DELETE /tasks/:id` |
| Notifications | `GET /notifications`, `POST /notifications/broadcast`, `POST /notifications/retry` |
| Settings / Audit | `GET/PUT /settings`, `GET /settings/bot`, `GET /audit` |
| Telegram | `POST /telegram/webhook` (faqat webhook rejimida, secret token bilan) |

---

## 7. Foydali buyruqlar

```bash
npm run dev                  # api + web birga
npm run build                # ikkalasini build qilish
npm run typecheck            # tsc (api + web)
npm run db:reset             # bazani tozalab qayta seed qilish (faqat dev!)
npm run bot:webhook -w apps/api
npx tsx scripts/bot-simulate.ts   # (apps/api) bot oqimlarini Telegram'siz sinash
```

## 8. Ma'lumotlar bazasi sxemasi (asosiy jadvallar)

`users` · `roles` · `permissions` · `role_permissions` · `branches` · `departments` · `groups` · `surveys` · `survey_questions` · `survey_options` · `survey_assignments` · `survey_responses` · `survey_answers` · `reports` · `notifications` · `announcements` · `announcement_reads` · `tasks` · `kpi_metrics` · `kpi_results` · `audit_logs` · `settings` · `refresh_tokens` · `telegram_link_codes`

To'liq ta'rif: `apps/api/prisma/schema.prisma`.

---

Litsenziya: MIT.

# TARGET INTERNATIONAL SCHOOL — maktab boshqaruv tizimi

Xususiy xalqaro maktab uchun **Telegram bot (@targetgoboss_bot) + veb admin panel + bitta umumiy ma'lumotlar bazasi**.
O'quvchilar, ota-onalar, o'qituvchilar, tutorlar, komendant, buxgalteriya, direktor va CEO — hammasi bitta tizimda.
Admin panelda kiritilgan har qanday o'zgarish (baho, davomat, to'lov, dars jadvali, uy vazifasi, e'lon) **darhol botda** ko'rinadi va kerak bo'lsa ota-onaga Telegram orqali bildirishnoma boradi.

| Qism | Texnologiya |
|---|---|
| Backend / API | Node.js 20, TypeScript, Express 5, Prisma 7, PostgreSQL 16, Zod, JWT, Pino |
| Telegram bot | Telegraf 4 (polling yoki webhook), bot va API bitta jarayonda |
| Admin panel | Next.js 15 (App Router), React 19, Tailwind CSS 4, shadcn/ui, Recharts, TanStack Query |
| Infratuzilma | Docker, Railway / Render (API + bot), Vercel (web) |

Asosiy til — **O'zbek** (matnlar `apps/web/src/lib/labels.ts` va `apps/api/src/bot/flows/*.ts` ichida markazlashtirilgan). Dizayn — Apple uslubidagi minimal, light/dark, telefon/planshet/kompyuter uchun moslashuvchan.

---

## 1. Imkoniyatlar

### Telegram bot — @targetgoboss_bot
Bot `/start` da TARGET logotipi bilan salomlashadi, telefon raqami orqali profilni tanib oladi va rolga qarab menyu beradi:

| Rol | Menyu |
|---|---|
| 👨‍👩‍👧 Ota-ona | Farzandim · 📊 Baholar · 📅 Dars jadvali · 🟢 Davomat · 📝 Uy vazifalari · 💳 To'lovlar · 🏠 Yotoqxona · 💬 Xabarlar · 📢 E'lonlar · 👤 Profil |
| 👨‍🎓 O'quvchi | Baholar · Dars jadvali · Davomat · Uy vazifalari (topshirish) · Imtihonlar · Xabarlar · E'lonlar |
| 👩‍🏫 O'qituvchi | 📚 Guruhlar · 👨‍🎓 O'quvchilar · 🟢 Davomat · 📊 Baholar · 📝 Uy vazifasi · 💬 Xabarlar · 📅 Dars jadvali |
| 🧑‍🏫 Tutor | 👥 Guruhlar · 👨‍🎓 O'quvchilar · 📊 Natijalar · 🟢 Davomat · 💬 Ota-onalar · 📝 Hisobot |
| 🏠 Komendant | 🏠 Yotoqxona · 👨‍🎓 O'quvchilar · 🛏 Xonalar · 🟢 Davomat · ⚠️ Incidentlar · 💬 Ota-onalar |
| 🏢 Rahbariyat / xodimlar | Boshqaruv ko'rsatkichlari, so'rovnomalar, hisobotlar, e'lonlar |

Ota-ona bir nechta farzandini ko'radi (`Ali Jumayev — 7-A`), tanlagach: baholar (kun/hafta/oy, fan, o'qituvchi), davomat (Kelgan / Kelmagan / Kechikkan / Sababli), kunlik-haftalik dars jadvali (+ **PDF yuklab olish**), uy vazifalari va ularning holati, imtihon natijalari, o'qituvchilar va tutor, to'lovlar (Jami / To'langan / Qoldiq, chegirma, qarz), yotoqxona (bino/xona/joy, komendant, oxirgi yozuvlar), guruh chati va e'lonlar.

**Avtomatik bildirishnomalar (Telegram):** kelmaganlik · yangi baho · uy vazifasi berildi · muddat yaqinlashdi · yangi e'lon · to'lov muddati · to'lov qabul qilindi · dars jadvali o'zgardi · o'qituvchi/tutor xabari · yotoqxona incidenti · imtihon eslatmasi.

### Admin panel (`/dashboard`)
Dashboard (Direktor/CEO ko'rinishlari) · O'quvchilar (profil, baholar, davomat kalendari, to'lovlar, yotoqxona, Excel eksport) · Ota-onalar · Teacherlar · Tutorlar · Xodimlar (rol, filial, bo'lim, login/parol, Telegram ID, foto) · Rollar va ruxsatlar (yangi rol yaratish, har bir rolga alohida huquqlar) · Guruhlar (tutor, fan o'qituvchilari, o'quvchilar, ota-onalar, chat) · Fanlar va xonalar · Dars jadvali (haftalik jadval, dars qo'shish/tahrirlash, PDF) · Davomat (guruh varaqasi, statistika) · Baholar (jurnal, kun/hafta/oy) · Uy vazifalari (berish, tekshirish: Qabul qilindi / Qayta ishlash kerak / Baholandi) · Imtihonlar (natijalar) · Finance (daromad/xarajat/foyda, hisob-fakturalar, to'lovlar, qarzdorlar, chegirmalar, xarajatlar, Excel eksport) · Yotoqxona (bino → qavat → xona → joy, joylashtirish, jurnal, incidentlar, kunlik yo'qlama) · Xabarlar (guruh chatlari) · E'lonlar · Hisobotlar · KPI · Filiallar · Sozlamalar.

### Rollar (RBAC)
| Rol | Kalit | Qamrov |
|---|---|---|
| Super Admin (Bosh Admin) | `SUPER_ADMIN` | Hamma narsa; har qanday rol/foydalanuvchi qo'sha oladi |
| Direktor | `DIRECTOR` | O'z filiali to'liq |
| CEO | `CEO` | Barcha filiallar: moliya, o'quvchilar, davomat, jamoa |
| HR / Administrator / Reception | `HR_ADMIN` / `ADMINISTRATOR` / `RECEPTION` | Xodimlar / o'quvchilar va ota-onalarni ro'yxatga olish |
| Buxgalter | `ACCOUNTANT` | Finance to'liq |
| Komendant | `DORM_MANAGER` | Yotoqxona boshqaruvi |
| Marketing, IT admin | `MARKETING` / `IT_ADMIN` | E'lonlar, analitika / tizim sozlamalari |
| O'qituvchi, Tutor | `TEACHER` / `TUTOR` | Faqat o'z guruhlari |
| Ota-ona, O'quvchi | `PARENT` / `STUDENT` | Faqat o'z farzandlari / o'zi |
| Maxsus rollar | `CUSTOM` | Admin panelda yaratiladi, ruxsatlar alohida belgilanadi |

Super Admin — **Jumayev Baxtbek** (Bosh Admin, Yunusobod filiali). Login/parol kodda yozilmaydi: `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD` `.env` orqali beriladi va `db:seed` da yaratiladi/yangilanadi.

### Xavfsizlik
JWT access (15 daq) + refresh (httpOnly cookie, rotatsiya), bcrypt, ruxsatlarga asoslangan RBAC (`permission` kalitlari), filial/guruh/farzand darajasida ma'lumot cheklovi, rate-limit, Helmet, audit jurnali, Telegram webhook secret, CORS ro'yxati (`CORS_ORIGINS`; `*.vercel.app` va lokal preview domenlari avtomatik ruxsat etiladi).

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

### Hisoblar (seed)
| Rol | Login | Parol |
|---|---|---|
| Super Admin — Jumayev Baxtbek | `SUPER_ADMIN_EMAIL` (default `admin@target-school.uz`) | `SUPER_ADMIN_PASSWORD` (`.env`) |
| CEO / Direktor / HR / Buxgalter / Komendant / Reception / Marketing / IT / O'qituvchi / Tutor | `ceo@`, `director@`, `director.chl@`, `hr@`, `accountant@`, `admin.yun@`, `dorm@`, `reception@`, `marketing@`, `it@`, `teacher@`, `tutor@` + `target-school.uz` | `SEED_DEMO_PASSWORD` (default `Target2026!`) |

Demo ma'lumot (`SEED_DEMO=true`): 2 filial (Yunusobod, Chilonzor), ~260 o'quvchi, ota-onalar, 5–11 sinf guruhlari, fanlar, dars jadvali, 30 kunlik davomat va baholar, uy vazifalari, imtihonlar, oylik hisob-fakturalar va to'lovlar, yotoqxona (bino/xona/joy), guruh chatlari. Ishlab chiqarishda `SEED_DEMO=false` qiling.

Telegram ulash: ota-ona/o'quvchi/xodim botda `/start` → telefon raqamini yuboradi → admin panelda kiritilgan raqam bo'yicha avtomatik ulanadi (yoki admin panel bergan bir martalik kod → `/link 123456`). Admin xodim kartasida Telegram ID/username ni ham to'g'ridan-to'g'ri kiritishi mumkin.

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
| `SUPER_ADMIN_NAME`, `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD`, `SUPER_ADMIN_PHONE` | Bosh Admin hisobi (seed). Parolda `#` bo'lsa qo'shtirnoqqa oling |
| `SEED_DEMO`, `SEED_DEMO_PASSWORD` | demo ma'lumotlar va ularning paroli |
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
| Users / Roles | `GET/POST /users`, `GET/PATCH/DELETE /users/:id`, `GET /users/roles`; `GET/POST /roles`, `PATCH/DELETE /roles/:id`, `GET /roles/permissions` |
| Students / Parents | `GET/POST /students`, `GET/PATCH/DELETE /students/:id`, `GET /students/export` (xlsx); `GET/POST /parents`, `GET/PATCH/DELETE /parents/:id` (farzandlar `studentIds` orqali bog‘lanadi) |
| Groups / Subjects | `GET/POST /groups`, `GET/PATCH/DELETE /groups/:id`, `POST/DELETE /groups/:id/students`; `GET/POST /subjects`, `/subjects/rooms` |
| Schedule | `GET /schedule` (`groupId`, `teacherId`, `weekday`), `POST /schedule/lessons`, `PATCH/DELETE /schedule/lessons/:id`, `GET /schedule/pdf` |
| Attendance | `GET /attendance`, `GET /attendance/sheet`, `POST /attendance/mark` (ota-onaga avtomatik xabar), `GET /attendance/stats`, `GET /attendance/student/:id/calendar` |
| Grades / Exams | `GET/POST /grades`, `GET /grades/sheet`, `PATCH/DELETE /grades/:id`; `GET/POST /exams`, `POST /exams/:id/results` |
| Homework | `GET/POST /homework`, `GET/PATCH/DELETE /homework/:id`, `POST /homework/:id/submit`, `POST /homework/:id/review` |
| Finance | `GET /finance/summary`, `/invoices`, `/payments`, `/debtors`, `/expenses`, `POST /finance/invoices`, `/invoices/generate`, `/payments`, `/expenses`, `GET /finance/export?type=` |
| Dorm | `GET/POST /dorm`, `/dorm/buildings`, `/dorm/rooms`, `POST /dorm/assign`, `/dorm/checkout/:studentId`, `/dorm/logs`, `/dorm/rollcall`, `GET /dorm/students`, `/dorm/student/:id` |
| Messages | `GET /messages/groups`, `GET/POST /messages/groups/:id`, `DELETE /messages/:id`, `POST /messages/:id/pin` |
| School / Analytics | `GET /school/overview` (Direktor/CEO dashboard), `GET /analytics/*`, `GET /kpi/*` |
| Branches / Announcements / Tasks / Notifications / Settings / Audit | avvalgidek (`/branches`, `/announcements`, `/tasks`, `/notifications`, `/settings`, `/audit`) |
| Telegram | `POST /telegram/webhook` (faqat webhook rejimida, secret token bilan) |

---

## 7. Foydali buyruqlar

```bash
npm run dev                  # api + web birga
npm run build                # ikkalasini build qilish
npm run typecheck            # tsc (api + web)
npm run db:reset             # bazani tozalab qayta seed qilish (faqat dev!)
npm run bot:webhook -w apps/api
npx tsx scripts/bot-simulate-school.ts   # (apps/api) maktab bot oqimlarini Telegram'siz sinash
```

## 8. Ma'lumotlar bazasi sxemasi (asosiy jadvallar)

Foydalanuvchilar: `users` · `roles` · `permissions` · `role_permissions` · `branches` · `departments` · `refresh_tokens` · `telegram_link_codes`
Maktab: `students` · `parents` · `parent_students` · `groups` · `group_teachers` · `subjects` · `rooms` · `schedules` · `lessons` · `attendance` · `grades` · `homework` · `homework_submissions` · `exams` · `exam_results` · `group_messages`
Moliya: `tuition_plans` · `invoices` · `payments` · `discounts` · `expenses`
Yotoqxona: `dormitories` · `dorm_buildings` · `dorm_rooms` · `dorm_beds` · `dorm_assignments` · `dorm_logs`
Umumiy: `surveys*` · `reports` · `notifications` · `announcements` · `tasks` · `kpi_*` · `audit_logs` · `settings`

To'liq ta'rif: `apps/api/prisma/schema.prisma`.

---

Litsenziya: MIT.

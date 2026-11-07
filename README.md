# 中医诊所网站

这是一个现代的中医诊所单页响应式网站，使用 Next.js 和 Tailwind CSS 构建。

## 功能特点

- 现代、优雅、简约的设计
- 粘性导航栏
- 平滑滚动
- 移动优先响应式设计
- 预约挂号表单
- 服务与治疗介绍
- 医师介绍
- 患者评价（可滚动查看）
- 地点与营业时间

## 技术栈

- Next.js 16
- React
- TypeScript
- Tailwind CSS

## 运行项目

首先，安装依赖：

```bash
npm install
```

然后，启动开发服务器：

```bash
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000) 查看结果。

## 构建生产版本

```bash
npm run build
npm start
```

## Audit log

Clinic activity is written to the server-side SQLite `audit_log` table at `.data/clinic-audit.sqlite` by default. Set `AUDIT_LOG_DB_PATH` to choose another persistent path. The database directory is ignored by Git. Entries are append-only, protected from updates and deletes by SQLite triggers, and each entry's SHA-256 hash includes the previous entry hash, beginning with `GENESIS`. The portal verifies the full chain in sequence.

Chain verification provides tamper evidence only. It does not replace access control, secure storage, monitoring, backups, or compliance procedures.

The log records appointment creation, kiosk verification/check-in outcomes, CEU payment setup and client-reported outcomes, administrator sign-in attempts, and denied audit-log reads. Event actions and summaries are selected on the server; new browser events do not include credentials or browser session IDs. Verification inputs, contact details, card data, and medical details are not event fields. Payment confirmation and CEU enrollment events reported by the browser are not authoritative until verified by a Stripe webhook and a server-side enrollment system.

To test locally, explicitly sign in through the demo administrator flow, create a booking, and try both a failed and successful kiosk verification using fictional test data. Open Administration / Security to see the connected SQLite-backed table and `Verify Chain`. A request to `GET /api/audit-log` without the administrator cookie should return `403`; update/delete attempts against `audit_log` should be rejected by its SQLite triggers. To test tamper detection, use a disposable copy of the database, bypass a trigger, change or delete an earlier row, and confirm the verifier reports Failed. Never test tampering against the working audit database.

This prototype does not implement appointment rescheduling/cancellation, real patient authentication, a membership-ID scanner, persistent CEU enrollment, certificate issuance, Stripe webhooks, or functional administrative/staff/patient record changes. The corresponding change/certificate event types are reserved for those workflows; no such change or certificate is claimed to have occurred.

The SQLite-backed audit service requires Node.js 22.13 or newer. Production deployments must mount persistent storage for the database. For multiple application instances, use a shared database service instead of local SQLite storage.

Configure these server-only variables for production administrator access:

- `CLINIC_ADMIN_EMAIL`
- `CLINIC_ADMIN_PASSWORD`
- `CLINIC_SESSION_SECRET` (use a randomly generated secret of at least 32 bytes)
- `AUDIT_LOG_DB_PATH` (optional)

The local development administrator sign-in remains a mock. Production sign-in fails closed unless the credentials and session secret are configured. Payment success events currently reflect the CEU client confirmation flow; verify payments from Stripe webhooks before treating those entries as authoritative.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

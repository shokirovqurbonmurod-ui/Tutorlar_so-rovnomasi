/**
 * Telegram webhook helper.
 *
 *   npm run bot:webhook            → set webhook to $API_PUBLIC_URL/api/telegram/webhook
 *   npm run bot:webhook -- --info  → print current webhook info
 *   npm run bot:webhook -- --delete→ remove webhook (switch back to polling)
 *
 * Reads TELEGRAM_BOT_TOKEN, API_PUBLIC_URL and TELEGRAM_WEBHOOK_SECRET from .env
 */
import 'dotenv/config';

const token = process.env.TELEGRAM_BOT_TOKEN;
const publicUrl = process.env.API_PUBLIC_URL;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;

if (!token) {
  console.error('TELEGRAM_BOT_TOKEN is not set');
  process.exit(1);
}

const api = (method: string, body?: Record<string, unknown>) =>
  fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  }).then(async (r) => {
    const json = (await r.json()) as { ok: boolean; result?: unknown; description?: string };
    if (!json.ok) throw new Error(`${method}: ${json.description ?? 'unknown error'}`);
    return json.result;
  });

async function main() {
  const arg = process.argv[2];

  if (arg === '--info') {
    console.log(JSON.stringify(await api('getWebhookInfo'), null, 2));
    return;
  }
  if (arg === '--delete') {
    await api('deleteWebhook', { drop_pending_updates: false });
    console.log('Webhook removed. Bot can now run in polling mode.');
    return;
  }

  if (!publicUrl || !/^https:\/\//.test(publicUrl)) {
    console.error('API_PUBLIC_URL must be a public https:// URL for webhook mode');
    process.exit(1);
  }
  const url = `${publicUrl.replace(/\/$/, '')}/api/telegram/webhook`;
  await api('setWebhook', {
    url,
    secret_token: secret,
    allowed_updates: ['message', 'callback_query', 'my_chat_member'],
    drop_pending_updates: false,
  });
  console.log(`Webhook set → ${url}`);
  console.log(JSON.stringify(await api('getWebhookInfo'), null, 2));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

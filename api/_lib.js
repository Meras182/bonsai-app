const crypto = require('crypto');

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Umgebungsvariable ${name} ist nicht gesetzt`);
  return v;
}

async function redis(...args) {
  const res = await fetch(requireEnv('UPSTASH_REDIS_REST_URL'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${requireEnv('UPSTASH_REDIS_REST_TOKEN')}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(args)
  });
  if (!res.ok) throw new Error(`Upstash-Fehler: ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(`Upstash-Fehler: ${data.error}`);
  return data.result;
}

function endpointHash(endpoint) {
  return crypto.createHash('sha256').update(endpoint).digest('hex').slice(0, 32);
}

function getVapid() {
  return {
    publicKey: requireEnv('VAPID_PUBLIC_KEY'),
    privateKey: requireEnv('VAPID_PRIVATE_KEY'),
    subject: process.env.VAPID_SUBJECT || 'mailto:bonsai-app@example.com'
  };
}

function todayStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

module.exports = { redis, endpointHash, getVapid, todayStr };

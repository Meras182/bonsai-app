const webpush = require('web-push');
const { redis, endpointHash, getVapid, todayStr } = require('./_lib');

const TASK_LABELS = {
  water: 'Gießen',
  fertilize: 'Düngen',
  prune: 'Schneiden',
  repot: 'Umtopfen'
};

module.exports = async (req, res) => {
  try {
    const auth = req.headers.authorization || '';
    const secret = process.env.CRON_SECRET;
    if (secret && auth !== `Bearer ${secret}`) {
      return res.status(401).json({ error: 'Unautorisiert' });
    }

    const vapid = getVapid();
    webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);

    const subs = (await redis('HGETALL', 'subs')) || {};
    const today = todayStr();
    let sent = 0;
    let removed = 0;

    for (const [hash, raw] of Object.entries(subs)) {
      let record;
      try {
        record = JSON.parse(raw);
      } catch {
        continue;
      }

      const due = [];
      for (const tree of record.trees || []) {
        for (const task of tree.tasks || []) {
          if (task.nextDue && task.nextDue <= today) {
            due.push(`${TASK_LABELS[task.type] || task.type}: ${tree.name}`);
          }
        }
      }
      if (due.length === 0) continue;

      const body = due.length <= 4
        ? due.join(' · ')
        : `${due.slice(0, 3).join(' · ')} und ${due.length - 3} weitere`;
      const payload = JSON.stringify({
        title: '🌱 Bonsai-Erinnerung',
        body: `Heute fällig: ${body}`,
        url: '/'
      });

      try {
        await webpush.sendNotification(
          { endpoint: record.endpoint, keys: record.keys },
          payload
        );
        sent++;
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await redis('HDEL', 'subs', hash);
          removed++;
        }
      }
    }

    res.status(200).json({ ok: true, sent, removed, today });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

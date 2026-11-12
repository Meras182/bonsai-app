const { redis, endpointHash } = require('./_lib');

module.exports = async (req, res) => {
  try {
    if (req.method === 'POST') {
      const { subscription, trees } = typeof req.body === 'string'
        ? JSON.parse(req.body)
        : req.body;
      if (!subscription || !subscription.endpoint || !subscription.keys) {
        return res.status(400).json({ error: 'Ungültiges Abo' });
      }
      const record = {
        endpoint: subscription.endpoint,
        keys: subscription.keys,
        trees: Array.isArray(trees) ? trees : [],
        updatedAt: Date.now()
      };
      await redis('HSET', 'subs', endpointHash(subscription.endpoint), JSON.stringify(record));
      return res.status(200).json({ ok: true });
    }

    if (req.method === 'DELETE') {
      const { endpoint } = typeof req.body === 'string'
        ? JSON.parse(req.body)
        : req.body;
      if (!endpoint) return res.status(400).json({ error: 'endpoint fehlt' });
      await redis('HDEL', 'subs', endpointHash(endpoint));
      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', 'POST, DELETE');
    res.status(405).json({ error: 'Methode nicht erlaubt' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

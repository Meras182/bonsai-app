module.exports = (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ publicKey: process.env.VAPID_PUBLIC_KEY || null });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

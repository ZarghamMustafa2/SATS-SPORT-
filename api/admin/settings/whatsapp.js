// Vercel Serverless Function Proxy: /api/admin/settings/whatsapp -> /api/settings/whatsapp
const whatsappSettingsHandler = require('../../settings/whatsapp');

module.exports = async function handler(req, res) {
  return whatsappSettingsHandler(req, res);
};

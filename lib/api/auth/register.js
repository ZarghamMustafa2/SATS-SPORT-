const authDb = require('../../auth_db');
const { parseJsonBody, sendJson } = require('../../http_util');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    return sendJson(res, 405, { status: 'error', message: 'Method not allowed' });
  }

  try {
    const body = await parseJsonBody(req);
    const { username, password } = body;

    // Normal user self-registration ONLY - any role parameter provided by client is ignored
    const newUser = authDb.registerNormalUser({ username, password });

    return sendJson(res, 201, {
      status: 'success',
      message: 'Account registered successfully. You can now login.',
      user: newUser,
      redirectTo: '/login'
    });
  } catch (err) {
    const statusCode = err.message.includes('already taken') ? 409 : 400;
    return sendJson(res, statusCode, { status: 'error', message: err.message });
  }
};

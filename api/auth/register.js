const authDb = require('../../lib/auth_db');
const { parseJsonBody, sendJson } = require('../../lib/http_util');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const urlObj = new URL(req.url, 'http://localhost');
  const searchParams = urlObj.searchParams;

  // 1. GET: Real-Time Username Availability Check
  if (req.method === 'GET') {
    const rawUsername = searchParams.get('username') || searchParams.get('u') || '';
    const check = authDb.checkUsernameAvailability(rawUsername);
    return sendJson(res, 200, {
      status: 'success',
      available: check.available,
      message: check.message
    });
  }

  // 2. POST: Real Normal User Registration
  if (req.method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const { username, password, confirmPassword } = body;

      if (confirmPassword !== undefined && confirmPassword !== password) {
        return sendJson(res, 400, {
          status: 'error',
          message: 'Password and Confirm Password do not match.'
        });
      }

      // Normal user self-registration ONLY - any role parameter provided by client is ignored
      const newUser = authDb.registerNormalUser({ username, password, confirmPassword });
      const session = authDb.createSession(newUser);
      await authDb.saveUsersToDiskAsync();
      const cookieVal = `auth_token=${session.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`;

      return sendJson(res, 201, {
        status: 'success',
        message: 'Account registered successfully.',
        token: session.token,
        user: newUser,
        redirectTo: '/'
      }, { 'Set-Cookie': cookieVal });
    } catch (err) {
      const statusCode = err.statusCode || (err.message && (err.message.includes('already registered') || err.message.includes('already taken')) ? 409 : 400);
      return sendJson(res, statusCode, { status: 'error', message: err.message });
    }
  }

  return sendJson(res, 405, { status: 'error', message: 'Method not allowed' });
};

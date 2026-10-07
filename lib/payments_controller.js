// api/payments/index.js - Unified Manual Deposit & Withdrawal API Controller
const url = require('url');
const authDb = require('./auth_db');
const paymentsDb = require('./payments_db');
const { parseJsonBody, getRequestSession, sendJson } = require('./http_util');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Request, X-Admin-Token, X-Company-Key');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, 'http://localhost');
  const pathname = (parsedUrl.pathname || '').toLowerCase().replace(/\/+$/, '');
  const searchParams = parsedUrl.searchParams;

  // 1. Hydrate authentication & payment databases from multi-tier cloud store
  await authDb.hydrateUsersAsync();
  await paymentsDb.hydrateDataAsync();

  // Resolve authenticated session (supporting Bearer token, query token for media, headers, and cookies)
  let session = getRequestSession(req, authDb);
  if (!session) {
    const queryToken = searchParams.get('token') || searchParams.get('auth_token') || searchParams.get('admin_token');
    if (queryToken) {
      session = authDb.getSession(queryToken);
    }
  }

  // Normalize session user identity
  if (session) {
    if (!session.id && session.userId) session.id = session.userId;
    if (!session.userId && session.id) session.userId = session.id;
  }

  // Support Company Key
  const companyKey = req.headers['x-company-key'];
  if (!session && companyKey && authDb.verifyCompanyKey(companyKey)) {
    session = {
      role: authDb.ROLES.COMPANY,
      username: 'Company Account'
    };
  }

  const isPaymentAdmin = Boolean(session && (
    session.role === authDb.ROLES.SUPER_MASTER ||
    session.role === 'super_master' ||
    session.role === 'admin'
  ));

  const isCompany = Boolean(session && (
    session.role === authDb.ROLES.COMPANY ||
    session.role === authDb.ROLES.SUPER_ADMIN ||
    session.role === 'company' ||
    session.role === 'super_admin'
  ));

  try {
    // -----------------------------------------------------------
    // 1. BANK ACCOUNTS
    // -----------------------------------------------------------
    if (pathname === '/api/payments/banks' || pathname === '/api/payments/bank-accounts') {
      if (req.method === 'GET') {
        if (isCompany) {
          return sendJson(res, 403, { status: 'error', message: 'Access denied: Payment options and bank settings are restricted to Admin accounts.' });
        }
        // Normal users only see active receiving banks; Admins see all
        const banks = paymentsDb.getBankAccounts({ activeOnly: !isPaymentAdmin });
        return sendJson(res, 200, {
          status: 'success',
          banks,
          isAdmin: Boolean(isPaymentAdmin)
        });
      }

      if (req.method === 'POST') {
        if (!isPaymentAdmin) {
          return sendJson(res, 403, { status: 'error', message: 'Access denied: Payment management privileges are restricted to Admin accounts.' });
        }
        const body = await parseJsonBody(req);
        const newBank = paymentsDb.addBankAccount({
          requesterUser: session,
          bankName: body.bankName,
          accountTitle: body.accountTitle,
          accountNumber: body.accountNumber,
          iban: body.iban || '',
          details: body.details || '',
          status: body.status || 'active'
        });
        await paymentsDb.saveBanksAsync();
        return sendJson(res, 201, {
          status: 'success',
          message: 'Bank account added successfully',
          bank: newBank
        });
      }

      if (req.method === 'PUT') {
        if (!isPaymentAdmin) {
          return sendJson(res, 403, { status: 'error', message: 'Access denied: Payment management privileges are restricted to Admin accounts.' });
        }
        const body = await parseJsonBody(req);
        const updated = paymentsDb.updateBankAccount({
          requesterUser: session,
          id: body.id,
          updates: body.updates || body
        });
        await paymentsDb.saveBanksAsync();
        return sendJson(res, 200, {
          status: 'success',
          message: 'Bank account updated successfully',
          bank: updated
        });
      }

      if (req.method === 'DELETE') {
        if (!isPaymentAdmin) {
          return sendJson(res, 403, { status: 'error', message: 'Access denied: Payment management privileges are restricted to Admin accounts.' });
        }
        const body = await parseJsonBody(req);
        const id = searchParams.get('id') || body.id;
        if (!id) {
          return sendJson(res, 400, { status: 'error', message: 'Bank account ID is required' });
        }
        const removed = paymentsDb.deleteBankAccount({ requesterUser: session, id });
        await paymentsDb.saveBanksAsync();
        return sendJson(res, 200, {
          status: 'success',
          message: 'Bank account deleted successfully',
          bank: removed
        });
      }
    }

    // Toggle Bank Account Status
    if (pathname === '/api/payments/banks/toggle' && req.method === 'POST') {
      if (!isPaymentAdmin) {
        return sendJson(res, 403, { status: 'error', message: 'Access denied: Payment management privileges are restricted to Admin accounts.' });
      }
      const body = await parseJsonBody(req);
      const id = searchParams.get('id') || body.id;
      if (!id) {
        return sendJson(res, 400, { status: 'error', message: 'Bank account ID is required' });
      }
      const toggled = paymentsDb.toggleBankAccountStatus({ requesterUser: session, id });
      await paymentsDb.saveBanksAsync();
      return sendJson(res, 200, {
        status: 'success',
        message: `Bank account status changed to ${toggled.status}`,
        bank: toggled
      });
    }

    // -----------------------------------------------------------
    // 2. USER DEPOSIT FLOW
    // -----------------------------------------------------------
    if (pathname === '/api/payments/deposit' || pathname === '/api/payments/deposits') {
      if (req.method === 'POST') {
        if (!session) {
          return sendJson(res, 401, { status: 'error', message: 'Please login to submit a deposit request' });
        }
        const body = await parseJsonBody(req);
        const requestRecord = paymentsDb.createDepositRequest({
          user: session,
          amount: body.amount,
          bankAccountId: body.bankAccountId || body.bankId,
          screenshotBase64: body.screenshot || body.screenshotBase64 || body.image,
          note: body.note
        });
        await paymentsDb.saveRequestsAsync();

        return sendJson(res, 201, {
          status: 'success',
          message: 'Deposit request submitted successfully. Awaiting administrator verification.',
          request: {
            id: requestRecord.id,
            amount: requestRecord.amount,
            status: requestRecord.status,
            createdAt: requestRecord.createdAt,
            selectedBank: requestRecord.selectedBank
          }
        });
      }

      if (req.method === 'GET') {
        if (!session) {
          return sendJson(res, 401, { status: 'error', message: 'Authentication required' });
        }
        const requests = paymentsDb.getPaymentRequests({
          user: session,
          type: 'DEPOSIT',
          status: searchParams.get('status'),
          search: searchParams.get('search') || searchParams.get('q') || ''
        });

        // Strip heavy base64 data from list queries
        const sanitized = requests.map(r => {
          const c = { ...r };
          if (c.screenshot) {
            c.screenshot = {
              filename: c.screenshot.filename,
              mimeType: c.screenshot.mimeType,
              sizeBytes: c.screenshot.sizeBytes
            };
          }
          return c;
        });

        return sendJson(res, 200, {
          status: 'success',
          total: sanitized.length,
          requests: sanitized
        });
      }
    }

    // -----------------------------------------------------------
    // 3. USER WITHDRAWAL FLOW
    // -----------------------------------------------------------
    if (
      pathname === '/api/payments/withdraw' ||
      pathname === '/api/payments/withdrawals' ||
      pathname === '/api/payments/withdraw/status' ||
      pathname === '/api/payments/withdrawals/status'
    ) {
      if (req.method === 'POST') {
        if (!session) {
          return sendJson(res, 401, { status: 'error', message: 'Please login to submit a withdrawal request' });
        }
        const body = await parseJsonBody(req);
        const requestRecord = await paymentsDb.createWithdrawalRequestAsync({
          user: session,
          amount: body.amount,
          accountHolderName: body.accountHolderName || body.accountTitle,
          bankName: body.bankName,
          accountNumber: body.accountNumber,
          iban: body.iban,
          note: body.note
        });

        return sendJson(res, 201, {
          status: 'success',
          message: 'Withdrawal request submitted successfully. Awaiting administrator review.',
          request: requestRecord
        });
      }

      if (req.method === 'GET') {
        if (!session) {
          return sendJson(res, 401, { status: 'error', message: 'Authentication required' });
        }
        const requests = paymentsDb.getPaymentRequests({
          user: session,
          type: 'WITHDRAWAL',
          status: searchParams.get('status'),
          search: searchParams.get('search') || searchParams.get('q') || ''
        });

        const activeWithdrawal = paymentsDb.getUserActiveWithdrawal(session);

        if (pathname.endsWith('/status')) {
          return sendJson(res, 200, {
            status: 'success',
            hasActiveWithdrawal: Boolean(activeWithdrawal),
            activeWithdrawal
          });
        }

        return sendJson(res, 200, {
          status: 'success',
          total: requests.length,
          hasActiveWithdrawal: Boolean(activeWithdrawal),
          activeWithdrawal,
          requests
        });
      }
    }

    // -----------------------------------------------------------
    // 4. ADMIN REQUESTS LIST (Both Deposits and Withdrawals)
    // -----------------------------------------------------------
    if (pathname === '/api/payments/admin/requests') {
      if (!isPaymentAdmin) {
        return sendJson(res, 403, { status: 'error', message: 'Access denied: Payment management privileges are restricted to Admin accounts.' });
      }

      const requests = paymentsDb.getPaymentRequests({
        user: session,
        type: searchParams.get('type') || null,
        status: searchParams.get('status') || null,
        search: searchParams.get('search') || searchParams.get('q') || ''
      });

      const sanitized = requests.map(r => {
        const c = { ...r };
        if (c.screenshot) {
          c.screenshot = {
            filename: c.screenshot.filename,
            mimeType: c.screenshot.mimeType,
            sizeBytes: c.screenshot.sizeBytes
          };
        }
        return c;
      });

      return sendJson(res, 200, {
        status: 'success',
        total: sanitized.length,
        requests: sanitized
      });
    }

    // -----------------------------------------------------------
    // 5. ADMIN APPROVAL
    // -----------------------------------------------------------
    if (pathname === '/api/payments/admin/approve' && req.method === 'POST') {
      if (!isPaymentAdmin) {
        return sendJson(res, 403, { status: 'error', message: 'Access denied: Payment management privileges are restricted to Admin accounts.' });
      }
      const body = await parseJsonBody(req);
      const requestId = body.requestId || body.id;
      if (!requestId) {
        return sendJson(res, 400, { status: 'error', message: 'Request ID is required' });
      }

      const reqObj = paymentsDb.getRequestById(requestId);
      if (!reqObj) {
        return sendJson(res, 404, { status: 'error', message: 'Payment request not found' });
      }

      if (reqObj.type === 'DEPOSIT') {
        const result = paymentsDb.approveDepositRequest({
          requesterUser: session,
          requestId,
          adminNote: body.adminNote || body.note || ''
        });
        await authDb.saveUsersToDiskAsync();
        await paymentsDb.saveRequestsAsync();

        return sendJson(res, 200, {
          status: 'success',
          message: `Deposit request ${requestId} approved successfully. Rs. ${result.request.amount.toLocaleString('en-IN')} credited to ${result.request.username}.`,
          request: result.request,
          user: result.user
        });
      } else if (reqObj.type === 'WITHDRAWAL') {
        const result = paymentsDb.approveWithdrawalRequest({
          requesterUser: session,
          requestId,
          adminNote: body.adminNote || body.note || ''
        });
        await authDb.saveUsersToDiskAsync();
        await paymentsDb.saveRequestsAsync();

        return sendJson(res, 200, {
          status: 'success',
          message: `Withdrawal request ${requestId} approved successfully. Rs. ${result.request.amount.toLocaleString('en-IN')} deducted from ${result.request.username}.`,
          request: result.request,
          user: result.user
        });
      } else {
        return sendJson(res, 400, { status: 'error', message: 'Unknown request type: ' + reqObj.type });
      }
    }

    // -----------------------------------------------------------
    // 6. ADMIN REJECTION
    // -----------------------------------------------------------
    if (pathname === '/api/payments/admin/reject' && req.method === 'POST') {
      if (!isPaymentAdmin) {
        return sendJson(res, 403, { status: 'error', message: 'Access denied: Payment management privileges are restricted to Admin accounts.' });
      }
      const body = await parseJsonBody(req);
      const requestId = body.requestId || body.id;
      const reason = body.rejectionReason || body.reason;

      if (!requestId) {
        return sendJson(res, 400, { status: 'error', message: 'Request ID is required' });
      }
      if (!reason || !String(reason).trim()) {
        return sendJson(res, 400, { status: 'error', message: 'Rejection reason is required' });
      }

      const reqObj = paymentsDb.getRequestById(requestId);
      if (!reqObj) {
        return sendJson(res, 404, { status: 'error', message: 'Payment request not found' });
      }

      let rejectedReq = null;
      if (reqObj.type === 'DEPOSIT') {
        rejectedReq = paymentsDb.rejectDepositRequest({
          requesterUser: session,
          requestId,
          rejectionReason: reason
        });
      } else if (reqObj.type === 'WITHDRAWAL') {
        rejectedReq = paymentsDb.rejectWithdrawalRequest({
          requesterUser: session,
          requestId,
          rejectionReason: reason
        });
      }
      await paymentsDb.saveRequestsAsync();

      return sendJson(res, 200, {
        status: 'success',
        message: `${reqObj.type} request ${requestId} has been rejected.`,
        request: rejectedReq
      });
    }

    // -----------------------------------------------------------
    // 7. ADMIN STATS
    // -----------------------------------------------------------
    if ((pathname === '/api/payments/stats' || pathname === '/api/payments/admin/stats') && req.method === 'GET') {
      if (!isPaymentAdmin) {
        return sendJson(res, 403, { status: 'error', message: 'Access denied: Payment management privileges are restricted to Admin accounts.' });
      }
      const stats = paymentsDb.getPaymentStats({ requesterUser: session });
      return sendJson(res, 200, {
        status: 'success',
        stats
      });
    }

    // -----------------------------------------------------------
    // 8. SECURE SCREENSHOT ACCESS CONTROL
    // -----------------------------------------------------------
    if (pathname === '/api/payments/screenshot' && req.method === 'GET') {
      if (!session) {
        return sendJson(res, 401, { status: 'error', message: 'Authentication required' });
      }
      if (isCompany) {
        return sendJson(res, 403, { status: 'error', message: 'Access denied: Payment receipt access is restricted to Admin accounts.' });
      }
      const requestId = searchParams.get('id') || searchParams.get('requestId');
      if (!requestId) {
        return sendJson(res, 400, { status: 'error', message: 'Request ID is required' });
      }

      const { buffer, mimeType } = paymentsDb.getScreenshotBuffer({
        requesterUser: session,
        requestId
      });

      res.statusCode = 200;
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Length', buffer.length);
      res.setHeader('Content-Disposition', `inline; filename="screenshot_${requestId}.${mimeType.split('/')[1] || 'jpg'}"`);
      res.setHeader('Cache-Control', 'private, max-age=3600');
      res.end(buffer);
      return;
    }

    // Unmatched subpath
    return sendJson(res, 404, { status: 'error', message: `Payments endpoint ${pathname} not found` });

  } catch (err) {
    const statusCode = err.statusCode || 500;
    return sendJson(res, statusCode, { status: 'error', message: err.message });
  }
};


// api/payments.js - Standalone Serverless Function for Manual Deposit & Withdrawal
const paymentsController = require('../lib/payments_controller');

module.exports = async function handler(req, res) {
  return paymentsController(req, res);
};

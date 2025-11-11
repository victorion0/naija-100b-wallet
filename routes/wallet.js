// routes/wallet.js
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
  fundWallet,
  handleWebhook,
  transfer,
  getBalance,
  getTransactions
} = require('../controllers/walletController');

// PUBLIC
router.post('/webhook', handleWebhook);

// PROTECTED ROUTES
router.use(protect);
router.post('/fund', fundWallet);
router.post('/transfer', transfer);
router.get('/balance', getBalance);
router.get('/transactions', getTransactions);

module.exports = router;
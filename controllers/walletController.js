// controllers/walletController.js
const axios = require('axios');
const crypto = require('crypto');
const User = require('../models/user');
const redis = require('../config/redis');
const { Queue, Worker } = require('bullmq');

// BullMQ Queue for safe webhook processing
const webhookQueue = new Queue('webhook', { connection: redis });

// ==================== FUND WALLET WITH PAYSTACK ====================
exports.fundWallet = async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount || amount < 100) {
      return res.status(400).json({ message: 'Minimum funding is ₦100' });
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const reference = `fund_${Date.now()}_${user._id}`;

    const response = await axios.post(
      'https://api.paystack.co/transaction/initialize',
      {
        email: user.email,
        amount: amount * 100,
        reference,
        callback_url: `${process.env.BASE_URL}/fund-success`,
        metadata: {
          userId: user._id.toString(),
          type: 'wallet_fund'
        }
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    res.json({
      message: 'Redirect to Paystack',
      authorization_url: response.data.data.authorization_url,
      reference
    });
  } catch (err) {
    console.error('Fund error:', err.response?.data || err.message);
    res.status(500).json({ message: 'Payment initialization failed' });
  }
};

// ==================== PAYSTACK WEBHOOK HANDLER ====================
exports.handleWebhook = async (req, res) => {
  try {
    const hash = crypto
      .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
      .update(JSON.stringify(req.body))
      .digest('hex');

    if (hash !== req.headers['x-paystack-signature']) {
      return res.status(400).send('Invalid signature');
    }

    const event = req.body;

    if (event.event === 'charge.success' && event.data.metadata.type === 'wallet_fund') {
      const { userId, amount, reference } = {
        userId: event.data.metadata.userId,
        amount: event.data.amount / 100,
        reference: event.data.reference
      };

      // Add to queue for safe processing
      await webhookQueue.add('credit_wallet', { userId, amount, reference });
    }

    res.sendStatus(200);
  } catch (err) {
    console.error('Webhook error:', err);
    res.sendStatus(500);
  }
};

// ==================== TRANSFER MONEY (REDIS LOCK - NO NEGATIVE BALANCE!) ====================
exports.transfer = async (req, res) => {
  try {
    const { email, amount } = req.body;

    if (!email || !amount || amount < 50 || isNaN(amount)) {
      return res.status(400).json({ message: 'Valid email and amount ≥ ₦50 required' });
    }

    const sender = req.user;
    if (sender.walletBalance < amount) {
      return res.status(400).json({ message: 'Insufficient balance' });
    }

    const receiver = await User.findOne({ email });
    if (!receiver) return res.status(404).json({ message: 'Receiver not found' });
    if (receiver._id.toString() === sender._id.toString()) {
      return res.status(400).json({ message: 'Cannot transfer to yourself' });
    }

    // REDIS DISTRIBUTED LOCK - PREVENT RACE CONDITION
    const lockKey = `transfer_lock:${sender._id}`;
    const lockAcquired = await redis.set(lockKey, 'locked', 'EX', 15, 'NX');

    if (!lockAcquired) {
      return res.status(429).json({
        message: 'Transfer already in progress. Please wait 15 seconds.'
      });
    }

    try {
      // Re-fetch fresh sender data
      const freshSender = await User.findById(sender._id);
      if (freshSender.walletBalance < amount) {
        return res.status(400).json({ message: 'Insufficient funds after verification' });
      }

      // Perform transfer
      freshSender.walletBalance -= amount;
      receiver.walletBalance += amount;

      const transferRef = `trf_${Date.now()}_${sender._id.toString().slice(-6)}`;

      freshSender.transactions.push({
        type: 'debit',
        amount,
        reference: transferRef,
        description: `Sent to ${receiver.name}`
      });

      receiver.transactions.push({
        type: 'credit',
        amount,
        reference: transferRef,
        description: `From ${freshSender.name}`
      });

      await Promise.all([freshSender.save(), receiver.save()]);

      // Update current session
      req.user.walletBalance = freshSender.walletBalance;

      res.json({
        message: 'Transfer successful!',
        newBalance: freshSender.walletBalance,
        amountTransferred: amount,
        receiver: receiver.name,
        reference: transferRef
      });
    } catch (err) {
      console.error('Transfer error:', err);
      res.status(500).json({ message: 'Transfer failed. Please try again.' });
    } finally {
      await redis.del(lockKey); // Always release lock
    }
  } catch (err) {
    res.status(500).json({ message: 'Server error during transfer' });
  }
};

// ==================== GET BALANCE ====================
exports.getBalance = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('walletBalance');
    res.json({ balance: user.walletBalance });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch balance' });
  }
};

// ==================== GET TRANSACTIONS ====================
exports.getTransactions = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('transactions');
    res.json({ transactions: user.transactions.reverse() });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch transactions' });
  }
};

// ==================== BULLMQ WORKER - PROCESSES WEBHOOK CREDITS SAFELY ====================
const worker = new Worker(
  'webhook',
  async (job) => {
    if (job.name === 'credit_wallet') {
      const { userId, amount, reference } = job.data;

      const lockKey = `fund_lock:${userId}`;
      const lockAcquired = await redis.set(lockKey, '1', 'EX', 10, 'NX');
      if (!lockAcquired) {
        console.log('Funding already processing for user:', userId);
        return;
      }

      try {
        const user = await User.findById(userId);
        if (user && !user.transactions.some(t => t.reference === reference)) {
          user.walletBalance += amount;
          user.transactions.push({
            type: 'credit',
            amount,
            reference,
            description: 'Wallet funding via Paystack'
          });
          await user.save();
          console.log(`Credited ₦${amount} to ${user.email}`);
        }
      } catch (err) {
        console.error('Worker error:', err);
      } finally {
        await redis.del(lockKey);
      }
    }
  },
  { connection: redis }
);

// Log worker events
worker.on('completed', (job) => console.log(`Job ${job.id} completed`));
worker.on('failed', (job, err) => console.log(`Job ${job?.id} failed:`, err.message));
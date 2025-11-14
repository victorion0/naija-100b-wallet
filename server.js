require('dotenv').config();
const express = require('express');
const bcrypt = require('bcryptjs');
const cors = require('cors');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cors({ origin: '*', credentials: true }));

let users = [];

// FAVICON — STOP 502 ON BROWSER AUTO-REQUEST
app.get('/favicon.ico', (req, res) => res.status(204).send());

// ROOT — FAST HEALTH CHECK FOR LEAPCELL PROXY
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: "₦100B WALLET LIVE ON LEAPCELL — BUILD FIXED NOV 14 2025!",
    status: "PROXY CONNECTED — NO MORE RUN ERROR",
    time: new Date().toLocaleString('en-NG')
  });
});

// HEALTH CHECK
app.get('/health', (req, res) => res.status(200).json({ status: 'healthy' }));

// REGISTER
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email & password required" });
    
    if (users.find(u => u.email === email)) return res.status(400).json({ error: "User exists" });

    const hashed = await bcrypt.hash(password, 10);
    users.push({ name, email, password: hashed, balance: 0 });

    res.json({ success: true, message: "REGISTERED! FUND ₦100B NOW" });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: "Server error" });
  }
});

// FUND ₦100B
app.post('/api/wallet/fund', async (req, res) => {
  try {
    const { email, amount, reference } = req.body;
    if (!email || !amount) return res.status(400).json({ error: "Email & amount required" });

    let user = users.find(u => u.email === email);
    if (!user) {
      user = { name: "Leapcell User", email, balance: 0 };
      users.push(user);
    }

    user.balance += Number(amount);
    
    res.json({
      success: true,
      message: `₦${Number(amount).toLocaleString()} FUNDED! LEAPCELL LIVE!`,
      newBalance: user.balance,
      reference: reference || "leapcell-fixed-2025",
      alert: "FREE HOSTING = CLIENTS GO PAY $50K+"
    });
  } catch (err) {
    console.error('Fund error:', err);
    res.status(500).json({ error: "Funding error" });
  }
});

// BALANCE
app.post('/api/wallet/balance', (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email required" });

    const user = users.find(u => u.email === email);
    res.json({ 
      success: true,
      balance: user ? user.balance : 0,
      message: user ? "MONEY DEY!" : "FUND FIRST!"
    });
  } catch (err) {
    res.status(500).json({ error: "Balance error" });
  }
});

// 404 CATCH-ALL
app.use('*', (req, res) => res.status(404).json({ error: "Not found" }));

// GLOBAL ERROR HANDLER
app.use((err, req, res, next) => {
  console.error('Global error:', err);
  res.status(500).json({ error: "Server running" });
});

// LEAPCELL PORT BIND (DYNAMIC + 0.0.0.0)
const PORT = process.env.PORT || 3000;  // Leapcell default 3000
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 ₦100B WALLET LIVE ON LEAPCELL PORT ${PORT}`);
  console.log(`BUILD FIXED — NOV 14 2025!`);
});
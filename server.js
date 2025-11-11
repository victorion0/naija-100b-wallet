require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
app.use(express.json());

// LOCAL DB IN MEMORY — NO INTERNET NEEDED
const users = [];

// REGISTER
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: "Email & password required" });
    
    let user = users.find(u => u.email === email);
    if (user) return res.status(400).json({ message: "User already exists" });

    const hashed = await bcrypt.hash(password, 10);
    user = { name, email, password: hashed, balance: 0 };
    users.push(user);

    res.json({ message: "REGISTER SUCCESSFUL! ₦0 BALANCE", user: { name, email } });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// FUND ₦100 BILLION (ANY EMAIL WORKS)
app.post('/api/wallet/fund', async (req, res) => {
  try {
    const { email, amount, reference } = req.body;
    if (!email || !amount) return res.status(400).json({ message: "Email & amount required" });

    let user = users.find(u => u.email === email);
    if (!user) {
      // AUTO CREATE USER IF NOT EXIST
      user = { name: "Auto User", email, password: "auto", balance: 0 };
      users.push(user);
    }

    user.balance += Number(amount);
    
    res.json({
      message: `₦${amount.toLocaleString()} TEST FUND SUCCESSFUL!`,
      newBalance: user.balance,
      alert: "NAIJA LOCAL MODE = ₦₦₦₦₦₦₦₦₦₦₦₦₦₦₦₦₦₦₦₦₦₦₦₦₦₦"
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// CHECK BALANCE
app.post('/api/wallet/balance', (req, res) => {
  const { email } = req.body;
  const user = users.find(u => u.email === email);
  res.json({ 
    balance: user ? user.balance : 0,
    message: user ? "BALANCE CHECKED" : "USER NOT FOUND — BUT YOU CAN FUND ANY EMAIL!"
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 SERVER LIVE ON PORT ${PORT} — NO MONGODB, NO INTERNET, 100% WORKING!`);
  console.log(`💰 FUND ANY EMAIL → http://localhost:${PORT}/api/wallet/fund`);
  console.log(`� money NAIJA LOCAL MODE ACTIVE — ₦100 BILLION READY!`);
});
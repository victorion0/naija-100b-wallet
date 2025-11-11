const User = require('../models/user');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const redis = require('../config/redis');

// Generate JWT
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '30d' });
};

// Register
exports.register = async (req, res) => {
  const { name, email, password } = req.body;
  const userExists = await User.findOne({ email });
  if (userExists) return res.status(400).json({ message: 'User exists' });

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  const verificationToken = crypto.randomBytes(32).toString('hex');
  await redis.set(`verify:${verificationToken}`, email, 'EX', 3600);

  const user = await User.create({
    name, email, password: hashedPassword,
    verificationToken
  });

  // Send email
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
  });

  const verifyUrl = `${process.env.BASE_URL}/api/auth/verify/${verificationToken}`;
  await transporter.sendMail({
    to: email,
    subject: 'Verify Your Wallet Account',
    html: `<h3>Click to verify:</h3><a href="${verifyUrl}">Verify Now</a>`
  });

  res.status(201).json({ message: 'Check your email to verify' });
};

// Verify Email
exports.verifyEmail = async (req, res) => {
  const token = req.params.token;
  const email = await redis.get(`verify:${token}`);
  if (!email) return res.status(400).json({ message: 'Invalid token' });

  const user = await User.findOneAndUpdate(
    { email },
    { isVerified: true, verificationToken: null },
    { new: true }
  );

  await redis.del(`verify:${token}`);
  res.json({ message: 'Email verified! You can now login.' });
};

// Login
exports.login = async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (!user || !await bcrypt.compare(password, user.password)) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }
  if (!user.isVerified) return res.status(401).json({ message: 'Verify email first' });

  res.json({
    token: generateToken(user._id),
    user: { id: user._id, name: user.name, email: user.email, balance: user.walletBalance }
  });
};
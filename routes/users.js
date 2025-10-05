const express = require('express');
const User = require('../models/User');
const { protect, admin } = require('../middleware/auth');

const router = express.Router();

// @desc    Get all agents (for ticket assignment)
// @route   GET /api/users/agents
// @access  Private (Admin)
router.get('/agents', protect, admin, async (req, res) => {
  try {
    const agents = await User.find({ role: 'agent', isActive: true })
      .select('-password')
      .sort({ name: 1 });
    res.json(agents);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// @desc    Get all users (for admin management)
// @route   GET /api/users
// @access  Private (Admin)
router.get('/', protect, admin, async (req, res) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    res.json(users);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

module.exports = router;
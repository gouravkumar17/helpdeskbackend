const express = require('express');
const {
  createTicket,
  getTickets,
  getTicket,
  updateTicket,
  addComment,
  getDashboardStats,
} = require('../controllers/ticketController');
const { protect, admin } = require('../middleware/auth');

const router = express.Router();

router.route('/')
  .post(protect, createTicket)
  .get(protect, getTickets);

router.route('/:id')
  .get(protect, getTicket)
  .put(protect, updateTicket);

router.post('/:id/comments', protect, addComment);
router.get('/dashboard/stats', protect, admin, getDashboardStats);

module.exports = router;
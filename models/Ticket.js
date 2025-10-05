const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  text: {
    type: String,
    required: true
  },
  isInternal: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

const ticketSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Please add a title'],
    trim: true,
    maxlength: 100
  },
  description: {
    type: String,
    required: [true, 'Please add a description'],
    trim: true
  },
  status: {
    type: String,
    enum: ['open', 'pending', 'resolved', 'closed'],
    default: 'open'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  category: {
    type: String,
    required: true,
    enum: ['technical', 'billing', 'general', 'feature-request', 'bug']
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  slaDeadline: {
    type: Date,
    required: true
  },
  comments: [commentSchema],
  resolutionTime: {
    type: Number, // in minutes
    default: null
  },
  resolvedAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Calculate SLA status based on deadline
ticketSchema.virtual('slaStatus').get(function() {
  if (this.status === 'resolved' || this.status === 'closed') {
    return 'completed';
  }
  
  const now = new Date();
  const timeRemaining = this.slaDeadline - now;
  
  if (timeRemaining < 0) {
    return 'breached';
  } else if (timeRemaining < 2 * 60 * 60 * 1000) { // 2 hours
    return 'warning';
  } else {
    return 'normal';
  }
});

// Calculate resolution time when ticket is resolved
ticketSchema.methods.calculateResolutionTime = function() {
  if (this.status === 'resolved' && this.resolvedAt) {
    const createdTime = new Date(this.createdAt);
    const resolvedTime = new Date(this.resolvedAt);
    this.resolutionTime = Math.round((resolvedTime - createdTime) / (1000 * 60)); // in minutes
  }
};

module.exports = mongoose.model('Ticket', ticketSchema);
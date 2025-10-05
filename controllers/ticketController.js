const Ticket = require('../models/Ticket');

// @desc    Create a ticket
// @route   POST /api/tickets
// @access  Private
const createTicket = async (req, res) => {
  try {
    const { title, description, category, priority } = req.body;

    // Validate required fields
    if (!title || !description || !category || !priority) {
      return res.status(400).json({ 
        message: 'Please provide title, description, category, and priority' 
      });
    }

    // Calculate SLA deadline (24 hours from creation)
    const slaDeadline = new Date();
    slaDeadline.setHours(slaDeadline.getHours() + 24);

    const ticket = await Ticket.create({
      title,
      description,
      category,
      priority,
      createdBy: req.user.id,
      slaDeadline
    });

    const populatedTicket = await Ticket.findById(ticket._id)
      .populate('createdBy', 'name email')
      .populate('assignedTo', 'name email');

    console.log(`Ticket created by user ${req.user.id}: ${ticket._id}`);
    
    res.status(201).json(populatedTicket);
  } catch (error) {
    console.error('Error creating ticket:', error);
    res.status(400).json({ message: error.message });
  }
};

// @desc    Get all tickets
// @route   GET /api/tickets
// @access  Private
const getTickets = async (req, res) => {
  try {
    let query = {};
    
    console.log(`User ${req.user.id} (${req.user.role}) fetching tickets`);
    
    // Regular users can only see their own tickets
    if (req.user.role === 'user') {
      query.createdBy = req.user.id;
      console.log('Filtering tickets for user:', req.user.id);
    }
    
    // Agents can ONLY see tickets assigned to them (no unassigned tickets)
    if (req.user.role === 'agent') {
      query.assignedTo = req.user.id;
      console.log('Filtering tickets for agent (assigned only):', req.user.id);
    }

    // Admin can see all tickets (no query filter)
    if (req.user.role === 'admin') {
      console.log('Admin fetching all tickets');
    }

    const tickets = await Ticket.find(query)
      .populate('createdBy', 'name email')
      .populate('assignedTo', 'name email')
      .sort({ createdAt: -1 });

    console.log(`User ${req.user.id} (${req.user.role}) found ${tickets.length} tickets`);
    
    res.json(tickets);
  } catch (error) {
    console.error('Error fetching tickets:', error);
    res.status(400).json({ message: error.message });
  }
};

// @desc    Get single ticket
// @route   GET /api/tickets/:id
// @access  Private
const getTicket = async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id)
      .populate('createdBy', 'name email')
      .populate('assignedTo', 'name email')
      .populate('comments.user', 'name email');

    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    // Check if user has access to this ticket
    if (req.user.role === 'user') {
      const createdById = ticket.createdBy._id ? ticket.createdBy._id.toString() : ticket.createdBy.toString();
      if (createdById !== req.user.id) {
        console.log(`User ${req.user.id} denied access to ticket ${ticket._id}`);
        return res.status(403).json({ message: 'Access denied' });
      }
    }

    // Agents can ONLY access tickets assigned to them (no unassigned tickets)
    if (req.user.role === 'agent') {
      const assignedToId = ticket.assignedTo ? 
        (ticket.assignedTo._id ? ticket.assignedTo._id.toString() : ticket.assignedTo.toString()) 
        : null;
      
      if (!assignedToId || assignedToId !== req.user.id) {
        console.log(`Agent ${req.user.id} denied access to ticket ${ticket._id}`);
        return res.status(403).json({ message: 'Access denied. This ticket is not assigned to you.' });
      }
    }

    console.log(`User ${req.user.id} accessed ticket ${ticket._id}`);
    res.json(ticket);
  } catch (error) {
    console.error('Error fetching ticket:', error);
    res.status(400).json({ message: error.message });
  }
};

// @desc    Update ticket
// @route   PUT /api/tickets/:id
// @access  Private
const updateTicket = async (req, res) => {
  try {
    let ticket = await Ticket.findById(req.params.id);

    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    // Check permissions
    if (req.user.role === 'user') {
      const createdById = ticket.createdBy._id ? ticket.createdBy._id.toString() : ticket.createdBy.toString();
      if (createdById !== req.user.id) {
        return res.status(403).json({ message: 'Access denied' });
      }
    }

    // Agents can only update tickets assigned to them
    if (req.user.role === 'agent') {
      const assignedToId = ticket.assignedTo ? 
        (ticket.assignedTo._id ? ticket.assignedTo._id.toString() : ticket.assignedTo.toString()) 
        : null;
      
      if (!assignedToId || assignedToId !== req.user.id) {
        return res.status(403).json({ message: 'Access denied. Ticket not assigned to you.' });
      }
    }

    // Set resolvedAt if status is being changed to resolved
    if (req.body.status === 'resolved' && ticket.status !== 'resolved') {
      req.body.resolvedAt = new Date();
    }

    // Calculate resolution time if ticket is being resolved
    if (req.body.status === 'resolved' && ticket.status !== 'resolved') {
      const createdTime = new Date(ticket.createdAt);
      const resolvedTime = new Date();
      req.body.resolutionTime = Math.round((resolvedTime - createdTime) / (1000 * 60)); // in minutes
    }

    ticket = await Ticket.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    )
    .populate('createdBy', 'name email')
    .populate('assignedTo', 'name email')
    .populate('comments.user', 'name email');

    console.log(`Ticket ${ticket._id} updated by user ${req.user.id}`);
    
    res.json(ticket);
  } catch (error) {
    console.error('Error updating ticket:', error);
    res.status(400).json({ message: error.message });
  }
};

// @desc    Add comment to ticket
// @route   POST /api/tickets/:id/comments
// @access  Private
const addComment = async (req, res) => {
  try {
    const { text, isInternal } = req.body;
    
    if (!text || text.trim() === '') {
      return res.status(400).json({ message: 'Comment text is required' });
    }
    
    const ticket = await Ticket.findById(req.params.id);

    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    // Check permissions
    if (req.user.role === 'user') {
      const createdById = ticket.createdBy._id ? ticket.createdBy._id.toString() : ticket.createdBy.toString();
      if (createdById !== req.user.id) {
        return res.status(403).json({ message: 'Access denied' });
      }
    }

    // Agents can only comment on tickets assigned to them
    if (req.user.role === 'agent') {
      const assignedToId = ticket.assignedTo ? 
        (ticket.assignedTo._id ? ticket.assignedTo._id.toString() : ticket.assignedTo.toString()) 
        : null;
      
      if (!assignedToId || assignedToId !== req.user.id) {
        return res.status(403).json({ message: 'Access denied. Ticket not assigned to you.' });
      }
    }

    const comment = {
      user: req.user.id,
      text: text.trim(),
      isInternal: isInternal || false
    };

    ticket.comments.push(comment);
    await ticket.save();

    const updatedTicket = await Ticket.findById(req.params.id)
      .populate('createdBy', 'name email')
      .populate('assignedTo', 'name email')
      .populate('comments.user', 'name email');

    console.log(`Comment added to ticket ${ticket._id} by user ${req.user.id}`);
    
    res.json(updatedTicket);
  } catch (error) {
    console.error('Error adding comment:', error);
    res.status(400).json({ message: error.message });
  }
};

// @desc    Get dashboard stats
// @route   GET /api/tickets/dashboard/stats
// @access  Private (Admin/Agent)
const getDashboardStats = async (req, res) => {
  try {
    // Base query for stats - admin sees all, agents see ONLY their assigned tickets
    let statsQuery = {};
    
    if (req.user.role === 'agent') {
      statsQuery.assignedTo = req.user.id; // Only assigned tickets for agents
    }

    // Basic counts
    const totalTickets = await Ticket.countDocuments(statsQuery);
    const openTickets = await Ticket.countDocuments({ ...statsQuery, status: 'open' });
    const pendingTickets = await Ticket.countDocuments({ ...statsQuery, status: 'pending' });
    const resolvedTickets = await Ticket.countDocuments({ ...statsQuery, status: 'resolved' });
    const closedTickets = await Ticket.countDocuments({ ...statsQuery, status: 'closed' });

    // Calculate average resolution time for resolved tickets
    const resolvedTicketsWithTime = await Ticket.find({ 
      ...statsQuery,
      status: 'resolved', 
      resolutionTime: { $ne: null, $gt: 0 } 
    });
    
    const avgResolutionTime = resolvedTicketsWithTime.length > 0 
      ? resolvedTicketsWithTime.reduce((acc, ticket) => acc + ticket.resolutionTime, 0) / resolvedTicketsWithTime.length
      : 0;

    // Tickets by priority
    const priorityStats = await Ticket.aggregate([
      { $match: statsQuery },
      {
        $group: {
          _id: '$priority',
          count: { $sum: 1 }
        }
      }
    ]);

    // Tickets by category
    const categoryStats = await Ticket.aggregate([
      { $match: statsQuery },
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 }
        }
      }
    ]);

    // Tickets by status
    const statusStats = await Ticket.aggregate([
      { $match: statsQuery },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    // Recent activity (last 7 days)
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    
    const recentTickets = await Ticket.countDocuments({
      ...statsQuery,
      createdAt: { $gte: oneWeekAgo }
    });

    // SLA compliance calculation
    const resolvedAndClosedTickets = await Ticket.find({
      ...statsQuery,
      status: { $in: ['resolved', 'closed'] },
      resolvedAt: { $exists: true, $ne: null }
    }).select('resolvedAt slaDeadline');

    let slaCompliantTickets = 0;
    let totalResolvedWithSLA = 0;

    resolvedAndClosedTickets.forEach(ticket => {
      if (ticket.resolvedAt && ticket.slaDeadline) {
        totalResolvedWithSLA++;
        if (ticket.resolvedAt <= ticket.slaDeadline) {
          slaCompliantTickets++;
        }
      }
    });

    const slaComplianceRate = totalResolvedWithSLA > 0 
      ? Math.round((slaCompliantTickets / totalResolvedWithSLA) * 100)
      : 0;

    // Current SLA status breakdown for all tickets
    const allTickets = await Ticket.find(statsQuery).select('status slaDeadline resolvedAt');
    
    let slaNormal = 0;
    let slaWarning = 0;
    let slaBreached = 0;

    const now = new Date();
    allTickets.forEach(ticket => {
      // Skip resolved/closed tickets for current SLA status
      if (ticket.status === 'resolved' || ticket.status === 'closed') {
        return;
      }

      if (!ticket.slaDeadline) {
        return;
      }

      const timeRemaining = ticket.slaDeadline - now;

      if (timeRemaining < 0) {
        slaBreached++;
      } else if (timeRemaining < 2 * 60 * 60 * 1000) { // 2 hours
        slaWarning++;
      } else {
        slaNormal++;
      }
    });

    console.log(`Dashboard stats fetched for user ${req.user.id} (${req.user.role})`);

    res.json({
      // Basic counts
      totalTickets,
      openTickets,
      pendingTickets,
      resolvedTickets,
      closedTickets,
      
      // Performance metrics
      avgResolutionTime: Math.round(avgResolutionTime),
      slaComplianceRate,
      slaCompliantTickets,
      
      // Distributions
      priorityStats,
      categoryStats,
      statusStats,
      
      // Activity
      recentTickets,
      
      // Current SLA status
      slaStatus: {
        normal: slaNormal,
        warning: slaWarning,
        breached: slaBreached
      }
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(400).json({ message: error.message });
  }
};

// @desc    Get user's tickets (for regular users)
// @route   GET /api/tickets/my-tickets
// @access  Private (User)
const getMyTickets = async (req, res) => {
  try {
    const tickets = await Ticket.find({ createdBy: req.user.id })
      .populate('createdBy', 'name email')
      .populate('assignedTo', 'name email')
      .sort({ createdAt: -1 });

    console.log(`User ${req.user.id} fetched ${tickets.length} of their own tickets`);
    
    res.json(tickets);
  } catch (error) {
    console.error('Error fetching user tickets:', error);
    res.status(400).json({ message: error.message });
  }
};

// @desc    Get agent's assigned tickets
// @route   GET /api/tickets/assigned
// @access  Private (Agent)
const getAssignedTickets = async (req, res) => {
  try {
    const tickets = await Ticket.find({
      assignedTo: req.user.id
    })
      .populate('createdBy', 'name email')
      .populate('assignedTo', 'name email')
      .sort({ createdAt: -1 });

    console.log(`Agent ${req.user.id} fetched ${tickets.length} assigned tickets`);
    
    res.json(tickets);
  } catch (error) {
    console.error('Error fetching assigned tickets:', error);
    res.status(400).json({ message: error.message });
  }
};

module.exports = {
  createTicket,
  getTickets,
  getTicket,
  updateTicket,
  addComment,
  getDashboardStats,
  getMyTickets,
  getAssignedTickets
};
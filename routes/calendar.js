const express = require('express');
const router = express.Router();
const { google } = require('googleapis');
const Event = require('../models/Event');
const Supplier = require('../models/Supplier');
const { getAuthenticatedClient } = require('./google');

// Send Google Calendar invitation for an event
router.post('/send-invite', async (req, res) => {
  try {
    const { eventId, supplierIds } = req.body;

    // Check Google connection
    const auth = getAuthenticatedClient();
    if (!auth) {
      return res.status(401).json({ message: 'Google account not connected. Go to Settings to connect.' });
    }

    // Get event with populated participants
    const event = await Event.findById(eventId).populate('participants.supplierId');
    if (!event) return res.status(404).json({ message: 'Event not found' });

    // Determine which suppliers to invite
    let suppliersToInvite = [];
    if (supplierIds && supplierIds.length > 0) {
      // Invite specific suppliers
      for (const sid of supplierIds) {
        const supplier = await Supplier.findById(sid);
        if (supplier && supplier.email) {
          suppliersToInvite.push(supplier);
        }
      }
    } else {
      // Invite all participants with email
      for (const p of event.participants) {
        const supplier = await Supplier.findById(p.supplierId._id || p.supplierId);
        if (supplier && supplier.email) {
          suppliersToInvite.push(supplier);
        }
      }
    }

    if (suppliersToInvite.length === 0) {
      return res.status(400).json({ message: 'No suppliers with email addresses found. Add emails to suppliers first.' });
    }

    const calendar = google.calendar({ version: 'v3', auth });

    // Build event date (set to full day if no specific time)
    const eventDate = new Date(event.date);
    const startDateTime = eventDate.toISOString();
    const endDate = new Date(eventDate);
    endDate.setHours(endDate.getHours() + 4); // Default 4 hour event
    const endDateTime = endDate.toISOString();

    // Currency symbol
    const currSymbol = event.currency === 'Dollar' ? '$' : event.currency === 'Euro' ? '€' : '₪';

    // Build description with event details
    let description = `🎵 אירוע: ${event.title}\n`;
    description += `📅 תאריך: ${eventDate.toLocaleDateString('he-IL')}\n`;
    if (event.location) description += `📍 מיקום: ${event.location}\n`;
    if (event.phone_number) description += `📞 טלפון בעל אירוע: ${event.phone_number}\n`;
    description += `\n--- פרטי שכר ---\n`;

    // Add individual pay info per supplier in description
    for (const supplier of suppliersToInvite) {
      const participant = event.participants.find(
        p => (p.supplierId._id || p.supplierId).toString() === supplier._id.toString()
      );
      if (participant) {
        description += `${supplier.name} (${supplier.role}): ${currSymbol}${participant.expectedPay}\n`;
      }
    }

    const attendees = suppliersToInvite.map(s => ({ email: s.email }));

    const calendarEvent = {
      summary: event.title,
      location: event.location || '',
      description,
      start: { dateTime: startDateTime, timeZone: 'Asia/Jerusalem' },
      end: { dateTime: endDateTime, timeZone: 'Asia/Jerusalem' },
      attendees,
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 24 * 60 }, // 1 day before
          { method: 'popup', minutes: 60 },       // 1 hour before
        ],
      },
      sendUpdates: 'all', // Send email notifications to attendees
    };

    const result = await calendar.events.insert({
      calendarId: 'primary',
      resource: calendarEvent,
      sendUpdates: 'all',
    });

    res.json({
      message: `Calendar invite sent to ${suppliersToInvite.length} suppliers`,
      calendarEventId: result.data.id,
      calendarLink: result.data.htmlLink,
      invitedSuppliers: suppliersToInvite.map(s => ({ name: s.name, email: s.email })),
    });
  } catch (error) {
    console.error('Calendar invite error:', error);
    if (error.code === 401 || error.message?.includes('invalid_grant')) {
      return res.status(401).json({ message: 'Google token expired. Please reconnect in Settings.' });
    }
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;

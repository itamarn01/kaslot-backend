const express = require('express');
const router = express.Router();
const { google } = require('googleapis');
const Event = require('../models/Event');
const Supplier = require('../models/Supplier');
const { getAuthenticatedClient } = require('./google');
const { authMiddleware } = require('../middleware/auth');

// All routes require authentication
router.use(authMiddleware);

// ========== LIST GOOGLE CALENDARS ==========
router.get('/calendars', async (req, res) => {
  try {
    const auth = await getAuthenticatedClient(req.userId);
    if (!auth) {
      return res.status(401).json({ message: 'Google account not connected. Go to Settings to connect.' });
    }

    const calendar = google.calendar({ version: 'v3', auth });
    const response = await calendar.calendarList.list();
    
    const calendars = (response.data.items || []).map(cal => ({
      id: cal.id,
      summary: cal.summary,
      description: cal.description || '',
      primary: cal.primary || false,
      backgroundColor: cal.backgroundColor || '#4285f4',
    }));

    res.json({ calendars });
  } catch (error) {
    console.error('List calendars error:', error);
    if (error.code === 401 || error.message?.includes('invalid_grant')) {
      return res.status(401).json({ message: 'Google token expired. Please reconnect in Settings.' });
    }
    res.status(500).json({ message: error.message });
  }
});

// ========== LIST EVENTS FROM A SPECIFIC GOOGLE CALENDAR ==========
router.get('/calendars/:calendarId/events', async (req, res) => {
  try {
    const auth = await getAuthenticatedClient(req.userId);
    if (!auth) {
      return res.status(401).json({ message: 'Google account not connected.' });
    }

    const calendar = google.calendar({ version: 'v3', auth });
    const calendarId = decodeURIComponent(req.params.calendarId);

    // Get events from the start of the current year
    const startOfYear = new Date(new Date().getFullYear(), 0, 1).toISOString();

    const response = await calendar.events.list({
      calendarId,
      timeMin: startOfYear,
      maxResults: 250,
      singleEvents: true,
      orderBy: 'startTime',
    });

    // Find already-imported calendar event IDs for this user
    const importedEvents = await Event.find({
      userId: req.userId,
      fromGoogleCalendar: true,
      googleCalendarId: calendarId,
    }).select('googleCalendarEventId');
    const importedIds = new Set(importedEvents.map(e => e.googleCalendarEventId));

    const events = (response.data.items || [])
      .filter(ev => ev.status !== 'cancelled')
      .map(ev => {
        const start = ev.start?.dateTime || ev.start?.date;
        const end = ev.end?.dateTime || ev.end?.date;
        return {
          id: ev.id,
          summary: ev.summary || '(ללא כותרת)',
          location: ev.location || '',
          start,
          end,
          description: ev.description || '',
          alreadyImported: importedIds.has(ev.id),
        };
      });

    res.json({ events, calendarId });
  } catch (error) {
    console.error('List calendar events error:', error);
    if (error.code === 401 || error.message?.includes('invalid_grant')) {
      return res.status(401).json({ message: 'Google token expired. Please reconnect in Settings.' });
    }
    res.status(500).json({ message: error.message });
  }
});

// ========== IMPORT SELECTED GOOGLE CALENDAR EVENTS ==========
router.post('/import-events', async (req, res) => {
  try {
    const { calendarId, eventIds } = req.body;
    if (!calendarId || !eventIds || eventIds.length === 0) {
      return res.status(400).json({ message: 'Missing calendarId or eventIds' });
    }

    const auth = await getAuthenticatedClient(req.userId);
    if (!auth) {
      return res.status(401).json({ message: 'Google account not connected.' });
    }

    const calendar = google.calendar({ version: 'v3', auth });
    const imported = [];
    const skipped = [];

    for (const gcalEventId of eventIds) {
      // Check if already imported
      const existing = await Event.findOne({
        userId: req.userId,
        googleCalendarEventId: gcalEventId,
        googleCalendarId: calendarId,
      });
      if (existing) {
        skipped.push(gcalEventId);
        continue;
      }

      // Fetch the event from Google Calendar
      try {
        const gcalEvent = await calendar.events.get({
          calendarId: decodeURIComponent(calendarId),
          eventId: gcalEventId,
        });

        const ev = gcalEvent.data;
        const startDate = ev.start?.dateTime || ev.start?.date;

        const newEvent = new Event({
          userId: req.userId,
          title: ev.summary || '(ללא כותרת)',
          date: new Date(startDate),
          location: ev.location || '',
          totalPrice: 0,
          currency: 'Shekel',
          eventType: 'אחר',
          fromGoogleCalendar: true,
          googleCalendarEventId: gcalEventId,
          googleCalendarId: calendarId,
        });

        await newEvent.save();
        imported.push(newEvent._id);
      } catch (fetchErr) {
        console.error(`Failed to fetch GCal event ${gcalEventId}:`, fetchErr.message);
        skipped.push(gcalEventId);
      }
    }

    res.json({
      message: `יובאו ${imported.length} אירועים בהצלחה${skipped.length > 0 ? `, ${skipped.length} דולגו (כבר קיימים)` : ''}`,
      imported: imported.length,
      skipped: skipped.length,
    });
  } catch (error) {
    console.error('Import calendar events error:', error);
    res.status(500).json({ message: error.message });
  }
});

// ========== SYNC IMPORTED GOOGLE CALENDAR EVENTS ==========
router.post('/sync', async (req, res) => {
  try {
    const auth = await getAuthenticatedClient(req.userId);
    if (!auth) {
      return res.status(401).json({ message: 'Google account not connected.' });
    }

    const calendar = google.calendar({ version: 'v3', auth });

    // Find all Google Calendar events for this user
    const gcalEvents = await Event.find({
      userId: req.userId,
      fromGoogleCalendar: true,
    });

    if (gcalEvents.length === 0) {
      return res.json({ message: 'אין אירועים מסונכרנים מיומן Google', synced: 0, deleted: 0, updated: 0 });
    }

    // Group by calendarId
    const byCalendar = {};
    for (const ev of gcalEvents) {
      const cId = ev.googleCalendarId;
      if (!byCalendar[cId]) byCalendar[cId] = [];
      byCalendar[cId].push(ev);
    }

    let deleted = 0;
    let updated = 0;

    for (const [calendarId, events] of Object.entries(byCalendar)) {
      for (const localEvent of events) {
        try {
          const gcalEvent = await calendar.events.get({
            calendarId: decodeURIComponent(calendarId),
            eventId: localEvent.googleCalendarEventId,
          });

          const ev = gcalEvent.data;

          // If event was cancelled/deleted in Google Calendar
          if (ev.status === 'cancelled') {
            await Event.findByIdAndDelete(localEvent._id);
            deleted++;
            continue;
          }

          // Check for updates
          const newTitle = ev.summary || '(ללא כותרת)';
          const newDate = new Date(ev.start?.dateTime || ev.start?.date);
          const newLocation = ev.location || '';

          let changed = false;
          if (localEvent.title !== newTitle) {
            localEvent.title = newTitle;
            changed = true;
          }
          if (localEvent.date.getTime() !== newDate.getTime()) {
            localEvent.date = newDate;
            changed = true;
          }
          if ((localEvent.location || '') !== newLocation) {
            localEvent.location = newLocation;
            changed = true;
          }

          if (changed) {
            await localEvent.save();
            updated++;
          }
        } catch (fetchErr) {
          // If event not found (404), it means it was deleted
          if (fetchErr.code === 404 || fetchErr.response?.status === 404) {
            await Event.findByIdAndDelete(localEvent._id);
            deleted++;
          } else {
            console.error(`Sync error for event ${localEvent.googleCalendarEventId}:`, fetchErr.message);
          }
        }
      }
    }

    res.json({
      message: `סנכרון הושלם: ${updated} עודכנו, ${deleted} נמחקו`,
      synced: gcalEvents.length,
      updated,
      deleted,
    });
  } catch (error) {
    console.error('Sync error:', error);
    if (error.code === 401 || error.message?.includes('invalid_grant')) {
      return res.status(401).json({ message: 'Google token expired. Please reconnect in Settings.' });
    }
    res.status(500).json({ message: error.message });
  }
});

// ========== SEND GOOGLE CALENDAR INVITE (existing) ==========
router.post('/send-invite', async (req, res) => {
  try {
    const { eventId, supplierIds } = req.body;

    // Check Google connection (now per-user)
    const auth = await getAuthenticatedClient(req.userId);
    if (!auth) {
      return res.status(401).json({ message: 'Google account not connected. Go to Settings to connect.' });
    }

    // Get event with populated participants (scoped to user)
    const event = await Event.findOne({ _id: eventId, userId: req.userId }).populate('participants.supplierId');
    if (!event) return res.status(404).json({ message: 'Event not found' });

    // Determine which suppliers to invite
    let suppliersToInvite = [];
    if (supplierIds && supplierIds.length > 0) {
      for (const sid of supplierIds) {
        const supplier = await Supplier.findById(sid);
        if (supplier && supplier.email) {
          suppliersToInvite.push(supplier);
        }
      }
    } else {
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

    const calendarApi = google.calendar({ version: 'v3', auth });

    const eventDate = new Date(event.date);
    const startDateTime = eventDate.toISOString();
    const endDate = new Date(eventDate);
    endDate.setHours(endDate.getHours() + 4);
    const endDateTime = endDate.toISOString();

    const currSymbol = event.currency === 'Dollar' ? '$' : event.currency === 'Euro' ? '€' : '₪';

    let description = `🎵 אירוע: ${event.title}\n`;
    description += `📅 תאריך: ${eventDate.toLocaleDateString('he-IL')}\n`;
    if (event.location) description += `📍 מיקום: ${event.location}\n`;
    if (event.phone_number) description += `📞 טלפון בעל אירוע: ${event.phone_number}\n`;
    description += `\n--- פרטי שכר ---\n`;

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
          { method: 'email', minutes: 24 * 60 },
          { method: 'popup', minutes: 60 },
        ],
      },
      sendUpdates: 'all',
    };

    const result = await calendarApi.events.insert({
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

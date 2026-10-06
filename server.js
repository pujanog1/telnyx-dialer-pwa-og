require('dotenv').config();
const http = require('http');
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const { WebSocketServer, WebSocket } = require('ws');
const telnyx = require('./telnyx');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');

// Data file paths
const CONTACTS_FILE = path.join(DATA_DIR, 'contacts.json');
const LOGS_FILE = path.join(DATA_DIR, 'logs.json');
const RECORDINGS_FILE = path.join(DATA_DIR, 'recordings.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// JSON file helper functions
function readJson(filePath, fallback = []) {
  try {
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify(fallback, null, 2), 'utf8');
      return fallback;
    }
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data || '[]');
  } catch (err) {
    console.error(`Error reading ${filePath}:`, err.message);
    return fallback;
  }
}

function writeJson(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error(`Error writing ${filePath}:`, err.message);
  }
}

function findContactByPhone(phone) {
  if (!phone) return null;
  const contacts = readJson(CONTACTS_FILE, []);
  const cleanPhone = phone.replace(/[^0-9+]/g, '');
  return contacts.find(c => {
    const contactClean = (c.phone || '').replace(/[^0-9+]/g, '');
    return contactClean === cleanPhone || contactClean.endsWith(cleanPhone.slice(-8));
  }) || null;
}

/**
 * Universal text extractor for Telnyx SMS & WhatsApp inbound webhooks
 */
function extractIncomingMessageText(payload) {
  if (!payload) return '';
  if (typeof payload === 'string') return payload;

  // 1. Telnyx WhatsApp v2 nested structure: payload.body.text.body
  if (payload.body && typeof payload.body === 'object') {
    if (payload.body.text?.body) return String(payload.body.text.body);
    if (typeof payload.body.text === 'string') return payload.body.text;
    if (payload.body.text && typeof payload.body.text === 'object') {
      try {
        if (payload.body.text.body) return String(payload.body.text.body);
      } catch (e) {}
    }
  }

  // 2. Direct text string
  if (typeof payload.text === 'string') return payload.text;
  if (typeof payload.body === 'string') return payload.body;

  // 3. WhatsApp text object: { text: { body: "hello" } }
  if (payload.text && typeof payload.text === 'object') {
    if (payload.text.body) return String(payload.text.body);
  }

  // 3. Meta / WhatsApp Cloud style: { entry: [ { changes: [ { value: { messages: [ { text: { body: "..." } } ] } } ] } ] }
  if (Array.isArray(payload.entry)) {
    for (const entry of payload.entry) {
      if (Array.isArray(entry.changes)) {
        for (const change of entry.changes) {
          const msgs = change.value?.messages;
          if (Array.isArray(msgs) && msgs.length > 0) {
            const firstMsg = msgs[0];
            if (firstMsg.text?.body) return String(firstMsg.text.body);
            if (firstMsg.button?.text) return String(firstMsg.button.text);
            if (firstMsg.interactive?.button_reply?.title) return String(firstMsg.interactive.button_reply.title);
            if (firstMsg.interactive?.list_reply?.title) return String(firstMsg.interactive.list_reply.title);
            if (firstMsg.type) return `[${firstMsg.type.toUpperCase()}]`;
          }
        }
      }
    }
  }

  // 4. Telnyx nested payload / messages array
  if (Array.isArray(payload.messages) && payload.messages.length > 0) {
    const m = payload.messages[0];
    if (typeof m === 'string') return m;
    if (m.text?.body) return String(m.text.body);
    if (m.text) return String(m.text);
    if (m.body) return String(m.body);
  }

  // 5. Media attachment in WhatsApp / MMS
  if (payload.media && Array.isArray(payload.media) && payload.media.length > 0) {
    return `[Media: ${payload.media[0].content_type || 'Attachment'}]`;
  }

  // 6. WhatsApp interactive / template replies
  if (payload.interactive?.button_reply?.title) {
    return String(payload.interactive.button_reply.title);
  }

  // Fallback: If it's still an object, try JSON.stringify or safe string
  try {
    return JSON.stringify(payload);
  } catch (e) {
    return String(payload);
  }
}

function appendLog(entry) {
  const logs = readJson(LOGS_FILE, []);
  const newEntry = {
    id: 'log_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
    timestamp: new Date().toISOString(),
    ...entry
  };
  logs.unshift(newEntry);
  writeJson(LOGS_FILE, logs);
  broadcast('activity_log', newEntry);
  return newEntry;
}

function appendRecording(recording) {
  const recordings = readJson(RECORDINGS_FILE, []);
  const newRec = {
    id: 'rec_' + Date.now(),
    date: new Date().toISOString(),
    audioUrl: '/audio/sample-recording.wav',
    ...recording
  };
  recordings.unshift(newRec);
  writeJson(RECORDINGS_FILE, recordings);
  broadcast('new_recording', newRec);
  return newRec;
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/vendor/telnyx-webrtc', express.static(path.join(__dirname, 'node_modules', '@telnyx', 'webrtc', 'lib')));

// WebSocket Real-time Broadcast
function broadcast(event, payload) {
  const message = JSON.stringify({ event, data: payload, timestamp: new Date().toISOString() });
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

wss.on('connection', (ws) => {
  console.log('[WebSocket] Client connected');
  ws.send(JSON.stringify({
    event: 'welcome',
    data: {
      serverTime: new Date().toISOString(),
      telnyxStatus: telnyx.getStatus()
    }
  }));

  ws.on('close', () => {
    console.log('[WebSocket] Client disconnected');
  });
});

// ==========================================
// API ROUTES
// ==========================================

// 1. Status & Configuration
app.get('/api/status', (req, res) => {
  const contacts = readJson(CONTACTS_FILE, []);
  const logs = readJson(LOGS_FILE, []);
  const recordings = readJson(RECORDINGS_FILE, []);

  res.json({
    telnyx: telnyx.getStatus(),
    stats: {
      totalContacts: contacts.length,
      totalCalls: logs.filter(l => l.type === 'call').length,
      totalSms: logs.filter(l => l.type === 'sms').length,
      totalRecordings: recordings.length
    }
  });
});

// 2. Contacts CRUD
app.get('/api/contacts', (req, res) => {
  const contacts = readJson(CONTACTS_FILE, []);
  res.json(contacts);
});

app.post('/api/contacts', (req, res) => {
  const { name, company, phone, email, status, notes } = req.body;
  if (!name || !phone) {
    return res.status(400).json({ error: 'Name and phone number are required' });
  }

  const contacts = readJson(CONTACTS_FILE, []);
  const newContact = {
    id: 'cnt_' + Date.now(),
    name,
    company: company || '',
    phone,
    email: email || '',
    status: status || 'New Lead',
    notes: notes || '',
    createdAt: new Date().toISOString(),
    lastContacted: null
  };

  contacts.unshift(newContact);
  writeJson(CONTACTS_FILE, contacts);
  res.status(201).json(newContact);
});

app.put('/api/contacts/:id', (req, res) => {
  const { id } = req.params;
  const contacts = readJson(CONTACTS_FILE, []);
  const index = contacts.findIndex(c => c.id === id);

  if (index === -1) {
    return res.status(400).json({ error: 'Contact not found' });
  }

  contacts[index] = {
    ...contacts[index],
    ...req.body,
    id // preserve id
  };

  writeJson(CONTACTS_FILE, contacts);
  res.json(contacts[index]);
});

app.delete('/api/contacts/:id', (req, res) => {
  const { id } = req.params;
  let contacts = readJson(CONTACTS_FILE, []);
  const initialLen = contacts.length;
  contacts = contacts.filter(c => c.id !== id);

  if (contacts.length === initialLen) {
    return res.status(404).json({ error: 'Contact not found' });
  }

  writeJson(CONTACTS_FILE, contacts);
  res.json({ success: true, id });
});

// 3. Activity Logs & Recordings
app.get('/api/logs', (req, res) => {
  const logs = readJson(LOGS_FILE, []);
  res.json(logs);
});

app.delete('/api/logs', (req, res) => {
  writeJson(LOGS_FILE, []);
  res.json({ success: true, message: 'Logs cleared' });
});

app.get('/api/recordings', (req, res) => {
  const recordings = readJson(RECORDINGS_FILE, []);
  res.json(recordings);
});

// 4. Voice Call Control
app.post('/api/call/dial', async (req, res) => {
  const { to, from } = req.body;
  if (!to) {
    return res.status(400).json({ error: 'Destination phone number is required' });
  }

  const contact = findContactByPhone(to);
  const fromNumber = from || process.env.TELNYX_PHONE_NUMBER || '+18005550199';
  const publicUrl = process.env.PUBLIC_URL || `http://localhost:${PORT}`;

  try {
    const callResult = await telnyx.makeCall({
      to,
      from: fromNumber,
      webhookUrl: `${publicUrl}/webhook`,
      clientState: JSON.stringify({ contactId: contact?.id || null, to })
    });

    const callLog = appendLog({
      type: 'call',
      direction: 'outbound',
      from: fromNumber,
      to,
      contactName: contact ? contact.name : 'Unknown Contact',
      company: contact ? contact.company : '',
      status: 'initiated',
      duration: 0,
      content: `Outbound call initiated to ${to}`,
      callControlId: callResult.call_control_id
    });

    // Update contact lastContacted date
    if (contact) {
      const contacts = readJson(CONTACTS_FILE, []);
      const idx = contacts.findIndex(c => c.id === contact.id);
      if (idx !== -1) {
        contacts[idx].lastContacted = new Date().toISOString();
        if (contacts[idx].status === 'New Lead') {
          contacts[idx].status = 'Contacted';
        }
        writeJson(CONTACTS_FILE, contacts);
      }
    }

    broadcast('call_status', {
      callControlId: callResult.call_control_id,
      status: 'ringing',
      to,
      from: fromNumber,
      contact: contact ? { name: contact.name, company: contact.company } : null
    });

    res.json({
      success: true,
      call: callResult,
      log: callLog
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/call/hangup', async (req, res) => {
  const { callControlId, duration = 0 } = req.body;
  try {
    if (callControlId) {
      await telnyx.hangupCall(callControlId);
    }

    broadcast('call_status', {
      callControlId,
      status: 'completed',
      duration
    });

    // Generate recording entry if call lasted over 3 seconds
    if (duration >= 3) {
      const formattedMins = Math.floor(duration / 60).toString().padStart(2, '0');
      const formattedSecs = (duration % 60).toString().padStart(2, '0');
      appendRecording({
        callId: callControlId || 'call_' + Date.now(),
        contactName: req.body.contactName || 'Outreach Prospect',
        company: req.body.company || 'Direct Outreach',
        phoneNumber: req.body.to || '+1 (555) 000-0000',
        direction: req.body.direction || 'outbound',
        duration,
        durationFormatted: `${formattedMins}:${formattedSecs}`,
        audioUrl: '/audio/sample-recording.wav',
        size: `${(0.8 + (duration * 0.015)).toFixed(1)} MB`,
        channels: 'dual'
      });
    }

    res.json({ success: true, message: 'Call ended', duration });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/call/answer', async (req, res) => {
  const { callControlId } = req.body;
  try {
    await telnyx.answerCall(callControlId);
    broadcast('call_status', {
      callControlId,
      status: 'answered'
    });
    res.json({ success: true, message: 'Call answered' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/call/transfer', async (req, res) => {
  const { callControlId, to } = req.body;
  if (!to) {
    return res.status(400).json({ error: 'Transfer destination phone number is required' });
  }

  try {
    const result = await telnyx.transferCall({
      callControlId,
      to
    });

    // Append activity log
    appendLog({
      type: 'call',
      direction: 'transfer',
      from: process.env.TELNYX_PHONE_NUMBER || '+18005550199',
      to,
      contactName: 'Transferred Call',
      company: '',
      status: 'transferred',
      duration: 0,
      content: `Call transferred to ${to}`,
      callControlId
    });

    broadcast('call_status', {
      callControlId,
      status: 'transferred',
      transferTo: to
    });

    res.json({ success: true, message: `Call transferred to ${to}`, result });
  } catch (err) {
    console.error('Call transfer error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Active 3-Way Conference state: { id, originalCallId, newCallId, thirdPartyNumber }
let activeConference = null;
const pendingThreeWayBridges = new Map(); // Kept as fallback

app.post('/api/call/three-way', async (req, res) => {
  const { callControlId, to, from } = req.body;
  if (!to) {
    return res.status(400).json({ error: 'Third party phone number is required for 3-Way Call' });
  }
  if (!callControlId) {
    return res.status(400).json({ error: 'Active call control ID is required for 3-Way Call' });
  }

  const fromNumber = from || process.env.TELNYX_PHONE_NUMBER || '+12065960776';
  const publicUrl = (process.env.PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/$/, '');

  try {
    // 1. Create conference using the EXISTING WebRTC call leg
    const confName = 'conf_' + Date.now();
    console.log(`[3-Way Conference] Creating conference "${confName}" with call leg ${callControlId}...`);
    const confResult = await telnyx.createConferenceWithCall({
      callControlId,
      name: confName
    });

    const conferenceId = confResult.id || confResult.conference_id;

    // 2. Dial the third party as a NEW call
    console.log(`[3-Way Conference] Dialing third party ${to}...`);
    const dialResult = await telnyx.threeWayCall({
      to,
      from: fromNumber,
      webhookUrl: `${publicUrl}/webhook`
    });

    const newCallId = dialResult.call_control_id;

    // 3. Store conference_id and calls in activeConference
    activeConference = {
      id: conferenceId,
      originalCallId: callControlId,
      newCallId,
      thirdPartyNumber: to
    };

    // Append activity log
    appendLog({
      type: 'call',
      direction: 'outbound',
      from: fromNumber,
      to,
      contactName: '3-Way Conference Party',
      company: '',
      status: 'connecting_3way',
      duration: 0,
      content: `Third party dialed (${to}) for Conference ${confName}`,
      callControlId: newCallId,
      originalCallId: callControlId,
      conferenceId
    });

    broadcast('call_status', {
      callControlId,
      conferenceId,
      newCallId,
      status: 'three_way_connecting',
      thirdPartyNumber: to,
      message: 'Third party dialed...'
    });

    // If running in simulator mode, automatically simulate answer & participant joined
    if (dialResult.mode === 'simulated' || String(newCallId).startsWith('sim_')) {
      setTimeout(async () => {
        try {
          console.log(`[Telnyx Simulator] Auto-joining simulated 3-way call ${newCallId} to conference ${conferenceId}`);
          await telnyx.addParticipantToConference({ conferenceId, callControlId: newCallId });

          appendLog({
            type: 'call',
            direction: 'conference',
            from: fromNumber,
            to,
            contactName: '3-Way Conference Active',
            company: '',
            status: 'three_way_active',
            duration: 0,
            content: `Third party joined conference ${confName} (${to})`,
            callControlId,
            conferenceId
          });

          broadcast('call_status', {
            callControlId,
            conferenceId,
            newCallId,
            status: 'three_way_active',
            thirdPartyNumber: to,
            message: 'Third party joined conference. Conference active.'
          });
        } catch (simErr) {
          console.error('[Telnyx Simulator Error] 3-way conference auto-join failed:', simErr.message);
        }
      }, 1500);
    }

    res.json({
      success: true,
      conferenceId,
      newCallId,
      originalCallId: callControlId,
      message: `Conference created (${conferenceId}). Dialing third party ${to}...`
    });
  } catch (err) {
    console.error('3-Way Conference error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Endpoint to end 3-Way (hangs up only the third party)
app.post('/api/call/end-three-way', async (req, res) => {
  if (!activeConference || !activeConference.newCallId) {
    return res.json({ success: true, message: 'No active 3rd party in conference' });
  }

  const { id: conferenceId, newCallId, originalCallId, thirdPartyNumber } = activeConference;

  try {
    await telnyx.leaveConferenceParticipant({ conferenceId, callControlId: newCallId });

    appendLog({
      type: 'call',
      direction: 'outbound',
      from: process.env.TELNYX_PHONE_NUMBER || '+12065960776',
      to: thirdPartyNumber || '3rd Party',
      contactName: '3-Way Ended',
      company: '',
      status: 'three_way_ended',
      duration: 0,
      content: `Third party (${thirdPartyNumber || newCallId}) disconnected from conference`,
      callControlId: originalCallId,
      conferenceId
    });

    broadcast('call_status', {
      callControlId: originalCallId,
      conferenceId,
      status: 'three_way_ended',
      message: 'Third party left conference'
    });

    activeConference.newCallId = null;

    res.json({ success: true, message: 'Third party removed from conference' });
  } catch (err) {
    console.error('End 3-way error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// WebRTC SIP Credentials & In-Browser Call Logging
app.get('/api/webrtc/credentials', (req, res) => {
  const username = process.env.TELNYX_SIP_USERNAME || '';
  const password = process.env.TELNYX_SIP_PASSWORD || '';
  const fromNumber = process.env.TELNYX_PHONE_NUMBER || '+12065960776';

  const isConfigured = Boolean(
    username &&
    password &&
    !username.includes('YOUR_') &&
    !password.includes('YOUR_')
  );

  res.json({
    configured: isConfigured,
    username: isConfigured ? username : '',
    password: isConfigured ? password : '',
    callerNumber: fromNumber
  });
});

app.post('/api/call/log-webrtc-call', (req, res) => {
  const { to, duration = 0, status = 'completed', contactName, company } = req.body;
  const fromNumber = process.env.TELNYX_PHONE_NUMBER || '+12065960776';
  const contact = findContactByPhone(to);

  const callLog = appendLog({
    type: 'call',
    direction: 'outbound',
    from: fromNumber,
    to,
    contactName: contactName || (contact ? contact.name : 'Unknown Contact'),
    company: company || (contact ? contact.company : ''),
    status,
    duration,
    content: `WebRTC in-browser call to ${to} (${duration}s)`,
    callControlId: 'webrtc_' + Date.now()
  });

  if (contact) {
    const contacts = readJson(CONTACTS_FILE, []);
    const idx = contacts.findIndex(c => c.id === contact.id);
    if (idx !== -1) {
      contacts[idx].lastContacted = new Date().toISOString();
      if (contacts[idx].status === 'New Lead') {
        contacts[idx].status = 'Contacted';
      }
      writeJson(CONTACTS_FILE, contacts);
    }
  }

  if (duration >= 3) {
    const formattedMins = Math.floor(duration / 60).toString().padStart(2, '0');
    const formattedSecs = (duration % 60).toString().padStart(2, '0');
    appendRecording({
      callId: 'webrtc_' + Date.now(),
      contactName: contactName || (contact ? contact.name : 'Outreach Prospect'),
      company: company || (contact ? contact.company : 'Direct Outreach'),
      phoneNumber: to,
      direction: 'outbound',
      duration,
      durationFormatted: `${formattedMins}:${formattedSecs}`,
      audioUrl: '/audio/sample-recording.wav',
      size: `${(0.8 + (duration * 0.015)).toFixed(1)} MB`,
      channels: 'dual'
    });
  }

  res.json({ success: true, log: callLog });
});

// 5. SMS Messaging
app.post('/api/sms/send', async (req, res) => {
  const { to, text, from } = req.body;
  if (!to || !text) {
    return res.status(400).json({ error: 'Recipient phone and text message are required' });
  }

  const contact = findContactByPhone(to);
  const fromNumber = from || process.env.TELNYX_PHONE_NUMBER || '+18005550199';

  try {
    const result = await telnyx.sendSms({ to, from: fromNumber, text });

    const logEntry = appendLog({
      type: 'sms',
      direction: 'outbound',
      from: fromNumber,
      to,
      contactName: contact ? contact.name : 'Unknown Contact',
      company: contact ? contact.company : '',
      status: 'delivered',
      content: text
    });

    if (contact) {
      const contacts = readJson(CONTACTS_FILE, []);
      const idx = contacts.findIndex(c => c.id === contact.id);
      if (idx !== -1) {
        contacts[idx].lastContacted = new Date().toISOString();
        writeJson(CONTACTS_FILE, contacts);
      }
    }

    res.json({ success: true, result, log: logEntry });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5b. WhatsApp Messaging
app.post('/api/whatsapp/send', async (req, res) => {
  const { to, text, from } = req.body;
  if (!to || !text) {
    return res.status(400).json({ error: 'Recipient phone and message text are required' });
  }

  const contact = findContactByPhone(to);
  const fromNumber = from || process.env.TELNYX_PHONE_NUMBER || '+12065960776';

  try {
    const result = await telnyx.sendWhatsApp({ to, from: fromNumber, text });

    const logEntry = appendLog({
      type: 'sms',
      direction: 'outbound',
      from: fromNumber,
      to,
      contactName: contact ? contact.name : 'Unknown Contact',
      company: contact ? contact.company : '',
      status: 'delivered',
      content: text,
      text: text,
      channel: 'WHATSAPP',
      messageType: 'WHATSAPP'
    });

    if (contact) {
      const contacts = readJson(CONTACTS_FILE, []);
      const idx = contacts.findIndex(c => c.id === contact.id);
      if (idx !== -1) {
        contacts[idx].lastContacted = new Date().toISOString();
        writeJson(CONTACTS_FILE, contacts);
      }
    }

    // Broadcast for live UI update across tabs
    broadcast('incoming_sms', {
      id: logEntry.id,
      from: fromNumber,
      to,
      senderName: 'You',
      company: contact ? contact.company : '',
      text,
      content: text,
      direction: 'outbound',
      channel: 'WHATSAPP',
      type: 'WHATSAPP',
      timestamp: new Date().toISOString()
    });

    res.json({ success: true, result, log: logEntry });
  } catch (err) {
    console.error('Send WhatsApp error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 5c. Send WhatsApp Approved Template
app.post('/api/send-whatsapp-template', async (req, res) => {
  const { to, templateName, language = 'en_US', variables = {}, from } = req.body;
  if (!to || !templateName) {
    return res.status(400).json({ error: 'Recipient phone (to) and templateName are required' });
  }

  const fromNumber = from || process.env.TELNYX_PHONE_NUMBER || '+12065960776';
  const contact = findContactByPhone(to);

  // Format variables into Telnyx/Meta components -> parameters structure
  // Components: [{ type: "body", parameters: [{ type: "text", text: "val1" }, ...] }]
  let parameters = [];
  let summaryText = `[Template: ${templateName}]`;

  if (Array.isArray(variables)) {
    parameters = variables.map(v => ({ type: 'text', text: String(v || '') }));
    summaryText += ` (${variables.join(', ')})`;
  } else if (variables && typeof variables === 'object') {
    const vals = Object.values(variables);
    parameters = vals.map(v => ({ type: 'text', text: String(v || '') }));
    summaryText += ` (${vals.join(', ')})`;
  }

  const components = parameters.length > 0 ? [
    {
      type: 'body',
      parameters
    }
  ] : [];

  try {
    const result = await telnyx.sendWhatsAppTemplate({
      to,
      from: fromNumber,
      templateName,
      language,
      components
    });

    const logEntry = appendLog({
      type: 'sms',
      direction: 'outbound',
      from: fromNumber,
      to,
      contactName: contact ? contact.name : 'Unknown Contact',
      company: contact ? contact.company : '',
      status: 'delivered',
      content: summaryText,
      text: summaryText,
      channel: 'WHATSAPP',
      messageType: 'WHATSAPP',
      template: templateName
    });

    if (contact) {
      const contacts = readJson(CONTACTS_FILE, []);
      const idx = contacts.findIndex(c => c.id === contact.id);
      if (idx !== -1) {
        contacts[idx].lastContacted = new Date().toISOString();
        writeJson(CONTACTS_FILE, contacts);
      }
    }

    // Broadcast live to UI
    broadcast('incoming_sms', {
      id: logEntry.id,
      from: fromNumber,
      to,
      senderName: 'You',
      company: contact ? contact.company : '',
      text: summaryText,
      content: summaryText,
      direction: 'outbound',
      channel: 'WHATSAPP',
      type: 'WHATSAPP',
      timestamp: new Date().toISOString()
    });

    res.json({ success: true, result, log: logEntry });
  } catch (err) {
    console.error('Send WhatsApp Template error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 6. Interactive Simulators (for immediate test verification)
app.post('/api/call/simulate-incoming', (req, res) => {
  const contacts = readJson(CONTACTS_FILE, []);
  const randomContact = contacts.length > 0
    ? contacts[Math.floor(Math.random() * contacts.length)]
    : { name: 'Alex Mercer', company: 'Global Tech Dynamics', phone: '+14159982341' };

  const callerName = req.body.name || randomContact.name;
  const callerNumber = req.body.phone || randomContact.phone;
  const company = req.body.company || randomContact.company;
  const callControlId = 'in_call_' + Date.now();

  const payload = {
    callControlId,
    from: callerNumber,
    to: process.env.TELNYX_PHONE_NUMBER || '+18005550199',
    callerName,
    company
  };

  appendLog({
    type: 'call',
    direction: 'inbound',
    from: callerNumber,
    to: payload.to,
    contactName: callerName,
    company,
    status: 'ringing',
    content: `Incoming call from ${callerName} (${callerNumber})`,
    callControlId
  });

  broadcast('incoming_call', payload);
  res.json({ success: true, simulatedCall: payload });
});

app.post('/api/sms/simulate-incoming', (req, res) => {
  const sampleMessages = [
    "Hey! Got your voicemail. We're very interested in your solution, can we talk tomorrow?",
    "Sounds great! Please send over the contract and pricing breakdown.",
    "Hi there, does your platform integrate with Salesforce CRM?",
    "Yes, let's schedule a 15 min demo for Thursday afternoon.",
    "Thanks for the info. I shared it with our VP of Sales."
  ];

  const contacts = readJson(CONTACTS_FILE, []);
  const contact = contacts.length > 0 ? contacts[Math.floor(Math.random() * contacts.length)] : null;
  const senderPhone = req.body.from || contact?.phone || '+14155552671';
  const senderName = contact?.name || 'Prospect';
  const company = contact?.company || 'Enterprise Lead';
  const text = req.body.text || sampleMessages[Math.floor(Math.random() * sampleMessages.length)];

  const smsData = {
    id: 'sms_' + Date.now(),
    from: senderPhone,
    to: process.env.TELNYX_PHONE_NUMBER || '+18005550199',
    senderName,
    company,
    text,
    timestamp: new Date().toISOString()
  };

  appendLog({
    type: 'sms',
    direction: 'inbound',
    from: senderPhone,
    to: smsData.to,
    contactName: senderName,
    company,
    status: 'received',
    content: text
  });

  broadcast('incoming_sms', smsData);
  res.json({ success: true, simulatedSms: smsData });
});

app.post('/api/whatsapp/simulate-incoming', (req, res) => {
  const sampleMessages = [
    "Hello! I am reviewing the proposal on WhatsApp. Can you confirm pricing?",
    "Hey! Got your message on WhatsApp. Let's connect this afternoon.",
    "Hi, please send the brochure and catalog here on WhatsApp.",
    "Thank you! The quotation looks good to proceed."
  ];

  const contacts = readJson(CONTACTS_FILE, []);
  const contact = contacts.length > 0 ? contacts[Math.floor(Math.random() * contacts.length)] : null;
  const senderPhone = req.body.from || contact?.phone || '+918330183835';
  const senderName = contact?.name || 'WhatsApp Prospect';
  const company = contact?.company || 'WhatsApp Client';
  const text = req.body.text || sampleMessages[Math.floor(Math.random() * sampleMessages.length)];

  const waData = {
    id: 'wa_' + Date.now(),
    from: senderPhone,
    to: process.env.TELNYX_PHONE_NUMBER || '+12065960776',
    senderName,
    company,
    text,
    content: text,
    channel: 'WHATSAPP',
    type: 'WHATSAPP',
    timestamp: new Date().toISOString()
  };

  const logEntry = appendLog({
    type: 'sms',
    direction: 'inbound',
    from: senderPhone,
    to: waData.to,
    contactName: senderName,
    company,
    status: 'received',
    content: text,
    text: text,
    channel: 'WHATSAPP',
    messageType: 'WHATSAPP'
  });

  broadcast('incoming_sms', {
    ...waData,
    id: logEntry.id
  });

  res.json({ success: true, simulatedWhatsApp: waData });
});

// ==========================================
// TELNYX WEBHOOK ROUTES
// ==========================================

// Webhook: /incoming-call
app.post('/incoming-call', (req, res) => {
  console.log('[Telnyx Webhook /incoming-call] Received:', JSON.stringify(req.body));
  const payload = req.body?.data?.payload || req.body;
  const from = payload.from || payload.caller_number || '+10000000000';
  const to = payload.to || process.env.TELNYX_PHONE_NUMBER;
  const callControlId = payload.call_control_id || 'call_' + Date.now();

  const contact = findContactByPhone(from);
  const callerName = contact ? contact.name : 'Unknown Caller';
  const company = contact ? contact.company : '';

  appendLog({
    type: 'call',
    direction: 'inbound',
    from,
    to,
    contactName: callerName,
    company,
    status: 'ringing',
    content: `Incoming call from ${callerName} (${from})`,
    callControlId
  });

  broadcast('incoming_call', {
    callControlId,
    from,
    to,
    callerName,
    company
  });

  res.status(200).json({ status: 'ok', received: true });
});

// Webhook: /incoming-sms & /incoming-whatsapp
app.post(['/incoming-sms', '/incoming-whatsapp'], (req, res) => {
  const rawBody = req.body || {};
  const payload = rawBody.data?.payload || rawBody.entry?.[0]?.changes?.[0]?.value || rawBody;

  // Debug log requested by user
  console.log('[SMS/WA webhook] body.type =', payload.body?.type, '| text =', payload.body?.text?.body);
  console.log('[Telnyx Webhook /incoming-sms] Received:', JSON.stringify(rawBody));

  // Determine if this is a WhatsApp message
  const isWhatsApp = 
    payload.body?.type === 'WHATSAPP' || 
    payload.type === 'WHATSAPP' || 
    req.path.includes('whatsapp') || 
    Boolean(payload.entry || payload.contacts);

  // Extract readable text
  let text = '';
  if (payload.body?.text?.body) {
    text = payload.body.text.body;
  } else if (payload.text?.body) {
    text = payload.text.body;
  } else if (typeof payload.text === 'string') {
    text = payload.text;
  } else if (typeof payload.body === 'string') {
    text = payload.body;
  } else {
    text = extractIncomingMessageText(payload) || '(No text)';
  }

  // Extract sender phone
  let from = '';
  if (payload.body?.from?.phone_number) {
    from = payload.body.from.phone_number;
  } else if (payload.from?.phone_number) {
    from = payload.from.phone_number;
  } else if (payload.from) {
    from = typeof payload.from === 'object' ? (payload.from.phone_number || JSON.stringify(payload.from)) : payload.from;
  } else if (payload.messages?.[0]?.from) {
    from = payload.messages[0].from;
  } else if (payload.contacts?.[0]?.wa_id) {
    from = payload.contacts[0].wa_id;
  }
  from = from ? (String(from).startsWith('+') ? String(from) : `+${from}`) : 'Unknown';

  // Extract recipient phone
  let to = '';
  if (payload.body?.to?.[0]?.phone_number) {
    to = payload.body.to[0].phone_number;
  } else if (payload.to?.[0]?.phone_number) {
    to = payload.to[0].phone_number;
  } else if (payload.to) {
    to = typeof payload.to === 'object' ? (payload.to.phone_number || JSON.stringify(payload.to)) : payload.to;
  } else {
    to = process.env.TELNYX_PHONE_NUMBER || '+12065960776';
  }

  const contact = findContactByPhone(from);
  const senderName = contact ? contact.name : (payload.contacts?.[0]?.profile?.name || 'Prospect');
  const company = contact ? contact.company : '';

  // Save log entry matching both data/logs.json schema and user requirements
  const logEntry = appendLog({
    type: 'sms',
    direction: 'inbound',
    from,
    to,
    contactName: senderName,
    company,
    status: 'received',
    content: text,
    text: text,
    channel: isWhatsApp ? 'WHATSAPP' : 'SMS',
    messageType: isWhatsApp ? 'WHATSAPP' : 'SMS'
  });

  // Broadcast to WebSocket clients for live UI update
  broadcast('incoming_sms', {
    id: logEntry.id || ('msg_' + Date.now()),
    from,
    to,
    senderName,
    company,
    text,
    content: text,
    channel: isWhatsApp ? 'WHATSAPP' : 'SMS',
    type: isWhatsApp ? 'WHATSAPP' : 'SMS',
    timestamp: new Date().toISOString()
  });

  res.status(200).json({ status: 'ok', received: true });
});

// General Telnyx Call Control & Messaging v2 event callback
app.post('/webhook', (req, res) => {
  const event = req.body?.data?.event_type;
  const payload = req.body?.data?.payload || {};

  console.log(`[Telnyx Webhook Event] ${event}`);

  if (event === 'call.answered') {
    const answeredCallId = payload.call_control_id;

    // Check if this answered call is the 3rd party in active conference
    if (answeredCallId && activeConference && activeConference.newCallId === answeredCallId) {
      console.log(`[Telnyx Webhook] 3-Way 3rd party answered. Adding ${answeredCallId} to conference ${activeConference.id}...`);

      telnyx.addParticipantToConference({
        conferenceId: activeConference.id,
        callControlId: answeredCallId
      })
        .then(() => {
          console.log('[Telnyx Webhook] 3-Way 3rd party participant added to conference successfully');
          appendLog({
            type: 'call',
            direction: 'conference',
            from: process.env.TELNYX_PHONE_NUMBER || '+12065960776',
            to: activeConference.thirdPartyNumber || answeredCallId,
            contactName: '3-Way Conference Active',
            company: '',
            status: 'three_way_active',
            duration: 0,
            content: `Third party (${activeConference.thirdPartyNumber || answeredCallId}) joined conference`,
            callControlId: activeConference.originalCallId,
            conferenceId: activeConference.id
          });

          broadcast('call_status', {
            callControlId: activeConference.originalCallId,
            conferenceId: activeConference.id,
            newCallId: answeredCallId,
            status: 'three_way_active',
            thirdPartyNumber: activeConference.thirdPartyNumber,
            message: 'Third party joined conference. Conference active.'
          });
        })
        .catch(err => {
          console.error('[Telnyx Webhook] Add participant to conference error:', err.message);
        });
    } else if (answeredCallId && pendingThreeWayBridges.has(answeredCallId)) {
      // Legacy fallback
      const originalCallId = pendingThreeWayBridges.get(answeredCallId);
      pendingThreeWayBridges.delete(answeredCallId);
      telnyx.bridgeCall({ originalCallId, newCallId: answeredCallId }).catch(() => {});
    } else {
      broadcast('call_status', {
        callControlId: answeredCallId,
        status: 'answered'
      });
    }
  } else if (event === 'conference.participant.joined') {
    const confId = payload.conference_id;
    const callLegId = payload.call_control_id;
    console.log(`[Telnyx Webhook] Participant ${callLegId} joined conference ${confId}`);

    appendLog({
      type: 'call',
      direction: 'conference',
      from: process.env.TELNYX_PHONE_NUMBER || '+12065960776',
      to: activeConference?.thirdPartyNumber || 'Participant',
      contactName: '3-Way Conference',
      company: '',
      status: 'three_way_active',
      duration: 0,
      content: `Conference participant joined (${callLegId})`,
      callControlId: activeConference?.originalCallId || callLegId,
      conferenceId: confId
    });

    broadcast('call_status', {
      callControlId: activeConference?.originalCallId,
      conferenceId: confId,
      status: 'three_way_active',
      thirdPartyNumber: activeConference?.thirdPartyNumber,
      message: 'Third party joined conference'
    });
  } else if (event === 'conference.participant.left') {
    const confId = payload.conference_id;
    const callLegId = payload.call_control_id;
    console.log(`[Telnyx Webhook] Participant ${callLegId} left conference ${confId}`);

    appendLog({
      type: 'call',
      direction: 'conference',
      from: process.env.TELNYX_PHONE_NUMBER || '+12065960776',
      to: 'Participant',
      contactName: '3-Way Conference',
      company: '',
      status: 'three_way_participant_left',
      duration: 0,
      content: `Conference participant left (${callLegId})`,
      callControlId: activeConference?.originalCallId || callLegId,
      conferenceId: confId
    });

    if (activeConference && activeConference.newCallId === callLegId) {
      activeConference.newCallId = null;
      broadcast('call_status', {
        callControlId: activeConference.originalCallId,
        conferenceId: confId,
        status: 'three_way_ended',
        message: 'Third party left conference'
      });
    }
  } else if (event === 'conference.ended') {
    const confId = payload.conference_id;
    console.log(`[Telnyx Webhook] Conference ended: ${confId}`);

    appendLog({
      type: 'call',
      direction: 'conference',
      from: process.env.TELNYX_PHONE_NUMBER || '+12065960776',
      to: 'Conference',
      contactName: '3-Way Conference Ended',
      company: '',
      status: 'conference_ended',
      duration: 0,
      content: `Conference ended (${confId})`,
      callControlId: activeConference?.originalCallId,
      conferenceId: confId
    });

    broadcast('call_status', {
      callControlId: activeConference?.originalCallId,
      conferenceId: confId,
      status: 'three_way_ended',
      message: 'Conference ended'
    });

    activeConference = null;
  } else if (event === 'call.hangup') {
    const hungupId = payload.call_control_id;
    if (activeConference && activeConference.newCallId === hungupId) {
      activeConference.newCallId = null;
      broadcast('call_status', {
        callControlId: activeConference.originalCallId,
        status: 'three_way_ended',
        message: 'Third party hung up'
      });
    } else if (activeConference && activeConference.originalCallId === hungupId) {
      activeConference = null;
    }
    broadcast('call_status', {
      callControlId: hungupId,
      status: 'completed',
      duration: payload.duration_secs || 0
    });
  } else if (event === 'call.recording.saved') {
    appendRecording({
      callId: payload.call_control_id,
      audioUrl: payload.recording_urls?.mp3 || payload.recording_urls?.wav || '/audio/sample-recording.wav',
      duration: payload.duration_secs || 0,
      durationFormatted: `${Math.floor((payload.duration_secs || 0)/60)}:${((payload.duration_secs || 0)%60).toString().padStart(2,'0')}`,
      channels: payload.channels || 'single',
      phoneNumber: payload.to || 'Contact'
    });
  } else if (event === 'message.received' || event?.startsWith('message.')) {
    // If Telnyx sends inbound message to general /webhook
    const from = payload.from?.phone_number || payload.from || 'Unknown';
    const to = payload.to?.[0]?.phone_number || payload.to || process.env.TELNYX_PHONE_NUMBER;
    const text = extractIncomingMessageText(payload) || '(No text)';

    const contact = findContactByPhone(from);
    const senderName = contact ? contact.name : 'Prospect';
    const company = contact ? contact.company : '';

    appendLog({
      type: 'sms',
      direction: 'inbound',
      from,
      to,
      contactName: senderName,
      company,
      status: 'received',
      content: text
    });

    broadcast('incoming_sms', {
      id: 'sms_' + Date.now(),
      from,
      to,
      senderName,
      company,
      text,
      timestamp: new Date().toISOString()
    });
  }

  res.status(200).json({ status: 'ok' });
});

// Start Server
server.listen(PORT, () => {
  console.log(`
=========================================================
  TELNYX COLD OUTREACH DIALER DASHBOARD (PWA)
=========================================================
  Dashboard URL:    http://localhost:${PORT}
  Incoming Call:    http://localhost:${PORT}/incoming-call
  Incoming SMS:     http://localhost:${PORT}/incoming-sms
  Telnyx Mode:      ${telnyx.isConfigured() ? 'LIVE (Telnyx API Key Active)' : 'SIMULATED (Ready for Testing)'}
=========================================================
  `);
});

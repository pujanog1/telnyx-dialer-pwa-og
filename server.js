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

// Webhook: /incoming-sms
app.post('/incoming-sms', (req, res) => {
  console.log('[Telnyx Webhook /incoming-sms] Received:', JSON.stringify(req.body));
  const payload = req.body?.data?.payload || req.body;
  const from = payload.from?.phone_number || payload.from || 'Unknown';
  const to = payload.to?.[0]?.phone_number || payload.to || process.env.TELNYX_PHONE_NUMBER;
  const text = payload.text || payload.body || '';

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

  res.status(200).json({ status: 'ok', received: true });
});

// General Telnyx Call Control v2 event callback
app.post('/webhook', (req, res) => {
  const event = req.body?.data?.event_type;
  const payload = req.body?.data?.payload || {};

  console.log(`[Telnyx Webhook Event] ${event}`);

  if (event === 'call.answered') {
    broadcast('call_status', {
      callControlId: payload.call_control_id,
      status: 'answered'
    });
  } else if (event === 'call.hangup') {
    broadcast('call_status', {
      callControlId: payload.call_control_id,
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

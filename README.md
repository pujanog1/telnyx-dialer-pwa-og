# OutreachDialer Pro — Cold Outreach Dialer & CRM (PWA)

A dark-mode dialer dashboard and CRM built for high-velocity cold outreach sales teams. Integrated with **Telnyx Voice & SMS APIs** with Progressive Web App (PWA) support for mobile and desktop.

![OutreachDialer Pro Preview](/icons/icon-192.svg)

---

## Key Features

### 1. Modern Dark UI
- **Linear / Vercel Aesthetic:** Pitch-dark background (`#080c14`) with glassmorphic cards and electric violet/cyan glow accents.
- **Mobile Responsive:** Adapts seamlessly between a 3-column desktop layout and a mobile tabbed app.
- **Micro-Animations:** Pulsing signal rings, active call wave visualizer, and tactile dial pad feedback.

### 2. Pro Outbound & Inbound Voice Engine (WebRTC Two-Way Audio)
- **In-Browser WebRTC Calling:** Directly stream two-way audio through the browser's microphone and speaker using `@telnyx/webrtc` and Telnyx SIP credentials.
- **Connect WebRTC Button:** Top-level authentication button in header with real-time status pill (`WebRTC: Ready`).
- **Telnyx Call Control v2 Fallback:** Automatic fallback to server-side Call Control API if WebRTC is disconnected.
- **Live Call Transfer (Blind / Direct Hand-off):** In-call transfer button (`🔀 Transfer`) allows live routing of active calls to any external human agent, mobile, or PSTN number using Telnyx's `POST /calls/{call_control_id}/actions/transfer`.
- **Active Call HUD:** Live ticking duration timer (`00:00`), audio waveform activity, mute microphone toggle, transfer modal, and in-call DTMF dial pad.
- **Web Audio DTMF Synthesizer:** Real dual-tone multi-frequency audio generated on keypad clicks.

### 3. Incoming Call & SMS Alerts
- **Full-Screen Ringing Overlay:** Visual incoming call screen with prospect name, company, and phone lookup.
- **Web Audio Ringtone Generator:** Dual-frequency telephone chime (440Hz + 480Hz) synthesized in-browser with realistic cadence.
- **Accept / Decline Actions:** Answer immediately routes to active call timer; decline cancels and logs the event.
- **Instant SMS Notification:** Banner alert and live message feed updates for inbound messages.

### 4. Cold Outreach SMS Hub
- **Quick Snippet Templates:** Pre-built templates for cold intro, missed call follow-up, demo calendar link, and gentle bump.
- **Template Personalization:** Auto-replaces `{{name}}` and `{{company}}` with recipient lead details.
- **Live SMS Segment Counter:** Tracks characters and calculates SMS segments (`0 / 160 (1 segment)`).
- **Two-Way Message Thread:** Visual bubbles for outbound and inbound SMS history.

### 5. Call Recordings Vault
- **Dual-Channel Call Recordings:** Lists past outreach calls with prospect name, company, duration, and date.
- **Built-in Audio Player:** Custom player with Play/Pause, scrubber range slider, and timestamp displays.
- **Download WAV File:** One-click download button for compliance or offline training.

### 6. Leads CRM
- **Lead Pipeline Stages:** `New Lead`, `Contacted`, `Interested`, `Meeting Booked`, `Follow Up`, `Do Not Call (DNC)`.
- **1-Click Call & SMS:** Instantly loads number into the dialer or SMS composer.
- **Lead Management:** Create, edit, search, filter, and delete contacts. Stored in `data/contacts.json`.

### 7. Progressive Web App (PWA) & Notifications
- **Installable:** Add to Home Screen on iOS/Android or install as a standalone desktop app on Chrome/Edge/macOS.
- **Service Worker (`sw.js`):** Offline caching of app shell assets.
- **Native Notifications:** Receive incoming call and SMS alerts even when working in another tab.

---

## Project Structure

```text
telnyx-dialer-pwa/
├── server.js              # Express + WebSocket server & Telnyx Webhook endpoints
├── telnyx.js              # Telnyx Call Control & Messaging v2 API client
├── package.json           # Project metadata and dependencies
├── .env.example           # Environment template
├── .env                   # Active environment config
├── data/                  # Persistent JSON storage
│   ├── contacts.json      # CRM Leads database
│   ├── logs.json          # Real-time call & SMS activity logs
│   └── recordings.json    # Metadata for call recordings
├── public/                # Frontend application
│   ├── index.html         # Modern dashboard markup
│   ├── styles.css         # Linear/Vercel dark theme styles
│   ├── app.js             # Client logic: Web Audio, WebSockets, CRM, dialer
│   ├── sw.js              # PWA Service Worker
│   ├── manifest.json      # Web App Manifest
│   ├── audio/
│   │   └── sample-recording.wav # Built-in sample audio file
│   └── icons/
│       ├── icon-192.svg   # PWA Icon 192x192
│       ├── icon-512.svg   # PWA Icon 512x512
│       └── favicon.svg    # Browser tab icon
└── README.md              # Documentation and guide
```

---

## Quick Start

### 1. Prerequisites
- **Node.js**: v18.0.0 or higher
- **npm** (or yarn/pnpm)

### 2. Installation
```bash
# Navigate to the project directory
cd telnyx-dialer-pwa

# Install dependencies (express, ws, cors, dotenv)
npm install
```

### 3. Configure Environment
Open `.env` and configure your Telnyx credentials (or leave as-is for instant simulation mode):

```env
# Telnyx API Configuration
TELNYX_API_KEY=KEY018..._YOUR_TELNYX_API_KEY
TELNYX_PHONE_NUMBER=+18005550199
TELNYX_CONNECTION_ID=YOUR_CALL_CONTROL_APPLICATION_ID

# Server Port
PORT=3000

# Public URL (for Telnyx webhooks via ngrok or domain)
PUBLIC_URL=http://localhost:3000
```

### 4. Run the Dashboard
```bash
npm start
```
Then visit:
```
http://localhost:3000
```

---

## Configuring Live Telnyx Webhooks

To receive live incoming calls and SMS from Telnyx to your dashboard:

1. **Expose your local server** using [ngrok](https://ngrok.com) or a cloud server:
   ```bash
   ngrok http 3000
   ```
   Copy the `https://...ngrok-free.app` forwarding URL and set it as `PUBLIC_URL` in `.env`.

2. **In the Telnyx Mission Control Portal**:
   - **Voice / Call Control:**
     - Go to **Voice** > **Call Control Applications**.
     - Create or edit your application.
     - Set **Webhook URL** to: `https://<YOUR_DOMAIN>/incoming-call` (or `https://<YOUR_DOMAIN>/webhook`).
     - Associate your Telnyx Phone Number with this Application.
   - **SMS / Messaging:**
     - Go to **Messaging** > **Programmable Messaging**.
     - Set the **Webhook URL** to: `https://<YOUR_DOMAIN>/incoming-sms`.
     - Assign your Telnyx phone number to the messaging profile.

---

## 1-Click Interactive Simulators

You don't need active Telnyx balance or phones to test the complete user experience!
In the top navigation bar, use:
- **"Simulate Call"**: Triggers an inbound call popup, starts the telephone ringtone, and pulls caller info from your CRM leads.
- **"Simulate SMS"**: Sends a simulated incoming inquiry SMS to your dashboard with notification toasts.

---

## License
MIT License. Built for modern sales development and cold outreach teams.

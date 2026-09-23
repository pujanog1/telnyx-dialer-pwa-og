/**
 * OutreachDialer Pro — Modern Telnyx Frontend Controller
 * Complete Web Audio Synthesizer, WebSockets, Call Control, SMS, Recordings & PWA
 */

(function () {
  'use strict';

  // State Management
  const state = {
    contacts: [],
    logs: [],
    recordings: [],
    activeCall: null,
    activeCallTimer: null,
    callDurationSeconds: 0,
    isMuted: false,
    currentFilter: 'all',
    deferredPrompt: null,
    ws: null,
    audioCtx: null,
    ringtoneOscillators: null,
    webrtcClient: null,
    webrtcConnected: false,
    webrtcCall: null,
    webrtcConfig: null,
    activeWaPhone: null,
    waConversations: [],
    waMessages: []
  };

  // DTMF Standard Frequencies (Hz)
  const DTMF_FREQS = {
    '1': [697, 1209], '2': [697, 1336], '3': [697, 1477],
    '4': [770, 1209], '5': [770, 1336], '6': [770, 1477],
    '7': [852, 1209], '8': [852, 1336], '9': [852, 1477],
    '*': [941, 1209], '0': [941, 1336], '#': [941, 1477]
  };

  // DOM Elements Cache
  const els = {
    // Nav & System
    telnyxBadge: document.getElementById('telnyxBadge'),
    telnyxStatusText: document.getElementById('telnyxStatusText'),
    webrtcBadge: document.getElementById('webrtcBadge'),
    webrtcStatusText: document.getElementById('webrtcStatusText'),
    wsBadge: document.getElementById('wsBadge'),
    wsStatusText: document.getElementById('wsStatusText'),
    currentFromNumber: document.getElementById('currentFromNumber'),
    btnConnectWebRtc: document.getElementById('btnConnectWebRtc'),
    btnConnectWebRtcText: document.getElementById('btnConnectWebRtcText'),
    telnyxRemoteAudio: document.getElementById('telnyxRemoteAudio'),
    btnSimCall: document.getElementById('btnSimCall'),
    btnSimSms: document.getElementById('btnSimSms'),
    btnInstallPwa: document.getElementById('btnInstallPwa'),
    btnNotificationPrompt: document.getElementById('btnNotificationPrompt'),

    // Mobile tabs
    mobileTabs: document.querySelectorAll('.mobile-tab-btn'),
    dashCards: document.querySelectorAll('.dash-card'),

    // Dialer & Active HUD
    countryCodeSelect: document.getElementById('countryCodeSelect'),
    phoneNumberInput: document.getElementById('phoneNumberInput'),
    btnBackspace: document.getElementById('btnBackspace'),
    btnClearInput: document.getElementById('btnClearInput'),
    btnStartCall: document.getElementById('btnStartCall'),
    keypadGrid: document.getElementById('keypadGrid'),
    contactMatchedBanner: document.getElementById('contactMatchedBanner'),
    matchedInitials: document.getElementById('matchedInitials'),
    matchedName: document.getElementById('matchedName'),
    matchedCompany: document.getElementById('matchedCompany'),
    matchedStatus: document.getElementById('matchedStatus'),

    // In-Call HUD
    activeCallHud: document.getElementById('activeCallHud'),
    callHudName: document.getElementById('callHudName'),
    callHudCompany: document.getElementById('callHudCompany'),
    callHudNumber: document.getElementById('callHudNumber'),
    callStatusBadge: document.getElementById('callStatusBadge'),
    callTimerDisplay: document.getElementById('callTimerDisplay'),
    btnMuteCall: document.getElementById('btnMuteCall'),
    muteIcon: document.getElementById('muteIcon'),
    btnKeypadToggle: document.getElementById('btnKeypadToggle'),
    btnTransferCall: document.getElementById('btnTransferCall'),
    btnEndCall: document.getElementById('btnEndCall'),

    // Transfer Modal
    transferModal: document.getElementById('transferModal'),
    transferForm: document.getElementById('transferForm'),
    transferTargetPhone: document.getElementById('transferTargetPhone'),
    btnCloseTransferModal: document.getElementById('btnCloseTransferModal'),
    btnCancelTransfer: document.getElementById('btnCancelTransfer'),
    btnExecuteTransfer: document.getElementById('btnExecuteTransfer'),

    // Sub-Tabs
    tabButtons: document.querySelectorAll('.card-tab-nav .tab-item'),

    // SMS Tab
    smsRecipientInput: document.getElementById('smsRecipientInput'),
    btnCopyFromDialer: document.getElementById('btnCopyFromDialer'),
    smsTemplateSelect: document.getElementById('smsTemplateSelect'),
    smsMessageInput: document.getElementById('smsMessageInput'),
    smsCharCounter: document.getElementById('smsCharCounter'),
    btnSendSms: document.getElementById('btnSendSms'),
    smsMessageList: document.getElementById('smsMessageList'),

    // WhatsApp Tab Elements
    btnSimWa: document.getElementById('btnSimWa'),
    waUnreadTotalBadge: document.getElementById('waUnreadTotalBadge'),
    waSearchInput: document.getElementById('waSearchInput'),
    btnNewWaChat: document.getElementById('btnNewWaChat'),
    waNewChatDrawer: document.getElementById('waNewChatDrawer'),
    waNewChatPhone: document.getElementById('waNewChatPhone'),
    btnStartWaChatConfirm: document.getElementById('btnStartWaChatConfirm'),
    btnCancelWaChatDrawer: document.getElementById('btnCancelWaChatDrawer'),
    waConversationsList: document.getElementById('waConversationsList'),
    waNoChatSelected: document.getElementById('waNoChatSelected'),
    waActiveChatView: document.getElementById('waActiveChatView'),
    waHeaderAvatar: document.getElementById('waHeaderAvatar'),
    waHeaderName: document.getElementById('waHeaderName'),
    waHeaderPhone: document.getElementById('waHeaderPhone'),
    btnCallWaContact: document.getElementById('btnCallWaContact'),
    btnSmsWaContact: document.getElementById('btnSmsWaContact'),
    waMessagesThread: document.getElementById('waMessagesThread'),
    waMessageInput: document.getElementById('waMessageInput'),
    btnSendWhatsApp: document.getElementById('btnSendWhatsApp'),

    // Recordings Tab
    recordingsList: document.getElementById('recordingsList'),
    recordingCountBadge: document.getElementById('recordingCountBadge'),
    recordingPlayerCard: document.getElementById('recordingPlayerCard'),
    playerCallName: document.getElementById('playerCallName'),
    playerCallMeta: document.getElementById('playerCallMeta'),
    btnPlayPause: document.getElementById('btnPlayPause'),
    playPauseIcon: document.getElementById('playPauseIcon'),
    playerSeekSlider: document.getElementById('playerSeekSlider'),
    playerCurrentTime: document.getElementById('playerCurrentTime'),
    playerDuration: document.getElementById('playerDuration'),
    globalAudioPlayer: document.getElementById('globalAudioPlayer'),

    // Contacts & CRM
    contactsList: document.getElementById('contactsList'),
    leadCountBadge: document.getElementById('leadCountBadge'),
    contactSearchInput: document.getElementById('contactSearchInput'),
    filterChips: document.querySelectorAll('.filter-chip'),
    btnOpenAddContact: document.getElementById('btnOpenAddContact'),
    contactModal: document.getElementById('contactModal'),
    contactForm: document.getElementById('contactForm'),
    contactModalTitle: document.getElementById('contactModalTitle'),
    btnCloseContactModal: document.getElementById('btnCloseContactModal'),
    btnCancelContact: document.getElementById('btnCancelContact'),
    editContactId: document.getElementById('editContactId'),
    contactFormName: document.getElementById('contactFormName'),
    contactFormCompany: document.getElementById('contactFormCompany'),
    contactFormPhone: document.getElementById('contactFormPhone'),
    contactFormEmail: document.getElementById('contactFormEmail'),
    contactFormStatus: document.getElementById('contactFormStatus'),
    contactFormNotes: document.getElementById('contactFormNotes'),

    // Activity Feed
    activityLogsList: document.getElementById('activityLogsList'),
    logsCountBadge: document.getElementById('logsCountBadge'),
    btnClearLogs: document.getElementById('btnClearLogs'),

    // Incoming Call Modal
    incomingCallModal: document.getElementById('incomingCallModal'),
    incomingCallerName: document.getElementById('incomingCallerName'),
    incomingCallerCompany: document.getElementById('incomingCallerCompany'),
    incomingCallerPhone: document.getElementById('incomingCallerPhone'),
    btnAnswerIncoming: document.getElementById('btnAnswerIncoming'),
    btnDeclineIncoming: document.getElementById('btnDeclineIncoming'),

    // Toast
    toastNotification: document.getElementById('toastNotification'),
    toastTitle: document.getElementById('toastTitle'),
    toastMessage: document.getElementById('toastMessage'),
    btnCloseToast: document.getElementById('btnCloseToast')
  };

  // =========================================================================
  // WEB AUDIO SYNTHESIZER (DTMF Tones & Incoming Ringtone)
  // =========================================================================
  function getAudioContext() {
    if (!state.audioCtx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        state.audioCtx = new AudioCtx();
      }
    }
    if (state.audioCtx && state.audioCtx.state === 'suspended') {
      state.audioCtx.resume();
    }
    return state.audioCtx;
  }

  // Play standard DTMF touch-tone for phone keypad
  function playDtmfTone(digit) {
    const freqs = DTMF_FREQS[digit];
    if (!freqs) return;

    try {
      const ctx = getAudioContext();
      if (!ctx) return;

      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gainNode = ctx.createGain();

      osc1.frequency.value = freqs[0];
      osc2.frequency.value = freqs[1];

      gainNode.gain.setValueAtTime(0.08, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.16);

      osc1.connect(gainNode);
      osc2.connect(gainNode);
      gainNode.connect(ctx.destination);

      osc1.start();
      osc2.start();
      osc1.stop(ctx.currentTime + 0.18);
      osc2.stop(ctx.currentTime + 0.18);
    } catch (e) {
      console.warn('Audio feedback unavailable:', e);
    }
  }

  // Synthesize realistic dual-frequency telephone ringtone
  function startRingtone() {
    stopRingtone();
    try {
      const ctx = getAudioContext();
      if (!ctx) return;

      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc2.type = 'sine';
      osc1.frequency.value = 440; // Standard US ringtone high
      osc2.frequency.value = 480; // Standard US ringtone low

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      // Create a cadence: 1.5s ring, 2.5s pause
      const now = ctx.currentTime;
      gain.gain.setValueAtTime(0, now);

      let step = 0;
      const cadenceInterval = setInterval(() => {
        if (!state.ringtoneOscillators) {
          clearInterval(cadenceInterval);
          return;
        }
        const t = ctx.currentTime;
        gain.gain.setValueAtTime(0.12, t);
        gain.gain.setValueAtTime(0, t + 1.6);
      }, 4000);

      // initial pulse
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.setValueAtTime(0, now + 1.6);

      osc1.start();
      osc2.start();

      state.ringtoneOscillators = {
        osc1,
        osc2,
        gain,
        cadenceInterval
      };
    } catch (e) {
      console.warn('Ringtone synth warning:', e);
    }
  }

  function stopRingtone() {
    if (state.ringtoneOscillators) {
      try {
        clearInterval(state.ringtoneOscillators.cadenceInterval);
        state.ringtoneOscillators.gain.gain.setValueAtTime(0, state.audioCtx?.currentTime || 0);
        state.ringtoneOscillators.osc1.stop();
        state.ringtoneOscillators.osc2.stop();
      } catch (e) {
        // ignore already stopped
      }
      state.ringtoneOscillators = null;
    }
  }

  // =========================================================================
  // TOAST NOTIFICATIONS & NATIVE PUSH
  // =========================================================================
  let toastTimeout;
  function showToast(title, message, duration = 4000) {
    els.toastTitle.textContent = title;
    els.toastMessage.textContent = message;
    els.toastNotification.classList.remove('hidden');

    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      els.toastNotification.classList.add('hidden');
    }, duration);
  }

  els.btnCloseToast.addEventListener('click', () => {
    els.toastNotification.classList.add('hidden');
  });

  async function requestNotificationPermission() {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        showToast('Notifications Active', 'You will receive alerts for incoming calls and SMS.');
      } else {
        showToast('Notifications Blocked', 'Allow notifications in browser settings for alerts.');
      }
    } else {
      showToast('Unsupported', 'Browser does not support notifications.');
    }
  }

  function triggerSystemNotification(title, body) {
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(title, {
          body,
          icon: '/icons/icon-192.svg',
          badge: '/icons/favicon.svg'
        });
      } catch (e) {
        console.warn('Desktop notification error:', e);
      }
    }
  }

  // =========================================================================
  // WEBSOCKET REAL-TIME SYNC
  // =========================================================================
  function initWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    state.ws = new WebSocket(wsUrl);

    state.ws.onopen = () => {
      console.log('[WebSocket] Connected to Telnyx Backend');
      els.wsBadge.className = 'status-pill status-connected';
      els.wsStatusText.textContent = 'Live Sync';
    };

    state.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        handleServerEvent(message.event, message.data);
      } catch (err) {
        console.error('WebSocket parse error:', err);
      }
    };

    state.ws.onclose = () => {
      console.log('[WebSocket] Disconnected. Reconnecting in 3s...');
      els.wsBadge.className = 'status-pill status-sim';
      els.wsStatusText.textContent = 'Reconnecting...';
      setTimeout(initWebSocket, 3000);
    };

    state.ws.onerror = (err) => {
      console.warn('[WebSocket] Error:', err);
    };
  }

  function handleServerEvent(event, data) {
    console.log(`[Event: ${event}]`, data);

    switch (event) {
      case 'welcome':
        updateTelnyxStatus(data.telnyxStatus);
        break;

      case 'incoming_call':
        handleIncomingCallEvent(data);
        break;

      case 'incoming_sms':
        handleIncomingSmsEvent(data);
        break;

      case 'call_status':
        handleCallStatusEvent(data);
        break;

      case 'activity_log':
        state.logs.unshift(data);
        renderActivityLogs();
        break;

      case 'new_recording':
        state.recordings.unshift(data);
        renderRecordings();
        break;

      default:
        break;
    }
  }

  function updateTelnyxStatus(status) {
    if (!status) return;
    if (status.mode === 'live') {
      els.telnyxBadge.className = 'status-pill status-live';
      els.telnyxStatusText.textContent = 'Telnyx: LIVE';
    } else {
      els.telnyxBadge.className = 'status-pill status-sim';
      els.telnyxStatusText.textContent = 'Telnyx: Simulated';
    }
    if (status.fromNumber) {
      els.currentFromNumber.textContent = status.fromNumber;
    }
  }

  // =========================================================================
  // TELNYX WEBRTC CLIENT & IN-BROWSER TWO-WAY CALLING
  // =========================================================================
  async function connectWebRtc(manualPrompt = false) {
    const TelnyxClass = (window.TelnyxWebRTC && window.TelnyxWebRTC.TelnyxRTC) || window.TelnyxRTC;
    if (!TelnyxClass) {
      showToast('WebRTC Loading', 'Please wait for the Telnyx WebRTC library to finish loading.');
      return;
    }

    let creds = null;
    try {
      const res = await fetch('/api/webrtc/credentials');
      creds = await res.json();
      state.webrtcConfig = creds;
    } catch (e) {
      console.warn('Failed to fetch WebRTC credentials:', e);
    }

    let username = creds?.username;
    let password = creds?.password;

    if (!username || !password) {
      if (manualPrompt) {
        username = prompt('Enter your Telnyx SIP Connection Username (from Telnyx Mission Control):');
        if (!username) return;
        password = prompt('Enter your Telnyx SIP Connection Password:');
        if (!password) return;
      } else {
        els.webrtcBadge.className = 'status-pill status-sim';
        els.webrtcStatusText.textContent = 'WebRTC: Click Connect';
        return;
      }
    }

    els.webrtcBadge.className = 'status-pill status-connecting';
    els.webrtcStatusText.textContent = 'WebRTC: Connecting...';
    els.btnConnectWebRtcText.textContent = 'Connecting...';

    try {
      if (state.webrtcClient) {
        try { state.webrtcClient.disconnect(); } catch (e) {}
      }

      const client = new TelnyxClass({
        login: username,
        password: password
      });

      client.on('telnyx.ready', () => {
        console.log('[Telnyx WebRTC] Client is ready and registered!');
        state.webrtcConnected = true;
        els.webrtcBadge.className = 'status-pill status-ready';
        els.webrtcStatusText.textContent = 'WebRTC: Ready';
        els.btnConnectWebRtc.classList.add('btn-webrtc-active');
        els.btnConnectWebRtcText.textContent = 'WebRTC Connected';
        showToast('WebRTC Ready', 'In-browser two-way calling is active!');
      });

      client.on('telnyx.error', (error) => {
        console.error('[Telnyx WebRTC Error]', error);
        state.webrtcConnected = false;
        els.webrtcBadge.className = 'status-pill status-error';
        els.webrtcStatusText.textContent = 'WebRTC: Error';
        els.btnConnectWebRtc.classList.remove('btn-webrtc-active');
        els.btnConnectWebRtcText.textContent = 'Connect WebRTC';
        showToast('WebRTC Auth Error', error.message || 'SIP credentials rejected by Telnyx');
      });

      client.on('telnyx.socket.close', () => {
        console.log('[Telnyx WebRTC] Connection closed');
        state.webrtcConnected = false;
        els.webrtcBadge.className = 'status-pill status-sim';
        els.webrtcStatusText.textContent = 'WebRTC: Disconnected';
        els.btnConnectWebRtc.classList.remove('btn-webrtc-active');
        els.btnConnectWebRtcText.textContent = 'Connect WebRTC';
      });

      client.on('telnyx.notification', (notification) => {
        console.log('[Telnyx WebRTC Notification]', notification);
        if (notification.type === 'callUpdate' && notification.call) {
          const callState = notification.call.state;
          if (callState === 'ringing') {
            els.callStatusBadge.textContent = 'Ringing...';
            els.callStatusBadge.style.color = 'var(--accent-sky)';
          } else if (callState === 'active' || callState === 'answering') {
            els.callStatusBadge.textContent = 'Connected (2-Way Audio)';
            els.callStatusBadge.style.color = 'var(--accent-emerald)';
            startCallTimer();
          } else if (callState === 'hangup' || callState === 'destroy') {
            handleWebRtcHangup();
          }
        }
      });

      client.connect();
      state.webrtcClient = client;
    } catch (err) {
      console.error('[Telnyx WebRTC] Initialization failed:', err);
      showToast('WebRTC Error', err.message);
      els.webrtcBadge.className = 'status-pill status-error';
      els.webrtcStatusText.textContent = 'WebRTC: Error';
      els.btnConnectWebRtcText.textContent = 'Connect WebRTC';
    }
  }

  function handleWebRtcHangup() {
    stopCallTimer();
    const duration = state.callDurationSeconds;

    if (state.activeCall) {
      fetch('/api/call/log-webrtc-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: state.activeCall.to,
          duration,
          status: 'completed',
          contactName: state.activeCall.contactName,
          company: state.activeCall.company
        })
      }).catch(() => {});
    }

    els.activeCallHud.classList.add('hidden');
    state.activeCall = null;
    state.webrtcCall = null;
    state.callDurationSeconds = 0;
    updateCallTimerDisplay();
    showToast('Call Ended', `Call duration: ${duration}s`);
    fetchRecordings();
    fetchLogs();
  }

  // =========================================================================
  // CALL CONTROLS & TIMERS
  // =========================================================================
  function startCallTimer() {
    stopCallTimer();
    state.callDurationSeconds = 0;
    updateCallTimerDisplay();

    state.activeCallTimer = setInterval(() => {
      state.callDurationSeconds++;
      updateCallTimerDisplay();
    }, 1000);
  }

  function stopCallTimer() {
    if (state.activeCallTimer) {
      clearInterval(state.activeCallTimer);
      state.activeCallTimer = null;
    }
  }

  function updateCallTimerDisplay() {
    const mins = Math.floor(state.callDurationSeconds / 60).toString().padStart(2, '0');
    const secs = (state.callDurationSeconds % 60).toString().padStart(2, '0');
    els.callTimerDisplay.textContent = `${mins}:${secs}`;
  }

  async function initiateCall(targetNumber) {
    const rawNumber = targetNumber || els.phoneNumberInput.value.trim();
    if (!rawNumber) {
      showToast('Missing Number', 'Please enter a valid phone number to dial.');
      els.phoneNumberInput.focus();
      return;
    }

    // Format full E.164
    const countryCode = els.countryCodeSelect.value;
    const fullNumber = rawNumber.startsWith('+') ? rawNumber : `${countryCode}${rawNumber.replace(/^0+/, '')}`;

    const matched = findContact(fullNumber);
    state.activeCall = {
      to: fullNumber,
      contactName: matched ? matched.name : 'Prospect Lead',
      company: matched ? matched.company : '',
      direction: 'outbound',
      callControlId: null
    };

    // Update In-Call HUD UI
    els.callHudName.textContent = state.activeCall.contactName;
    els.callHudCompany.textContent = state.activeCall.company || 'Direct Outreach';
    els.callHudNumber.textContent = fullNumber;
    els.callStatusBadge.textContent = 'Connecting...';
    els.callStatusBadge.style.color = 'var(--accent-sky)';
    els.activeCallHud.classList.remove('hidden');

    // 1. If WebRTC is authenticated and connected, initiate in-browser 2-way call
    if (state.webrtcConnected && state.webrtcClient) {
      try {
        const fromNumber = state.webrtcConfig?.callerNumber || els.currentFromNumber.textContent.replace(/[^\d+]/g, '');
        const remoteElem = document.getElementById('telnyxRemoteAudio') || els.telnyxRemoteAudio;

        state.webrtcCall = state.webrtcClient.newCall({
          destinationNumber: fullNumber,
          callerNumber: fromNumber,
          audio: true,
          remoteElement: remoteElem
        });

        showToast('WebRTC In-Browser Call', `Audio connected to browser mic & speaker`);
        els.callStatusBadge.textContent = 'Calling (WebRTC)...';
        startCallTimer();
        return;
      } catch (err) {
        console.error('WebRTC newCall error:', err);
        showToast('WebRTC Error', err.message);
      }
    }

    // 2. Fallback to Call Control REST API if WebRTC not connected
    try {
      showToast('Dialing via Telnyx', `Calling ${fullNumber} (Tip: Click "Connect WebRTC" for browser audio)`);
      const response = await fetch('/api/call/dial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: fullNumber })
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to place call');
      }

      state.activeCall.callControlId = result.call?.call_control_id || result.call?.id;
      startCallTimer();
      els.callStatusBadge.textContent = 'In Call';
      els.callStatusBadge.style.color = 'var(--accent-emerald)';
    } catch (err) {
      console.error('Call dial error:', err);
      showToast('Call Failed', err.message);
      hangupCall();
    }
  }

  async function hangupCall() {
    stopCallTimer();
    const duration = state.callDurationSeconds;

    // Hangup WebRTC call if active
    if (state.webrtcCall) {
      try {
        state.webrtcCall.hangup();
      } catch (e) {
        console.warn('WebRTC hangup warning:', e);
      }
      state.webrtcCall = null;
    }

    if (state.activeCall) {
      try {
        if (state.activeCall.callControlId) {
          await fetch('/api/call/hangup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              callControlId: state.activeCall.callControlId,
              duration,
              to: state.activeCall.to,
              contactName: state.activeCall.contactName,
              company: state.activeCall.company,
              direction: state.activeCall.direction
            })
          });
        } else {
          await fetch('/api/call/log-webrtc-call', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: state.activeCall.to,
              duration,
              status: 'completed',
              contactName: state.activeCall.contactName,
              company: state.activeCall.company
            })
          });
        }
      } catch (err) {
        console.warn('Hangup network warning:', err);
      }
    }

    els.activeCallHud.classList.add('hidden');
    state.activeCall = null;
    state.callDurationSeconds = 0;
    updateCallTimerDisplay();
    showToast('Call Ended', `Call duration: ${els.callTimerDisplay.textContent}`);
    fetchRecordings();
    fetchLogs();
  }

  // =========================================================================
  // CALL TRANSFER IMPLEMENTATION
  // =========================================================================
  function openTransferModal() {
    if (!state.activeCall) {
      showToast('No Active Call', 'You must have an ongoing call to transfer.');
      return;
    }
    if (els.transferTargetPhone) {
      els.transferTargetPhone.value = '';
    }
    if (els.transferModal) {
      els.transferModal.classList.remove('hidden');
      if (els.transferTargetPhone) {
        setTimeout(() => els.transferTargetPhone.focus(), 100);
      }
    }
  }

  function closeTransferModal() {
    if (els.transferModal) {
      els.transferModal.classList.add('hidden');
    }
  }

  async function executeTransfer(e) {
    if (e) e.preventDefault();
    if (!state.activeCall) {
      showToast('Transfer Failed', 'No active call to transfer.');
      closeTransferModal();
      return;
    }

    const rawTarget = els.transferTargetPhone.value.trim();
    if (!rawTarget) {
      showToast('Missing Number', 'Please enter destination number to transfer call.');
      return;
    }

    // Format target phone
    const defaultCountry = els.countryCodeSelect ? els.countryCodeSelect.value : '+1';
    const targetPhone = rawTarget.startsWith('+') ? rawTarget : `${defaultCountry}${rawTarget.replace(/^0+/, '')}`;

    showToast('Transferring Call', `Routing active call to ${targetPhone}...`);
    if (els.callStatusBadge) {
      els.callStatusBadge.textContent = 'Transferring...';
      els.callStatusBadge.style.color = 'var(--accent-sky)';
    }

    try {
      // 1. If active call has a Telnyx Call Control ID
      if (state.activeCall.callControlId) {
        const response = await fetch('/api/call/transfer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            callControlId: state.activeCall.callControlId,
            to: targetPhone
          })
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Failed to transfer call via Telnyx');
        }
      } else if (state.webrtcCall) {
        // 2. If WebRTC call has transfer capability (SIP REFER or WebRTC blind transfer)
        try {
          if (typeof state.webrtcCall.transfer === 'function') {
            state.webrtcCall.transfer(targetPhone);
          } else {
            // Disconnect browser leg as fallback
            state.webrtcCall.hangup();
          }
        } catch (webrtcErr) {
          console.warn('WebRTC transfer attempt:', webrtcErr);
        }
      }

      showToast('Call Transferred', `Call successfully handed off to ${targetPhone}`);
      closeTransferModal();

      // End local dialer view for this transferred call
      stopCallTimer();
      els.activeCallHud.classList.add('hidden');
      state.activeCall = null;
      state.callDurationSeconds = 0;
      updateCallTimerDisplay();
      fetchLogs();
    } catch (err) {
      console.error('Call transfer error:', err);
      showToast('Transfer Failed', err.message);
      if (els.callStatusBadge) {
        els.callStatusBadge.textContent = 'Connected';
        els.callStatusBadge.style.color = 'var(--accent-emerald)';
      }
    }
  }

  function handleCallStatusEvent(data) {
    if (data.status === 'answered') {
      if (els.callStatusBadge) {
        els.callStatusBadge.textContent = 'Connected';
        els.callStatusBadge.style.color = 'var(--accent-emerald)';
      }
      startCallTimer();
    } else if (data.status === 'transferred') {
      showToast('Call Transferred', `Call routed to ${data.transferTo}`);
      stopCallTimer();
      els.activeCallHud.classList.add('hidden');
      state.activeCall = null;
      fetchLogs();
    } else if (data.status === 'completed') {
      stopCallTimer();
      els.activeCallHud.classList.add('hidden');
      state.activeCall = null;
      fetchRecordings();
      fetchLogs();
    }
  }

  // =========================================================================
  // INCOMING CALL MODAL & RINGTONE
  // =========================================================================
  let incomingCallData = null;

  function handleIncomingCallEvent(data) {
    incomingCallData = data;
    els.incomingCallerName.textContent = data.callerName || 'Unknown Caller';
    els.incomingCallerCompany.textContent = data.company || 'Inbound Prospect';
    els.incomingCallerPhone.textContent = data.from || '+1 (000) 000-0000';

    els.incomingCallModal.classList.remove('hidden');
    startRingtone();
    triggerSystemNotification('Incoming Outreach Call', `${data.callerName || 'Caller'} (${data.from}) is calling!`);
  }

  function dismissIncomingCallModal() {
    stopRingtone();
    els.incomingCallModal.classList.add('hidden');
    incomingCallData = null;
  }

  els.btnAnswerIncoming.addEventListener('click', async () => {
    if (!incomingCallData) return;
    const callData = { ...incomingCallData };
    dismissIncomingCallModal();

    state.activeCall = {
      to: callData.from,
      contactName: callData.callerName,
      company: callData.company,
      direction: 'inbound',
      callControlId: callData.callControlId
    };

    els.callHudName.textContent = state.activeCall.contactName;
    els.callHudCompany.textContent = state.activeCall.company;
    els.callHudNumber.textContent = state.activeCall.to;
    els.callStatusBadge.textContent = 'Connected';
    els.activeCallHud.classList.remove('hidden');
    startCallTimer();

    try {
      await fetch('/api/call/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callControlId: callData.callControlId })
      });
    } catch (err) {
      console.warn('Answer call error:', err);
    }
  });

  els.btnDeclineIncoming.addEventListener('click', async () => {
    if (!incomingCallData) return;
    const callControlId = incomingCallData.callControlId;
    dismissIncomingCallModal();

    try {
      await fetch('/api/call/hangup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callControlId, duration: 0 })
      });
    } catch (e) {
      // ignore
    }
    showToast('Call Declined', 'Inbound call declined.');
  });

  // =========================================================================
  // SMS & WHATSAPP INBOUND EVENT HANDLING
  // =========================================================================
  function handleIncomingSmsEvent(data) {
    const isWa = data.channel === 'WHATSAPP' || data.type === 'WHATSAPP';
    if (isWa) {
      showToast(`WhatsApp from ${data.senderName || data.from}`, data.text || data.content, 6000);
      triggerSystemNotification(`WhatsApp from ${data.senderName || data.from}`, data.text || data.content);
      // Increment unread count if not currently chatting with this contact
      const cleanPhone = normalizePhone(data.from);
      if (cleanPhone && cleanPhone !== normalizePhone(state.activeWaPhone)) {
        const unreadKey = 'wa_unread_' + cleanPhone;
        const currentUnread = parseInt(localStorage.getItem(unreadKey) || '0', 10);
        localStorage.setItem(unreadKey, currentUnread + 1);
      }
    } else {
      showToast(`SMS from ${data.senderName || data.from}`, data.text, 6000);
      triggerSystemNotification(`SMS from ${data.senderName || data.from}`, data.text);
    }
    fetchLogs();
  }

  async function sendOutboundSms() {
    const to = els.smsRecipientInput.value.trim();
    const text = els.smsMessageInput.value.trim();

    if (!to) {
      showToast('Recipient Required', 'Please enter a recipient phone number.');
      els.smsRecipientInput.focus();
      return;
    }
    if (!text) {
      showToast('Message Required', 'Please enter SMS content to send.');
      els.smsMessageInput.focus();
      return;
    }

    els.btnSendSms.disabled = true;
    els.btnSendSms.innerHTML = '<span>Sending...</span>';

    try {
      const response = await fetch('/api/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, text })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send SMS');
      }

      showToast('SMS Sent', `Delivered to ${to}`);
      els.smsMessageInput.value = '';
      updateCharCounter();
      fetchLogs();
    } catch (err) {
      console.error('Send SMS error:', err);
      showToast('SMS Error', err.message);
    } finally {
      els.btnSendSms.disabled = false;
      els.btnSendSms.innerHTML = `
        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        <span>Send SMS</span>
      `;
    }
  }

  function updateCharCounter() {
    const len = els.smsMessageInput.value.length;
    const segments = Math.max(1, Math.ceil(len / 160));
    els.smsCharCounter.textContent = `${len} / ${segments * 160} (${segments} segment${segments > 1 ? 's' : ''})`;
  }

  els.smsMessageInput.addEventListener('input', updateCharCounter);

  els.smsTemplateSelect.addEventListener('change', (e) => {
    const template = e.target.value;
    if (!template) return;

    const recipient = els.smsRecipientInput.value.trim();
    const contact = findContact(recipient);
    const name = contact ? contact.name.split(' ')[0] : 'there';
    const company = contact?.company || 'your team';

    const personalized = template
      .replace(/{{name}}/g, name)
      .replace(/{{company}}/g, company);

    els.smsMessageInput.value = personalized;
    updateCharCounter();
  });

  els.btnCopyFromDialer.addEventListener('click', () => {
    const dialerNum = els.phoneNumberInput.value.trim();
    if (dialerNum) {
      const countryCode = els.countryCodeSelect.value;
      const full = dialerNum.startsWith('+') ? dialerNum : `${countryCode}${dialerNum}`;
      els.smsRecipientInput.value = full;
      showToast('Copied', `Using ${full} for SMS outreach`);
    } else {
      showToast('Dialer Empty', 'No number in dialer to copy.');
    }
  });

  els.btnSendSms.addEventListener('click', sendOutboundSms);

  // =========================================================================
  // WHATSAPP PER-PERSON CHAT CONTROLLER
  // =========================================================================
  function normalizePhone(p) {
    if (!p) return '';
    return String(p).replace(/[^0-9+]/g, '');
  }

  function formatDisplayTime(isoString) {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      const now = new Date();
      if (d.toDateString() === now.toDateString()) {
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
      return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    } catch (e) {
      return '';
    }
  }

  // Load and group conversations table (per-person WhatsApp chats)
  function renderWhatsAppConversations() {
    if (!els.waConversationsList) return;

    // 1. Filter all logs that are WHATSAPP messages
    const waLogs = state.logs.filter(l => 
      l.channel === 'WHATSAPP' || 
      l.messageType === 'WHATSAPP' ||
      (l.type === 'sms' && (l.from?.startsWith('whatsapp:') || l.to?.startsWith('whatsapp:')))
    );

    // 2. Build conversations Map grouped by remote contact phone number
    const convMap = new Map();
    let totalUnread = 0;

    // First populate from existing address book contacts if they exist
    state.contacts.forEach(c => {
      const phoneClean = normalizePhone(c.phone);
      if (phoneClean && !convMap.has(phoneClean)) {
        convMap.set(phoneClean, {
          id: 'conv_' + phoneClean,
          phone_number: c.phone,
          contact_name: c.name || 'Lead',
          channel: 'WHATSAPP',
          last_message: '',
          last_updated_at: c.createdAt || new Date(0).toISOString(),
          unread_count: parseInt(localStorage.getItem('wa_unread_' + phoneClean) || '0', 10),
          messages: []
        });
      }
    });

    // Populate and group with actual message logs
    waLogs.forEach(msg => {
      const isOutbound = msg.direction === 'outbound';
      const remotePhone = isOutbound ? msg.to : msg.from;
      const cleanPhone = normalizePhone(remotePhone);
      if (!cleanPhone) return;

      const matchedContact = findContact(cleanPhone);
      const contactName = matchedContact?.name || msg.contactName || msg.senderName || 'Prospect';

      let conv = convMap.get(cleanPhone);
      if (!conv) {
        conv = {
          id: 'conv_' + cleanPhone,
          phone_number: remotePhone,
          contact_name: contactName,
          channel: 'WHATSAPP',
          last_message: msg.content || msg.text || '',
          last_updated_at: msg.timestamp || new Date().toISOString(),
          unread_count: parseInt(localStorage.getItem('wa_unread_' + cleanPhone) || '0', 10),
          messages: []
        };
        convMap.set(cleanPhone, conv);
      }

      // Add message to conversation's message list
      conv.messages.push({
        id: msg.id || ('msg_' + Date.now()),
        conversation_id: conv.id,
        direction: isOutbound ? 'outbound' : 'inbound',
        body: msg.content || msg.text || '',
        status: msg.status || (isOutbound ? 'delivered' : 'read'),
        created_at: msg.timestamp || new Date().toISOString()
      });

      // Update latest message & timestamp if newer
      if (!conv.last_updated_at || new Date(msg.timestamp) >= new Date(conv.last_updated_at)) {
        conv.last_message = msg.content || msg.text || '';
        conv.last_updated_at = msg.timestamp;
      }
    });

    // Convert map to array and sort conversations by latest updated message timestamp descending
    let convList = Array.from(convMap.values())
      .filter(c => c.messages.length > 0 || c.phone_number === state.activeWaPhone)
      .sort((a, b) => new Date(b.last_updated_at) - new Date(a.last_updated_at));

    // Update global state
    state.waConversations = convList;

    // Filter by search query if any
    const filterQuery = (els.waSearchInput?.value || '').trim().toLowerCase();
    if (filterQuery) {
      convList = convList.filter(c => 
        (c.contact_name && c.contact_name.toLowerCase().includes(filterQuery)) ||
        (c.phone_number && c.phone_number.toLowerCase().includes(filterQuery)) ||
        (c.last_message && c.last_message.toLowerCase().includes(filterQuery))
      );
    }

    // Render badge count in WhatsApp tab button
    convList.forEach(c => { totalUnread += (c.unread_count || 0); });
    if (els.waUnreadTotalBadge) {
      if (totalUnread > 0) {
        els.waUnreadTotalBadge.textContent = totalUnread;
        els.waUnreadTotalBadge.classList.remove('hidden');
      } else {
        els.waUnreadTotalBadge.classList.add('hidden');
      }
    }

    // Render HTML for Conversations Table in left sidebar
    if (convList.length === 0) {
      els.waConversationsList.innerHTML = `
        <div style="padding: 24px 16px; text-align: center; color: var(--text-dim); font-size: 0.78rem;">
          No WhatsApp chats yet.<br>Click <strong>New</strong> above to start chatting with any phone number!
        </div>
      `;
      return;
    }

    els.waConversationsList.innerHTML = convList.map(conv => {
      const initials = (conv.contact_name || 'W').split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
      const isActive = normalizePhone(conv.phone_number) === normalizePhone(state.activeWaPhone);
      const timeStr = formatDisplayTime(conv.last_updated_at);
      const unreadBadge = (conv.unread_count > 0 && !isActive) 
        ? `<span class="wa-unread-badge">${conv.unread_count}</span>` 
        : '';

      return `
        <div class="wa-conv-item ${isActive ? 'active' : ''}" data-phone="${escapeHtml(conv.phone_number)}">
          <div class="wa-avatar">${initials}</div>
          <div class="wa-conv-info">
            <div class="wa-conv-top">
              <span class="wa-conv-name">${escapeHtml(conv.contact_name)}</span>
              <span class="wa-conv-time">${timeStr}</span>
            </div>
            <div class="wa-conv-bottom">
              <span class="wa-conv-preview">${escapeHtml(conv.last_message || conv.phone_number)}</span>
              ${unreadBadge}
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Attach click listeners to open conversation
    els.waConversationsList.querySelectorAll('.wa-conv-item').forEach(item => {
      item.addEventListener('click', () => {
        openWhatsAppChat(item.dataset.phone);
      });
    });

    // If an active chat is already selected, re-render its messages window
    if (state.activeWaPhone) {
      renderActiveWhatsAppThread();
    }
  }

  // Open a specific conversation thread
  function openWhatsAppChat(phone) {
    if (!phone) return;
    state.activeWaPhone = phone;
    const cleanPhone = normalizePhone(phone);

    // Clear unread count for this contact
    localStorage.removeItem('wa_unread_' + cleanPhone);

    // Highlight selected item in list
    els.waConversationsList?.querySelectorAll('.wa-conv-item').forEach(item => {
      item.classList.toggle('active', normalizePhone(item.dataset.phone) === cleanPhone);
    });

    // Update active chat header
    const matched = findContact(phone);
    const conv = state.waConversations.find(c => normalizePhone(c.phone_number) === cleanPhone);
    const contactName = matched?.name || conv?.contact_name || 'Prospect';
    const initials = contactName.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();

    if (els.waNoChatSelected) els.waNoChatSelected.classList.add('hidden');
    if (els.waActiveChatView) els.waActiveChatView.classList.remove('hidden');

    if (els.waHeaderAvatar) els.waHeaderAvatar.textContent = initials;
    if (els.waHeaderName) els.waHeaderName.textContent = contactName;
    if (els.waHeaderPhone) els.waHeaderPhone.textContent = phone;

    renderActiveWhatsAppThread();
    if (els.waMessageInput) {
      els.waMessageInput.focus();
    }
  }

  // Render the messages table for the active chat window
  function renderActiveWhatsAppThread() {
    if (!state.activeWaPhone || !els.waMessagesThread) return;

    const cleanActivePhone = normalizePhone(state.activeWaPhone);
    // Find conversation or extract messages from state.logs
    const conv = state.waConversations.find(c => normalizePhone(c.phone_number) === cleanActivePhone);

    let messages = conv ? [...conv.messages] : [];

    // Sort chronologically ascending for chat view
    messages.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    if (messages.length === 0) {
      els.waMessagesThread.innerHTML = `
        <div style="margin: auto; text-align: center; color: var(--text-dim); font-size: 0.8rem; padding: 20px;">
          No messages with ${escapeHtml(state.activeWaPhone)} yet.<br>Send a message below to start the WhatsApp conversation!
        </div>
      `;
      return;
    }

    els.waMessagesThread.innerHTML = messages.map(m => {
      const timeStr = formatDisplayTime(m.created_at);
      const isOutbound = m.direction === 'outbound';
      const statusTick = isOutbound ? '<span class="wa-status-ticks">✓✓</span>' : '';

      return `
        <div class="wa-bubble ${m.direction}">
          <div class="wa-bubble-text">${escapeHtml(m.body)}</div>
          <div class="wa-bubble-meta">
            <span>${timeStr}</span>
            ${statusTick}
          </div>
        </div>
      `;
    }).join('');

    // Scroll to bottom of message thread
    els.waMessagesThread.scrollTop = els.waMessagesThread.scrollHeight;
  }

  // Send WhatsApp message to active contact
  async function sendWhatsAppMessage() {
    const to = state.activeWaPhone;
    const text = els.waMessageInput?.value.trim();

    if (!to) {
      showToast('No Contact', 'Please select or enter a contact number to send WhatsApp.');
      return;
    }
    if (!text) {
      showToast('Empty Message', 'Please enter a message to send.');
      els.waMessageInput?.focus();
      return;
    }

    if (els.btnSendWhatsApp) {
      els.btnSendWhatsApp.disabled = true;
      els.btnSendWhatsApp.innerHTML = '<span>...</span>';
    }

    try {
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, text })
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to send WhatsApp message via Telnyx');
      }

      showToast('WhatsApp Sent', `Message delivered to ${to}`);
      if (els.waMessageInput) els.waMessageInput.value = '';

      // Immediately fetch logs and update chat view
      await fetchLogs();
      renderWhatsAppConversations();
    } catch (err) {
      console.error('Send WhatsApp error:', err);
      showToast('WhatsApp Failed', err.message);
    } finally {
      if (els.btnSendWhatsApp) {
        els.btnSendWhatsApp.disabled = false;
        els.btnSendWhatsApp.innerHTML = `
          <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          <span>Send</span>
        `;
      }
    }
  }

  // WhatsApp Event Listeners
  if (els.btnSendWhatsApp) {
    els.btnSendWhatsApp.addEventListener('click', sendWhatsAppMessage);
  }

  if (els.waMessageInput) {
    els.waMessageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendWhatsAppMessage();
      }
    });
  }

  if (els.waSearchInput) {
    els.waSearchInput.addEventListener('input', renderWhatsAppConversations);
  }

  // New Chat Drawer toggles
  if (els.btnNewWaChat) {
    els.btnNewWaChat.addEventListener('click', () => {
      els.waNewChatDrawer?.classList.toggle('hidden');
      if (!els.waNewChatDrawer?.classList.contains('hidden')) {
        els.waNewChatPhone?.focus();
      }
    });
  }

  if (els.btnCancelWaChatDrawer) {
    els.btnCancelWaChatDrawer.addEventListener('click', () => {
      els.waNewChatDrawer?.classList.add('hidden');
    });
  }

  if (els.btnStartWaChatConfirm) {
    els.btnStartWaChatConfirm.addEventListener('click', () => {
      const raw = els.waNewChatPhone?.value.trim();
      if (!raw) {
        showToast('Number Required', 'Enter phone number with country code e.g. +1234567890');
        return;
      }
      const defaultCountry = els.countryCodeSelect ? els.countryCodeSelect.value : '+1';
      const full = raw.startsWith('+') ? raw : `${defaultCountry}${raw}`;
      els.waNewChatDrawer?.classList.add('hidden');
      if (els.waNewChatPhone) els.waNewChatPhone.value = '';
      openWhatsAppChat(full);
      renderWhatsAppConversations();
    });
  }

  // Quick call/sms buttons inside WhatsApp active chat header
  if (els.btnCallWaContact) {
    els.btnCallWaContact.addEventListener('click', () => {
      if (!state.activeWaPhone) return;
      els.phoneNumberInput.value = state.activeWaPhone;
      checkMatchedContact();
      switchToTab('panel-dialer');
      initiateCall(state.activeWaPhone);
    });
  }

  if (els.btnSmsWaContact) {
    els.btnSmsWaContact.addEventListener('click', () => {
      if (!state.activeWaPhone) return;
      els.smsRecipientInput.value = state.activeWaPhone;
      switchSubTab('tab-sms');
    });
  }

  // Simulate WhatsApp button
  if (els.btnSimWa) {
    els.btnSimWa.addEventListener('click', async () => {
      try {
        showToast('Simulating WhatsApp', 'Generating inbound WhatsApp message...');
        await fetch('/api/whatsapp/simulate-incoming', { method: 'POST' });
      } catch (e) {
        console.warn('Simulate WA error:', e);
      }
    });
  }

  // =========================================================================
  // CALL RECORDING AUDIO PLAYER
  // =========================================================================
  let isPlayingRecording = false;

  function initAudioPlayer() {
    const audio = els.globalAudioPlayer;

    els.btnPlayPause.addEventListener('click', () => {
      if (!audio.src) {
        if (state.recordings.length > 0) {
          loadRecordingIntoPlayer(state.recordings[0]);
        } else {
          showToast('No Recordings', 'No audio recordings available to play.');
          return;
        }
      }
      if (audio.paused) {
        audio.play();
      } else {
        audio.pause();
      }
    });

    audio.addEventListener('play', () => {
      isPlayingRecording = true;
      els.playPauseIcon.innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
    });

    audio.addEventListener('pause', () => {
      isPlayingRecording = false;
      els.playPauseIcon.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"/>';
    });

    audio.addEventListener('timeupdate', () => {
      if (!isNaN(audio.duration) && audio.duration > 0) {
        const progress = (audio.currentTime / audio.duration) * 100;
        els.playerSeekSlider.value = progress;
        els.playerCurrentTime.textContent = formatDuration(Math.floor(audio.currentTime));
      }
    });

    audio.addEventListener('loadedmetadata', () => {
      els.playerDuration.textContent = formatDuration(Math.floor(audio.duration || 0));
    });

    audio.addEventListener('ended', () => {
      isPlayingRecording = false;
      els.playPauseIcon.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"/>';
      els.playerSeekSlider.value = 0;
      els.playerCurrentTime.textContent = '00:00';
    });

    els.playerSeekSlider.addEventListener('input', (e) => {
      if (!isNaN(audio.duration)) {
        audio.currentTime = (e.target.value / 100) * audio.duration;
      }
    });
  }

  function loadRecordingIntoPlayer(rec) {
    els.playerCallName.textContent = `${rec.contactName} (${rec.company || 'Prospect'})`;
    els.playerCallMeta.textContent = `${rec.phoneNumber} • ${rec.durationFormatted} • Dual Channel`;
    els.globalAudioPlayer.src = rec.audioUrl;
    els.globalAudioPlayer.play();
  }

  function renderRecordings() {
    els.recordingCountBadge.textContent = state.recordings.length;
    if (state.recordings.length === 0) {
      els.recordingsList.innerHTML = '<div class="empty-placeholder">No call recordings found yet. Outbound calls over 3 seconds are archived here automatically.</div>';
      return;
    }

    els.recordingsList.innerHTML = state.recordings.map((rec) => {
      const timeStr = new Date(rec.date).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      return `
        <div class="recording-row-card" data-id="${rec.id}">
          <div class="rec-info">
            <span class="rec-info-name">${escapeHtml(rec.contactName)} <small style="color:var(--text-dim);font-weight:normal;">• ${escapeHtml(rec.company || '')}</small></span>
            <div class="rec-info-meta">
              <span>${rec.phoneNumber}</span>
              <span>⏱ ${rec.durationFormatted}</span>
              <span>${timeStr}</span>
            </div>
          </div>
          <div class="rec-actions">
            <button class="btn btn-secondary btn-xs btn-play-rec" data-url="${rec.audioUrl}" data-name="${escapeHtml(rec.contactName)}" data-phone="${rec.phoneNumber}" data-dur="${rec.durationFormatted}">
              ▶ Play
            </button>
            <a href="${rec.audioUrl}" download="recording-${rec.id}.wav" class="btn btn-ghost btn-xs" title="Download Audio WAV">
              ↓ Save
            </a>
          </div>
        </div>
      `;
    }).join('');

    // Attach play handlers
    els.recordingsList.querySelectorAll('.btn-play-rec').forEach((btn) => {
      btn.addEventListener('click', () => {
        loadRecordingIntoPlayer({
          contactName: btn.dataset.name,
          company: '',
          phoneNumber: btn.dataset.phone,
          durationFormatted: btn.dataset.dur,
          audioUrl: btn.dataset.url
        });
      });
    });
  }

  // =========================================================================
  // CONTACTS CRM (CRUD & Lead List)
  // =========================================================================
  function findContact(phone) {
    if (!phone) return null;
    const clean = phone.replace(/[^0-9+]/g, '');
    return state.contacts.find(c => {
      const cClean = (c.phone || '').replace(/[^0-9+]/g, '');
      return cClean === clean || cClean.endsWith(clean.slice(-8));
    });
  }

  function getStatusClass(status) {
    switch (status) {
      case 'New Lead': return 'lead-new';
      case 'Interested': return 'lead-interested';
      case 'Meeting Booked': return 'lead-meeting';
      case 'Follow Up': return 'lead-followup';
      case 'Contacted': return 'lead-contacted';
      case 'Do Not Call': return 'lead-dnc';
      default: return 'lead-new';
    }
  }

  function renderContacts() {
    const search = els.contactSearchInput.value.toLowerCase().trim();
    let filtered = state.contacts;

    if (state.currentFilter !== 'all') {
      filtered = filtered.filter(c => c.status === state.currentFilter);
    }

    if (search) {
      filtered = filtered.filter(c => 
        (c.name && c.name.toLowerCase().includes(search)) ||
        (c.company && c.company.toLowerCase().includes(search)) ||
        (c.phone && c.phone.includes(search)) ||
        (c.email && c.email.toLowerCase().includes(search))
      );
    }

    els.leadCountBadge.textContent = filtered.length;

    if (filtered.length === 0) {
      els.contactsList.innerHTML = '<div class="empty-placeholder" style="padding:20px;text-align:center;color:var(--text-dim);font-size:0.8rem;">No matching leads found. Click "+ New Lead" to add one.</div>';
      return;
    }

    els.contactsList.innerHTML = filtered.map(c => `
      <div class="contact-card-item" data-id="${c.id}">
        <div class="contact-top">
          <div>
            <span class="contact-lead-name">${escapeHtml(c.name)}</span>
            <span class="contact-lead-company">${escapeHtml(c.company || 'Enterprise')}</span>
          </div>
          <span class="lead-pill ${getStatusClass(c.status)}">${c.status}</span>
        </div>
        <div class="contact-phone-badge">${escapeHtml(c.phone)}</div>
        ${c.notes ? `<div class="contact-notes-snippet">${escapeHtml(c.notes)}</div>` : ''}
        <div class="contact-actions-row">
          <div class="quick-dial-group">
            <button class="btn-lead-call" data-phone="${c.phone}" data-name="${escapeHtml(c.name)}" title="Direct Call via Telnyx">
              📞 Call
            </button>
            <button class="btn-lead-sms" data-phone="${c.phone}" data-name="${escapeHtml(c.name)}" title="Direct SMS">
              💬 SMS
            </button>
          </div>
          <div style="display:flex;gap:4px;">
            <button class="btn btn-ghost btn-xs btn-edit-lead" data-id="${c.id}" title="Edit Lead">✎</button>
            <button class="btn btn-ghost btn-xs btn-del-lead" data-id="${c.id}" title="Delete Lead" style="color:var(--accent-rose)">✕</button>
          </div>
        </div>
      </div>
    `).join('');

    // Attach direct action listeners
    els.contactsList.querySelectorAll('.btn-lead-call').forEach(b => {
      b.addEventListener('click', () => {
        els.phoneNumberInput.value = b.dataset.phone;
        checkMatchedContact();
        switchToTab('panel-dialer');
        initiateCall(b.dataset.phone);
      });
    });

    els.contactsList.querySelectorAll('.btn-lead-sms').forEach(b => {
      b.addEventListener('click', () => {
        els.smsRecipientInput.value = b.dataset.phone;
        switchToTab('panel-outreach');
        switchSubTab('tab-sms');
        els.smsMessageInput.focus();
        showToast('Ready for SMS', `Composing outreach message to ${b.dataset.name}`);
      });
    });

    els.contactsList.querySelectorAll('.btn-edit-lead').forEach(b => {
      b.addEventListener('click', () => openEditContactModal(b.dataset.id));
    });

    els.contactsList.querySelectorAll('.btn-del-lead').forEach(b => {
      b.addEventListener('click', () => deleteContact(b.dataset.id));
    });
  }

  function openAddContactModal() {
    els.editContactId.value = '';
    els.contactModalTitle.textContent = 'Add New Outreach Lead';
    els.contactForm.reset();
    els.contactModal.classList.remove('hidden');
    els.contactFormName.focus();
  }

  function openEditContactModal(id) {
    const contact = state.contacts.find(c => c.id === id);
    if (!contact) return;

    els.editContactId.value = contact.id;
    els.contactModalTitle.textContent = 'Edit Lead';
    els.contactFormName.value = contact.name || '';
    els.contactFormCompany.value = contact.company || '';
    els.contactFormPhone.value = contact.phone || '';
    els.contactFormEmail.value = contact.email || '';
    els.contactFormStatus.value = contact.status || 'New Lead';
    els.contactFormNotes.value = contact.notes || '';

    els.contactModal.classList.remove('hidden');
  }

  function closeContactModal() {
    els.contactModal.classList.add('hidden');
  }

  async function saveContactForm(e) {
    e.preventDefault();
    const id = els.editContactId.value;
    const payload = {
      name: els.contactFormName.value.trim(),
      company: els.contactFormCompany.value.trim(),
      phone: els.contactFormPhone.value.trim(),
      email: els.contactFormEmail.value.trim(),
      status: els.contactFormStatus.value,
      notes: els.contactFormNotes.value.trim()
    };

    try {
      if (id) {
        // Update
        const res = await fetch(`/api/contacts/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error('Update failed');
        showToast('Lead Updated', `Saved changes for ${payload.name}`);
      } else {
        // Create
        const res = await fetch('/api/contacts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error('Creation failed');
        showToast('Lead Created', `Added ${payload.name} to CRM`);
      }
      closeContactModal();
      await fetchContacts();
      checkMatchedContact();
    } catch (err) {
      showToast('Error', err.message);
    }
  }

  async function deleteContact(id) {
    if (!confirm('Are you sure you want to remove this lead?')) return;
    try {
      const res = await fetch(`/api/contacts/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      showToast('Lead Removed', 'Lead successfully deleted.');
      await fetchContacts();
      checkMatchedContact();
    } catch (err) {
      showToast('Error', err.message);
    }
  }

  // =========================================================================
  // LIVE ACTIVITY LOGS
  // =========================================================================
  function renderActivityLogs() {
    els.logsCountBadge.textContent = state.logs.length;

    if (state.logs.length === 0) {
      els.activityLogsList.innerHTML = '<div class="empty-placeholder" style="padding:20px;text-align:center;color:var(--text-dim);font-size:0.8rem;">No recent activities. Make a call or send an SMS to see live events.</div>';
      return;
    }

    els.activityLogsList.innerHTML = state.logs.map(log => {
      const isCall = log.type === 'call';
      const time = new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const dirSymbol = log.direction === 'outbound' ? '↗' : '↙';
      return `
        <div class="log-item-card">
          <div class="log-icon-wrap ${isCall ? 'log-call' : 'log-sms'}">
            ${isCall ? '📞' : '💬'}
          </div>
          <div class="log-content-wrap">
            <div class="log-title-row">
              <span class="log-name">${escapeHtml(log.contactName || 'Lead')} <small style="color:var(--text-dim)">(${dirSymbol} ${log.direction})</small></span>
              <span class="log-time">${time}</span>
            </div>
            <div class="log-detail">${escapeHtml(log.content || '')}</div>
          </div>
        </div>
      `;
    }).join('');

    // Also populate SMS thread feed
    renderSmsFeed();
  }

  function renderSmsFeed() {
    const smsLogs = state.logs.filter(l => l.type === 'sms' && l.channel !== 'WHATSAPP');
    if (smsLogs.length === 0) {
      els.smsMessageList.innerHTML = '<div class="empty-placeholder" style="padding:20px;text-align:center;color:var(--text-dim);font-size:0.8rem;">No SMS messages yet. Send an outreach SMS above!</div>';
      return;
    }

    els.smsMessageList.innerHTML = smsLogs.map(msg => {
      const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return `
        <div class="sms-bubble ${msg.direction}">
          <div>${escapeHtml(msg.content)}</div>
          <div class="sms-meta">
            <span>${escapeHtml(msg.contactName || (msg.direction === 'outbound' ? 'Outreach' : 'Prospect'))}</span>
            <span>${time}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  async function clearLogs() {
    try {
      await fetch('/api/logs', { method: 'DELETE' });
      state.logs = [];
      renderActivityLogs();
      showToast('Logs Cleared', 'Activity feed reset.');
    } catch (e) {
      console.warn(e);
    }
  }

  // =========================================================================
  // DIALER INPUT & KEYPAD LOGIC
  // =========================================================================
  function checkMatchedContact() {
    const raw = els.phoneNumberInput.value.trim();
    if (!raw) {
      els.contactMatchedBanner.classList.add('hidden');
      return;
    }
    const full = raw.startsWith('+') ? raw : `${els.countryCodeSelect.value}${raw}`;
    const matched = findContact(full);

    if (matched) {
      const initials = matched.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
      els.matchedInitials.textContent = initials;
      els.matchedName.textContent = matched.name;
      els.matchedCompany.textContent = matched.company || 'Enterprise Prospect';
      els.matchedStatus.textContent = matched.status;
      els.matchedStatus.className = `lead-pill ${getStatusClass(matched.status)}`;
      els.contactMatchedBanner.classList.remove('hidden');
    } else {
      els.contactMatchedBanner.classList.add('hidden');
    }
  }

  // Keypad clicks
  els.keypadGrid.querySelectorAll('.keypad-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.key;
      playDtmfTone(key);

      // Send WebRTC DTMF if active call
      if (state.webrtcCall) {
        try {
          state.webrtcCall.dtmf(key);
        } catch (e) {}
      }

      els.phoneNumberInput.value += key;
      checkMatchedContact();
    });
  });

  els.btnBackspace.addEventListener('click', () => {
    els.phoneNumberInput.value = els.phoneNumberInput.value.slice(0, -1);
    checkMatchedContact();
  });

  els.btnClearInput.addEventListener('click', () => {
    els.phoneNumberInput.value = '';
    checkMatchedContact();
    els.phoneNumberInput.focus();
  });

  els.phoneNumberInput.addEventListener('input', checkMatchedContact);

  els.btnStartCall.addEventListener('click', () => {
    initiateCall();
  });

  // Call HUD controls
  els.btnEndCall.addEventListener('click', hangupCall);

  if (els.btnTransferCall) {
    els.btnTransferCall.addEventListener('click', openTransferModal);
  }

  if (els.btnCloseTransferModal) {
    els.btnCloseTransferModal.addEventListener('click', closeTransferModal);
  }

  if (els.btnCancelTransfer) {
    els.btnCancelTransfer.addEventListener('click', closeTransferModal);
  }

  if (els.transferForm) {
    els.transferForm.addEventListener('submit', executeTransfer);
  }

  els.btnMuteCall.addEventListener('click', () => {
    state.isMuted = !state.isMuted;

    // Toggle WebRTC mute if active in-browser call
    if (state.webrtcCall) {
      try {
        if (state.isMuted) {
          state.webrtcCall.muteAudio();
        } else {
          state.webrtcCall.unmuteAudio();
        }
      } catch (e) {
        console.warn('WebRTC mute error:', e);
      }
    }

    if (state.isMuted) {
      els.btnMuteCall.classList.add('active-muted');
      els.btnMuteCall.querySelector('span').textContent = 'Unmute';
      showToast('Mic Muted', 'Microphone muted.');
    } else {
      els.btnMuteCall.classList.remove('active-muted');
      els.btnMuteCall.querySelector('span').textContent = 'Mute';
      showToast('Mic Active', 'Microphone active.');
    }
  });

  els.btnKeypadToggle.addEventListener('click', () => {
    els.keypadGrid.classList.toggle('hidden');
  });

  // Connect WebRTC button
  if (els.btnConnectWebRtc) {
    els.btnConnectWebRtc.addEventListener('click', () => {
      connectWebRtc(true);
    });
  }

  // =========================================================================
  // SIMULATION TOOLS (1-Click Verification)
  // =========================================================================
  els.btnSimCall.addEventListener('click', async () => {
    try {
      showToast('Simulating Call', 'Generating inbound caller test...');
      await fetch('/api/call/simulate-incoming', { method: 'POST' });
    } catch (e) {
      console.warn(e);
    }
  });

  els.btnSimSms.addEventListener('click', async () => {
    try {
      showToast('Simulating SMS', 'Generating inbound lead SMS...');
      await fetch('/api/sms/simulate-incoming', { method: 'POST' });
    } catch (e) {
      console.warn(e);
    }
  });

  // =========================================================================
  // TAB NAVIGATION & RESPONSIVE SWITCHER
  // =========================================================================
  function switchToTab(targetCardId) {
    els.dashCards.forEach(c => {
      c.classList.remove('active-mobile');
      if (c.id === targetCardId) {
        c.classList.add('active-mobile');
      }
    });
    els.mobileTabs.forEach(t => {
      t.classList.toggle('active', t.dataset.target === targetCardId);
    });
  }

  els.mobileTabs.forEach(btn => {
    btn.addEventListener('click', () => switchToTab(btn.dataset.target));
  });

  function switchSubTab(targetTabId) {
    const parentCard = document.getElementById(targetTabId)?.closest('.dash-card');
    if (!parentCard) return;

    parentCard.querySelectorAll('.card-tab-nav .tab-item').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.content === targetTabId);
    });

    parentCard.querySelectorAll('.tab-body').forEach(body => {
      if (body.id === targetTabId) {
        body.classList.remove('hidden');
        body.classList.add('active');
      } else {
        body.classList.add('hidden');
        body.classList.remove('active');
      }
    });
  }

  els.tabButtons.forEach(btn => {
    btn.addEventListener('click', () => switchSubTab(btn.dataset.content));
  });

  // Filter chips in contacts
  els.filterChips.forEach(chip => {
    chip.addEventListener('click', () => {
      els.filterChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      state.currentFilter = chip.dataset.filter;
      renderContacts();
    });
  });

  els.contactSearchInput.addEventListener('input', renderContacts);
  els.btnOpenAddContact.addEventListener('click', openAddContactModal);
  els.btnCloseContactModal.addEventListener('click', closeContactModal);
  els.btnCancelContact.addEventListener('click', closeContactModal);
  els.contactForm.addEventListener('submit', saveContactForm);
  els.btnClearLogs.addEventListener('click', clearLogs);

  // =========================================================================
  // PWA REGISTRATION & INSTALL BANNER
  // =========================================================================
  function initPwa() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then(reg => console.log('[PWA] Service Worker registered:', reg.scope))
        .catch(err => console.warn('[PWA] Service Worker registration failed:', err));
    }

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      state.deferredPrompt = e;
      els.btnInstallPwa.classList.remove('hidden');
    });

    els.btnInstallPwa.addEventListener('click', async () => {
      if (!state.deferredPrompt) return;
      state.deferredPrompt.prompt();
      const { outcome } = await state.deferredPrompt.userChoice;
      console.log(`[PWA] Install prompt outcome: ${outcome}`);
      state.deferredPrompt = null;
      els.btnInstallPwa.classList.add('hidden');
    });

    els.btnNotificationPrompt.addEventListener('click', requestNotificationPermission);
  }

  // =========================================================================
  // DATA FETCHING INITIALIZERS
  // =========================================================================
  async function fetchStatus() {
    try {
      const res = await fetch('/api/status');
      const data = await res.json();
      updateTelnyxStatus(data.telnyx);
    } catch (e) {
      console.warn('Status fetch error:', e);
    }
  }

  async function fetchContacts() {
    try {
      const res = await fetch('/api/contacts');
      state.contacts = await res.json();
      renderContacts();
    } catch (e) {
      console.warn('Contacts fetch error:', e);
    }
  }

  async function fetchLogs() {
    try {
      const res = await fetch('/api/logs');
      state.logs = await res.json();
      renderActivityLogs();
      renderWhatsAppConversations();
    } catch (e) {
      console.warn('Logs fetch error:', e);
    }
  }

  async function fetchRecordings() {
    try {
      const res = await fetch('/api/recordings');
      state.recordings = await res.json();
      renderRecordings();
    } catch (e) {
      console.warn('Recordings fetch error:', e);
    }
  }

  // Utilities
  function escapeHtml(str) {
    if (!str && str !== 0) return '';
    let val = str;
    if (typeof val === 'object') {
      if (val.body) val = val.body;
      else if (val.text) val = typeof val.text === 'object' ? val.text.body || JSON.stringify(val.text) : val.text;
      else {
        try {
          val = JSON.stringify(val);
        } catch (e) {
          val = String(val);
        }
      }
    }
    return String(val)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatDuration(seconds) {
    const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
    const secs = (seconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  }

  // =========================================================================
  // INITIALIZATION ON LOAD
  // =========================================================================
  window.addEventListener('DOMContentLoaded', () => {
    initWebSocket();
    initAudioPlayer();
    initPwa();

    fetchStatus();
    fetchContacts();
    fetchLogs();
    fetchRecordings();

    // Re-query tabButtons to ensure dynamically added tabs like WhatsApp are registered
    document.querySelectorAll('.card-tab-nav .tab-item').forEach(btn => {
      btn.addEventListener('click', () => switchSubTab(btn.dataset.content));
    });

    // Check WebRTC credentials and auto-connect if configured
    fetch('/api/webrtc/credentials')
      .then(res => res.json())
      .then(cfg => {
        state.webrtcConfig = cfg;
        if (cfg.configured) {
          connectWebRtc(false);
        } else {
          if (els.webrtcBadge) {
            els.webrtcBadge.className = 'status-pill status-sim';
            els.webrtcStatusText.textContent = 'WebRTC: Click Connect';
          }
        }
      })
      .catch(e => console.warn('WebRTC auto-check failed:', e));

    // Enable Web Audio on first user interaction
    document.body.addEventListener('click', () => {
      getAudioContext();
    }, { once: true });
  });

})();

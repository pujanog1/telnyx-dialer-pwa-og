/**
 * Telnyx API Integration Helper
 * Supports Telnyx Call Control v2 and Messaging v2 APIs.
 * Automatically falls back to high-fidelity simulation when API credentials are placeholders.
 */

const TELNYX_API_BASE = 'https://api.telnyx.com/v2';

class TelnyxClient {
  constructor() {
    this.apiKey = process.env.TELNYX_API_KEY || '';
    this.fromNumber = process.env.TELNYX_PHONE_NUMBER || '+18005550199';
    this.connectionId = process.env.TELNYX_CONNECTION_ID || '';
  }

  isConfigured() {
    return (
      Boolean(this.apiKey) &&
      !this.apiKey.includes('YOUR_') &&
      this.apiKey.length > 15
    );
  }

  getStatus() {
    return {
      configured: this.isConfigured(),
      fromNumber: this.fromNumber,
      connectionIdSet: Boolean(this.connectionId && !this.connectionId.includes('YOUR_')),
      mode: this.isConfigured() ? 'live' : 'simulation'
    };
  }

  /**
   * Place an outbound call via Telnyx Call Control v2
   */
  async makeCall({ to, from, connectionId, webhookUrl, clientState }) {
    const callerId = from || this.fromNumber;
    const targetConnectionId = connectionId || this.connectionId;

    if (!this.isConfigured()) {
      console.log(`[Telnyx Simulator] Simulating outbound call to ${to} from ${callerId}`);
      const mockCallId = 'sim_call_' + Math.random().toString(36).substring(2, 9);
      return {
        success: true,
        mode: 'simulated',
        call_control_id: mockCallId,
        call_leg_id: 'leg_' + Math.random().toString(36).substring(2, 9),
        to,
        from: callerId,
        call_session_id: 'sess_' + Math.random().toString(36).substring(2, 9),
        status: 'initiated'
      };
    }

    try {
      const payload = {
        to,
        from: callerId,
        connection_id: targetConnectionId,
        webhook_url: webhookUrl,
        client_state: Buffer.from(clientState || 'outbound-dialer').toString('base64')
      };

      const response = await fetch(`${TELNYX_API_BASE}/calls`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.errors?.[0]?.detail || `Telnyx Error ${response.status}: ${JSON.stringify(data)}`);
      }

      return {
        success: true,
        mode: 'live',
        ...data.data
      };
    } catch (err) {
      console.error('[Telnyx API Error] makeCall failed:', err.message);
      throw err;
    }
  }

  /**
   * Hang up an active call
   */
  async hangupCall(callControlId) {
    if (!this.isConfigured() || callControlId.startsWith('sim_')) {
      console.log(`[Telnyx Simulator] Call ${callControlId} hung up`);
      return { success: true, mode: 'simulated', call_control_id: callControlId, status: 'hungup' };
    }

    try {
      const response = await fetch(`${TELNYX_API_BASE}/calls/${encodeURIComponent(callControlId)}/actions/hangup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({})
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.errors?.[0]?.detail || `Telnyx hangup error ${response.status}`);
      }
      return { success: true, mode: 'live', ...data.data };
    } catch (err) {
      console.error('[Telnyx API Error] hangupCall failed:', err.message);
      throw err;
    }
  }

  /**
   * Answer an incoming call
   */
  async answerCall(callControlId) {
    if (!this.isConfigured() || callControlId.startsWith('sim_')) {
      console.log(`[Telnyx Simulator] Call ${callControlId} answered`);
      return { success: true, mode: 'simulated', call_control_id: callControlId, status: 'answered' };
    }

    try {
      const response = await fetch(`${TELNYX_API_BASE}/calls/${encodeURIComponent(callControlId)}/actions/answer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({})
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.errors?.[0]?.detail || `Telnyx answer error ${response.status}`);
      }
      return { success: true, mode: 'live', ...data.data };
    } catch (err) {
      console.error('[Telnyx API Error] answerCall failed:', err.message);
      throw err;
    }
  }

  /**
   * Send an SMS via Telnyx Messaging v2 API
   */
  async sendSms({ to, from, text }) {
    const sender = from || this.fromNumber;

    if (!this.isConfigured()) {
      console.log(`[Telnyx Simulator] Simulating outbound SMS to ${to} from ${sender}: "${text}"`);
      return {
        success: true,
        mode: 'simulated',
        id: 'sim_msg_' + Math.random().toString(36).substring(2, 9),
        to,
        from: sender,
        text,
        status: 'delivered',
        created_at: new Date().toISOString()
      };
    }

    try {
      const payload = {
        to,
        from: sender,
        text
      };

      const response = await fetch(`${TELNYX_API_BASE}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.errors?.[0]?.detail || `Telnyx SMS error ${response.status}: ${JSON.stringify(data)}`);
      }

      return {
        success: true,
        mode: 'live',
        ...data.data
      };
    } catch (err) {
      console.error('[Telnyx API Error] sendSms failed:', err.message);
      throw err;
    }
  }

  /**
   * Send a WhatsApp message via Telnyx Messaging v2 API
   */
  async sendWhatsApp({ to, from, text }) {
    const sender = from || this.fromNumber;

    if (!this.isConfigured()) {
      console.log(`[Telnyx Simulator] Simulating outbound WhatsApp to ${to} from ${sender}: "${text}"`);
      return {
        success: true,
        mode: 'simulated',
        id: 'sim_wa_' + Math.random().toString(36).substring(2, 9),
        to,
        from: sender,
        text,
        type: 'WHATSAPP',
        status: 'delivered',
        created_at: new Date().toISOString()
      };
    }

    try {
      const payload = {
        to,
        from: sender,
        whatsapp_message: {
          type: 'text',
          text: {
            body: text
          }
        }
      };

      if (process.env.TELNYX_MESSAGING_PROFILE_ID) {
        payload.messaging_profile_id = process.env.TELNYX_MESSAGING_PROFILE_ID;
      }

      const response = await fetch(`${TELNYX_API_BASE}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.errors?.[0]?.detail || `Telnyx WhatsApp error ${response.status}: ${JSON.stringify(data)}`);
      }

      return {
        success: true,
        mode: 'live',
        ...data.data
      };
    } catch (err) {
      console.error('[Telnyx API Error] sendWhatsApp failed:', err.message);
      throw err;
    }
  }

  /**
   * Send an approved WhatsApp Template message via Telnyx Messaging v2 API
   * Uses payload structure: whatsapp_message -> template -> { name, language, components }
   */
  async sendWhatsAppTemplate({ to, from, templateName, language = 'en_US', components = [], previewText = '' }) {
    const sender = from || this.fromNumber;

    if (!this.isConfigured()) {
      console.log(`[Telnyx Simulator] Simulating WhatsApp Template "${templateName}" to ${to} from ${sender}`);
      return {
        success: true,
        mode: 'simulated',
        id: 'sim_wa_tpl_' + Math.random().toString(36).substring(2, 9),
        to,
        from: sender,
        template: templateName,
        type: 'WHATSAPP',
        status: 'delivered',
        created_at: new Date().toISOString()
      };
    }

    try {
      const payload = {
        to,
        from: sender,
        whatsapp_message: {
          type: 'template',
          template: {
            name: templateName,
            language: {
              code: language,
              policy: 'deterministic'
            },
            components: components
          }
        }
      };

      if (process.env.TELNYX_MESSAGING_PROFILE_ID) {
        payload.messaging_profile_id = process.env.TELNYX_MESSAGING_PROFILE_ID;
      }

      const response = await fetch(`${TELNYX_API_BASE}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.errors?.[0]?.detail || `Telnyx WhatsApp Template error ${response.status}: ${JSON.stringify(data)}`);
      }

      return {
        success: true,
        mode: 'live',
        ...data.data
      };
    } catch (err) {
      console.error('[Telnyx API Error] sendWhatsAppTemplate failed:', err.message);
      throw err;
    }
  }

  /**
   * Transfer an active call to another phone number or SIP URI
   * Telnyx Call Control v2: POST /calls/{call_control_id}/actions/transfer
   */
  async transferCall({ callControlId, to }) {
    if (!this.isConfigured() || (callControlId && callControlId.startsWith('sim_'))) {
      console.log(`[Telnyx Simulator] Transferring call ${callControlId} to ${to}`);
      return {
        success: true,
        mode: 'simulated',
        call_control_id: callControlId,
        to,
        status: 'transferring'
      };
    }

    try {
      const payload = {
        to
      };

      const response = await fetch(`${TELNYX_API_BASE}/calls/${encodeURIComponent(callControlId)}/actions/transfer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(payload)
      });

      return {
        success: true,
        mode: 'live',
        ...data.data
      };
    } catch (err) {
      console.error('[Telnyx API Error] transferCall failed:', err.message);
      throw err;
    }
  }

  /**
   * Initiate 3-Way Conference Call by dialing third party via /v2/calls
   */
  async threeWayCall({ to, from, webhookUrl }) {
    const sender = from || this.fromNumber;
    if (!this.isConfigured()) {
      const simCallId = 'sim_3way_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
      console.log(`[Telnyx Simulator] Creating 3-way outbound call to ${to} (call_control_id: ${simCallId})`);
      return {
        success: true,
        mode: 'simulated',
        call_control_id: simCallId,
        to,
        from: sender,
        status: 'dialing'
      };
    }

    try {
      const payload = {
        to,
        from: sender,
        connection_id: process.env.TELNYX_CONNECTION_ID,
        webhook_url: webhookUrl
      };

      const response = await fetch(`${TELNYX_API_BASE}/calls`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.errors?.[0]?.detail || `Telnyx 3-way dial error ${response.status}: ${JSON.stringify(data)}`);
      }

      return {
        success: true,
        mode: 'live',
        call_control_id: data.data?.call_control_id,
        ...data.data
      };
    } catch (err) {
      console.error('[Telnyx API Error] threeWayCall failed:', err.message);
      throw err;
    }
  }

  /**
   * Bridge two call control legs together: POST /v2/calls/{originalCallId}/actions/bridge
   */
  async bridgeCall({ originalCallId, newCallId }) {
    if (!this.isConfigured() || (originalCallId && originalCallId.startsWith('sim_'))) {
      console.log(`[Telnyx Simulator] Bridging calls ${originalCallId} and ${newCallId}`);
      return {
        success: true,
        mode: 'simulated',
        originalCallId,
        newCallId,
        status: 'bridged'
      };
    }

    try {
      const payload = {
        call_control_id: newCallId
      };

      const response = await fetch(`${TELNYX_API_BASE}/calls/${encodeURIComponent(originalCallId)}/actions/bridge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.errors?.[0]?.detail || `Telnyx bridge error ${response.status}: ${JSON.stringify(data)}`);
      }

      return {
        success: true,
        mode: 'live',
        ...data.data
      };
    } catch (err) {
      console.error('[Telnyx API Error] bridgeCall failed:', err.message);
      throw err;
    }
  }

  /**
   * Create a conference and add the existing call leg
   * Telnyx Call Control v2: POST /v2/conferences
   */
  async createConferenceWithCall({ callControlId, name }) {
    const confName = name || ('conf_' + Date.now());

    if (!this.isConfigured() || (callControlId && String(callControlId).startsWith('sim_'))) {
      const simConfId = 'sim_conf_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
      console.log(`[Telnyx Simulator] Created conference "${confName}" (id: ${simConfId}) with call ${callControlId}`);
      return {
        success: true,
        mode: 'simulated',
        id: simConfId,
        conference_id: simConfId,
        name: confName,
        call_control_id: callControlId
      };
    }

    try {
      const payload = {
        name: confName,
        call_control_id: callControlId,
        start_conference_on_create: true
      };

      const response = await fetch(`${TELNYX_API_BASE}/conferences`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.errors?.[0]?.detail || `Telnyx create conference error ${response.status}: ${JSON.stringify(data)}`);
      }

      return {
        success: true,
        mode: 'live',
        id: data.data?.id,
        conference_id: data.data?.id,
        ...data.data
      };
    } catch (err) {
      console.error('[Telnyx API Error] createConferenceWithCall failed:', err.message);
      throw err;
    }
  }

  /**
   * Add a call leg to an active conference
   * Telnyx Call Control v2: POST /v2/conferences/{conference_id}/participants
   */
  async addParticipantToConference({ conferenceId, callControlId }) {
    if (!this.isConfigured() || (conferenceId && String(conferenceId).startsWith('sim_')) || (callControlId && String(callControlId).startsWith('sim_'))) {
      console.log(`[Telnyx Simulator] Added participant ${callControlId} to conference ${conferenceId}`);
      return {
        success: true,
        mode: 'simulated',
        conference_id: conferenceId,
        call_control_id: callControlId,
        status: 'joined'
      };
    }

    try {
      const payload = {
        call_control_id: callControlId
      };

      const response = await fetch(`${TELNYX_API_BASE}/conferences/${encodeURIComponent(conferenceId)}/participants`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.errors?.[0]?.detail || `Telnyx add participant error ${response.status}: ${JSON.stringify(data)}`);
      }

      return {
        success: true,
        mode: 'live',
        ...data.data
      };
    } catch (err) {
      console.error('[Telnyx API Error] addParticipantToConference failed:', err.message);
      throw err;
    }
  }

  /**
   * Remove a participant from a conference or hangup participant
   * Telnyx Call Control v2: POST /v2/conferences/{conference_id}/participants/{call_control_id}/leave
   */
  async leaveConferenceParticipant({ conferenceId, callControlId }) {
    if (!this.isConfigured() || (conferenceId && String(conferenceId).startsWith('sim_')) || (callControlId && String(callControlId).startsWith('sim_'))) {
      console.log(`[Telnyx Simulator] Participant ${callControlId} left conference ${conferenceId}`);
      return {
        success: true,
        mode: 'simulated',
        conference_id: conferenceId,
        call_control_id: callControlId,
        status: 'left'
      };
    }

    try {
      const response = await fetch(`${TELNYX_API_BASE}/conferences/${encodeURIComponent(conferenceId)}/participants/${encodeURIComponent(callControlId)}/leave`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({})
      });

      const data = await response.json();
      if (!response.ok) {
        return await this.hangupCall(callControlId);
      }

      return {
        success: true,
        mode: 'live',
        ...data.data
      };
    } catch (err) {
      console.error('[Telnyx API Error] leaveConferenceParticipant fallback to hangup:', err.message);
      return await this.hangupCall(callControlId);
    }
  }
}

module.exports = new TelnyxClient();


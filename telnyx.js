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
}

module.exports = new TelnyxClient();

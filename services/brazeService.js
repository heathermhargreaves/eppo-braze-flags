const axios = require('axios');

class BrazeService {
  constructor() {
    this.apiKey = process.env.BRAZE_API_KEY;
    this.restEndpoint = process.env.BRAZE_REST_ENDPOINT;
    this.appId = process.env.BRAZE_APP_ID;
  }

  // Send a message via Braze
  async sendMessage({ userId, messageType, customAttributes = {} }) {
    if (!this.apiKey || !this.restEndpoint) {
      throw new Error('Braze API configuration missing. Check BRAZE_API_KEY and BRAZE_REST_ENDPOINT');
    }

    const messageData = {
      external_user_ids: [userId],
      messages: {
        push: {
          alert: messageType === 'treatment' 
            ? "🎉 Special offer just for you!" 
            : "Welcome to our app!",
          title: messageType === 'treatment' 
            ? "Exclusive Deal" 
            : "Welcome",
          extra: {
            variant: messageType,
            ...customAttributes
          }
        }
      }
    };

    try {
      const response = await axios.post(
        `${this.restEndpoint}/messages/send`,
        messageData,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return response;
    } catch (error) {
      console.error('Braze send message error:', error.response?.data || error.message);
      throw error;
    }
  }

  // Track a custom event in Braze
  async trackEvent({ userId, eventName, eventProperties = {}, userAttributes = {} }) {
    if (!this.apiKey || !this.restEndpoint) {
      throw new Error('Braze API configuration missing. Check BRAZE_API_KEY and BRAZE_REST_ENDPOINT');
    }

    const eventData = {
      attributes: [{
        external_id: userId,
        ...userAttributes
      }],
      events: [{
        external_id: userId,
        name: eventName,
        time: new Date().toISOString(),
        properties: eventProperties
      }]
    };

    try {
      const response = await axios.post(
        `${this.restEndpoint}/users/track`,
        eventData,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return response;
    } catch (error) {
      console.error('Braze track event error:', error.response?.data || error.message);
      throw error;
    }
  }

  // Update user attributes in Braze
  async updateUserAttributes({ userId, attributes }) {
    if (!this.apiKey || !this.restEndpoint) {
      throw new Error('Braze API configuration missing. Check BRAZE_API_KEY and BRAZE_REST_ENDPOINT');
    }

    const attributeData = {
      attributes: [{
        external_id: userId,
        email_subscribe: 'subscribed', // Explicitly subscribe the user
        push_subscribe: 'subscribed',   // Also subscribe them to push
        ...attributes
      }]
    };

    try {
      const response = await axios.post(
        `${this.restEndpoint}/users/track`,
        attributeData,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return response;
    } catch (error) {
      console.error('Braze update attributes error:', error.response?.data || error.message);
      throw error;
    }
  }

  // Trigger a campaign
  async triggerCampaign({ userId, campaignId, triggerProperties = {}, userAttributes = {} }) {
    if (!this.apiKey || !this.restEndpoint || !campaignId) {
      throw new Error('Braze API configuration or campaignId is missing.');
    }

    const campaignData = {
      campaign_id: campaignId,
      recipients: [
        {
          external_user_id: userId,
          trigger_properties: triggerProperties,
          attributes: {
            email_subscribe: 'subscribed',
            push_subscribe: 'subscribed',
            ...userAttributes
          }
        },
      ],
    };

    try {
      console.log(`🚀 Triggering Braze campaign ${campaignId} for user ${userId}...`);
      const response = await axios.post(
        `${this.restEndpoint}/campaigns/trigger/send`,
        campaignData,
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
        }
      );
      console.log('✅ Braze campaign triggered successfully:', response.data);
      return response.data;
    } catch (error) {
      console.error(`Braze campaign trigger error for campaign ${campaignId}:`, error.response ? error.response.data : error.message);
      throw new Error(`Request failed with status code ${error.response ? error.response.status : 'unknown'}`);
    }
  }

  // Trigger a Canvas
  async triggerCanvas({ canvasId, userId, canvasEntryProperties = {} }) {
    if (!this.apiKey || !this.restEndpoint) {
      throw new Error('Braze API configuration missing. Check BRAZE_API_KEY and BRAZE_REST_ENDPOINT');
    }

    const canvasData = {
      canvas_id: canvasId,
      recipients: [{
        external_user_id: userId,
        canvas_entry_properties: canvasEntryProperties
      }]
    };

    try {
      const response = await axios.post(
        `${this.restEndpoint}/canvas/trigger/send`,
        canvasData,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return response;
    } catch (error) {
      console.error('Braze trigger canvas error:', error.response?.data || error.message);
      throw error;
    }
  }
}

module.exports = new BrazeService(); 
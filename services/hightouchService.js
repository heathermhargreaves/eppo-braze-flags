const axios = require('axios');

class HightouchService {
  constructor() {
    this.apiKey = process.env.HIGHTOUCH_API_KEY;
    this.baseUrl = process.env.HIGHTOUCH_API_URL || 'https://personalization.us-west-2.hightouch.com';
    this.collectionName = process.env.HIGHTOUCH_COLLECTION_NAME || 'customers';
  }

  /**
   * Look up user audiences from Hightouch Personalization API
   * @param {string} userId - The user ID to look up
   * @returns {Object} User audiences and attributes
   */
  async getUserAudiences(userId) {
    if (!this.apiKey) {
      console.warn('⚠️ HIGHTOUCH_API_KEY not configured, skipping audience lookup');
      return { audiences: {}, attributes: {} };
    }

    try {
      console.log(`🔍 Looking up Hightouch audiences for user ${userId}...`);
      
      const response = await axios.get(
        `${this.baseUrl}/v1/collections/${this.collectionName}/records/id/${userId}`,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 5000 // 5 second timeout
        }
      );

      const userData = response.data;
      
      // Extract audiences (typically in _audiences field)
      const audiences = userData._audiences || {};
      
      // Extract other relevant attributes
      const attributes = {
        lifetime_value: userData.lifetime_value,
        churn_risk: userData.churn_risk,
        tier: userData.tier,
        subscription_status: userData.subscription_status,
        // Add any other attributes you want to use in experiments
        ...userData.custom_attributes
      };

      console.log(`✅ Found ${Object.keys(audiences).length} audiences for user ${userId}`);
      
      return {
        audiences,
        attributes,
        found: true
      };

    } catch (error) {
      if (error.response?.status === 404) {
        console.log(`ℹ️ User ${userId} not found in Hightouch`);
        return { audiences: {}, attributes: {}, found: false };
      }
      
      console.error(`Hightouch API error for user ${userId}:`, error.response?.data || error.message);
      
      // Return empty data on error to not block the main flow
      return { audiences: {}, attributes: {}, found: false, error: error.message };
    }
  }

  /**
   * Check if user has a specific audience membership
   * @param {string} userId - The user ID
   * @param {string} audienceName - The audience to check (e.g., 'premium_subscriber')
   * @returns {boolean} Whether user is in the audience
   */
  async isUserInAudience(userId, audienceName) {
    const { audiences } = await this.getUserAudiences(userId);
    return audiences[audienceName] === true;
  }

  /**
   * Get user attributes enriched with audience data for Eppo experiments
   * @param {string} userId - The user ID
   * @param {Object} existingAttributes - Any existing user attributes from browser/request
   * @returns {Object} Enriched attributes for experiments
   */
  async getEnrichedUserAttributes(userId, existingAttributes = {}) {
    const { audiences, attributes, found } = await this.getUserAudiences(userId);
    
    let enrichedAttributes;
    
    if (found && Object.keys(audiences).length > 0) {
      // Hightouch data available - use it as primary source
      console.log(`✅ Using Hightouch audiences for user ${userId}`);
      enrichedAttributes = {
        ...existingAttributes,
        ...attributes,
        // Add specific audience flags as boolean attributes
        premium_subscriber: audiences.premium_subscriber === true,
        high_value_customer: audiences.high_value_customer === true,
        at_risk_churn: audiences.at_risk_churn === true,
        // Add any other audience flags you want to use in experiments
      };
    } else {
      // No Hightouch data - use browser/request attributes as subject attributes
      console.log(`ℹ️ No Hightouch data for user ${userId}, using browser attributes as subject attributes`);
      enrichedAttributes = {
        ...existingAttributes,
        // Map subscription tier to premium_subscriber boolean
        premium_subscriber: existingAttributes.premium_subscriber || 
                           existingAttributes.isPremium || 
                           existingAttributes.subscription_tier === 'premium' ||
                           existingAttributes.subscriptionTier === 'premium' ||
                           false,
        high_value_customer: existingAttributes.high_value_customer || 
                            existingAttributes.isHighValue || 
                            existingAttributes.subscription_tier === 'premium' ||
                            existingAttributes.subscriptionTier === 'premium' ||
                            false,
        at_risk_churn: existingAttributes.at_risk_churn || 
                      existingAttributes.isAtRisk || 
                      existingAttributes.subscription_tier === 'free' ||
                      existingAttributes.subscriptionTier === 'free' ||
                      false,
        // Pass through any other browser attributes that might be relevant for experiments
        subscription_tier: existingAttributes.subscription_tier || 
                          existingAttributes.subscriptionTier || 
                          existingAttributes.tier,
        user_segment: existingAttributes.user_segment || existingAttributes.segment,
        country: existingAttributes.country,
        device_type: existingAttributes.device_type,
        // Add a flag to indicate the source of the data
        _attribute_source: 'browser'
      };
    }

    // Remove undefined/null values
    Object.keys(enrichedAttributes).forEach(key => {
      if (enrichedAttributes[key] === undefined || enrichedAttributes[key] === null) {
        delete enrichedAttributes[key];
      }
    });

    console.log(`🔍 Final enriched attributes for user ${userId}:`, enrichedAttributes);
    return enrichedAttributes;
  }
}

module.exports = new HightouchService();

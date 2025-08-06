const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
require('dotenv').config();

const eppoService = require('./services/eppoService');
const brazeService = require('./services/brazeService');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));
app.use(cors());
app.use(express.json());

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Initialize Eppo client
eppoService.initializeEppo();

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    eppoInitialized: eppoService.isInitialized()
  });
});

// Main webhook endpoint - processes incoming webhooks and triggers messages
app.post('/', async (req, res) => {
  console.log('📨 Received webhook at /:', JSON.stringify(req.body, null, 2));
  try {
    const result = await processWebhookAndSendMessage(req.body);
    // Braze expects a simple JSON object with the message content.
    // The UI, however, uses the fuller 'result' object.
    res.status(200).json(result.messagePreview || {});
  } catch (error) {
    console.error('Webhook processing error:', error.message);
    res.status(500).json({
      status: "error",
      message: "Failed to process webhook",
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Webhook endpoint - alternative route for webhook processing
app.post('/webhook', async (req, res) => {
  console.log('📨 Received webhook at /webhook:', JSON.stringify(req.body, null, 2));
  try {
    const response = await processWebhookAndSendMessage(req.body);
    console.log('✅ Sending webhook response:', JSON.stringify(response.messagePreview, null, 2));
    // Braze expects a simple JSON object with the message content.
    res.status(200).json(response.messagePreview || {});
  } catch (error) {
    console.error('Webhook processing error:', error.message);
    res.status(500).json({
      status: "error",
      message: "Failed to process webhook",
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Get assignment endpoint for demo UI
app.post('/get-assignment', async (req, res) => {
  try {
    const { userId, userAttributes = {} } = req.body;
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }
    
    // Set the eppo_gate attribute in Braze for this user
    try {
      await brazeService.updateUserAttributes({
        userId,
        attributes: { eppo_gate: true },
      });
      console.log(`✅ Successfully set eppo_gate:true for user ${userId}`);
    } catch (brazeError) {
      // Log the error but don't block the main flow
      console.error(`Braze update attributes error for user ${userId}:`, brazeError.message);
    }
    
    const flagKey = process.env.EXPERIMENT_FLAG_KEY || 'braze_message_experiment';
    const assignmentData = eppoService.getAssignment(flagKey, userId, userAttributes);
    
    const response = {
      ...assignmentData,
      serverInfo: {
        flagKey,
        eppoInitialized: eppoService.isInitialized(),
        clientInfo: eppoService.getClientInfo(),
        environment: process.env.NODE_ENV || 'development'
      }
    };
    
    res.json(response);
  } catch (error) {
    console.error('Error getting assignment:', error.message);
    res.status(500).json({
      error: 'Failed to get assignment',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Send message endpoint for demo UI (demo mode)
app.post('/send-message', async (req, res) => {
  try {
    console.log('--- Received /send-message request ---');
    const { userId, userAttributes = {} } = req.body;
    console.log(`userId from /send-message: ${userId}`);

    if (!userId) {
      console.log('userId is missing, returning 400.');
      return res.status(400).json({ error: 'userId is required' });
    }
    
    console.log('Calling processWebhookAndSendMessage from /send-message...');
    const webhookResponse = await processWebhookAndSendMessage({ 
      userId,                 // internal call – keep camelCase so it is NOT classified as Braze webhook
      user_attributes: userAttributes 
    });
    console.log('processWebhookAndSendMessage completed successfully.');

    const responsePayload = {
      messagePreview: webhookResponse.messagePreview,
      eventToTrack: {
        name: "message_sent_demo",
        properties: {
          eppo_flag_key: webhookResponse.flagKey,
          eppo_assignment: webhookResponse.eppoAssignment,
        }
      },
      webhookResponse,
      note: 'This is a demo response. No real messages were sent.'
    };
    
    console.log('Sending final response to the UI.');
    res.json(responsePayload);

  } catch (error) {
    console.error('--- FATAL ERROR in /send-message endpoint ---', error);
    res.status(500).json({
      error: 'Failed to process demo message',
      details: error.message
    });
  }
});

// Event tracking endpoint
app.post('/track-event', async (req, res) => {
  try {
    const { userId, eventName, eventProperties = {}, userAttributes = {} } = req.body;

    if (!userId || !eventName) {
      return res.status(400).json({ error: 'userId and eventName are required' });
    }

    // Get feature flag assignment
    const flagKey = process.env.EXPERIMENT_FLAG_KEY || 'braze_message_experiment';
    const flagAssignment = eppoService.getAssignment(flagKey, userId, userAttributes);

    // Add flag information to event properties
    const enrichedProperties = {
      ...eventProperties,
      eppo_flag_key: flagKey,
      eppo_assignment: flagAssignment,
      experiment_id: process.env.EXPERIMENT_FLAG_KEY,
      timestamp: new Date().toISOString()
    };

    // Track event in Braze with flag context
    const brazeResponse = await brazeService.trackEvent({
      userId,
      eventName,
      eventProperties: enrichedProperties,
      userAttributes: {
        ...userAttributes,
        eppo_variant: flagAssignment
      }
    });

    res.json({
      success: true,
      userId,
      eventName,
      eppoVariant: flagAssignment,
      eventProperties: enrichedProperties,
      brazeResponse: brazeResponse.data,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error tracking event:', error.message);
    res.status(500).json({
      error: 'Failed to track event',
      details: error.message
    });
  }
});

// Core webhook processing function
async function processWebhookAndSendMessage(webhookData) {
  // Determine if the incoming data is from a Braze webhook or another source
  const isFromBrazeWebhook =
    webhookData.trigger_properties !== undefined ||               // present on Braze callbacks
    webhookData.eppo_variant      !== undefined ||
    webhookData.eppo_flagkey      !== undefined ||
    webhookData.subject           !== undefined;                  // remote_include fallback

  // Extract user information
  const userId =
    webhookData.user_id            ||
    webhookData.external_user_id   ||
    webhookData.userId             ||
    webhookData.subject            ||    // Braze passes {{external_user_id}} as subject when not in body
    'unknown-user';

  const userAttributes = webhookData.user_attributes || webhookData.attributes || {};

  if (userId === 'unknown-user') {
    console.warn('⚠️ Could not determine userId from webhook/request body:', JSON.stringify(webhookData, null, 2));
  }
  
  // Ensure the user exists in Braze and has the eppo_gate attribute
  try {
    await brazeService.updateUserAttributes({
      userId,
      attributes: { eppo_gate: true }
    });
    console.log(`✅ Ensured eppo_gate:true for webhook user ${userId}`);
  } catch (brazeError) {
    console.error(`Braze updateUserAttributes error for webhook user ${userId}:`, brazeError.message);
  }
  
  // Get Eppo assignment for this user
  const flagKey = process.env.EXPERIMENT_FLAG_KEY || 'braze_message_experiment';
  const assignmentData = eppoService.getAssignment(flagKey, userId, userAttributes);
  const assignment = assignmentData.assignment;

  // Only trigger the campaign if this is NOT a webhook call from Braze, to prevent a loop
  if (!isFromBrazeWebhook) {
    const campaignId = process.env.BRAZE_WEBHOOK_CAMPAIGN_ID;
    
    try {
      if (campaignId && campaignId.includes('your_')) {
        console.warn(`⚠️ Skipping campaign trigger: Please set a real Braze campaign ID in your .env file.`);
      } else if (campaignId) {
        console.log('About to trigger Braze campaign...');
        await brazeService.triggerCampaign({
          userId,
          campaignId,
          triggerProperties: {
            eppo_flag_key: flagKey,
            eppo_assignment: assignment,
          }
        });
        console.log('brazeService.triggerCampaign call completed.');
        console.log('The assignment value is:', assignment);
        console.log('The type of assignment is:', typeof assignment);
        console.log(`✅ Log that was failing: Successfully triggered campaign ${campaignId} for user ${userId} with assignment: ${assignment}`);
      } else {
        console.log('No BRAZE_WEBHOOK_CAMPAIGN_ID configured. Skipping trigger.');
      }
    } catch(brazeError) {
      console.error(`Braze campaign trigger error for user ${userId}:`, brazeError.message);
      // Do not block the response for this error
    }
  }
  
  // Determine what message would be sent (demo mode - no actual sending)
  let messagePreview;
  
  if (assignment === 'treatment') {
    messagePreview = {
      type: 'TREATMENT',
      subject: "🎉 Special Offer - Treatment Version!",
      body: "You've been selected for our premium treatment experience!",
      message_variation_id: "treatment_variation"
    };
  } else if (assignment === 'control') {
    messagePreview = {
      type: 'CONTROL', 
      subject: "📰 Your Weekly Update",
      body: "Here's your regular weekly update with the latest news.",
      message_variation_id: "control_variation"
    };
  } else {
    messagePreview = {
      type: 'DEFAULT',
      subject: "👋 Hello from our integration!",
      body: "This is a default message for users not in the experiment.",
      message_variation_id: "default_variation"
    };
  }
  
  // Return the full, structured object for internal use (e.g., by the demo UI).
  // The webhook endpoints will extract and send only the messagePreview to Braze.
  return {
    userId,
    eppoAssignment: assignment,
    flagKey,
    assignmentDetails: assignmentData.assignmentDetails,
    messagePreview,
    messageType: assignment || 'default',
    timestamp: new Date().toISOString(),
    demo_mode: true,
    note: 'This is a demo - no actual messages were sent'
  };
}

// Start server
app.listen(PORT, () => {
  console.log(`Braze-Eppo integration server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Experiment flag key: ${process.env.EXPERIMENT_FLAG_KEY || 'braze_message_experiment'}`);
  console.log(`Demo available at: http://localhost:${PORT}`);
});
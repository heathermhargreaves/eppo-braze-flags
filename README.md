# Braze-Eppo Feature Flag Integration

A Node.js server that integrates Eppo feature flags with Braze messaging to enable A/B testing of different message variants.

## Features

- 🎯 **Feature Flag Evaluation**: Uses Eppo SDK to evaluate feature flags for users
- 📧 **Braze Integration**: Sends different message variants based on flag assignments
- 👥 **Audience Enrichment**: Integrates with Hightouch Personalization API for user audience data, with browser attribute fallback
- 📊 **Event Tracking**: Tracks user events with experiment metadata in Braze
- 🏥 **Health Monitoring**: Health check endpoint for monitoring server status
- 🎨 **Interactive Demo**: Built-in web interface to test the integration

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Configuration

Copy the example environment file and configure your credentials:

```bash
cp .env.example .env
```

Edit `.env` with your actual values:

```bash
# Eppo Configuration
EPPO_SDK_KEY=your_eppo_sdk_key_here

# Braze Configuration
BRAZE_API_KEY=your_braze_api_key_here
BRAZE_REST_ENDPOINT=https://rest.iad-01.braze.com
BRAZE_APP_ID=your_braze_app_id_here
BRAZE_WEBHOOK_CAMPAIGN_ID=your_webhook_campaign_id_here

# Hightouch Configuration (optional)
HIGHTOUCH_API_KEY=your_hightouch_api_key_here
HIGHTOUCH_API_URL=https://personalization.us-west-2.hightouch.com
HIGHTOUCH_COLLECTION_NAME=customers

# Server Configuration
PORT=3000
NODE_ENV=development

# Feature Flag Configuration
EXPERIMENT_FLAG_KEY=braze_message_experiment
```

### 3. Start the Server

```bash
# Development mode (with auto-reload)
npm run dev

# Production mode
npm start
```

### 4. Access the Demo

Open your browser to `http://localhost:3000` to access the interactive demo interface.

## API Endpoints

### Health Check
```
GET /health
```

Returns server health status and Eppo initialization state.

### Get Flag Assignment
```
POST /get-assignment
```

Get Eppo feature flag assignment for a user.

**Request Body:**
```json
{
  "userId": "user-123",
  "userAttributes": {
    "country": "US",
    "subscription_tier": "premium"
  }
}
```

**Response:**
```json
{
  "assignment": "treatment",
  "flagKey": "braze_message_experiment",
  "userId": "user-123",
  "userAttributes": {...},
  "assignmentDetails": {...},
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### Send Message (Demo Mode)
```
POST /send-message
```

Simulates sending a Braze message based on Eppo flag assignment.

**Request Body:**
```json
{
  "userId": "user-123",
  "userAttributes": {
    "country": "US",
    "subscription_tier": "premium"
  }
}
```

### Get User Audiences
```
POST /get-audiences
```

Look up user audiences from Hightouch Personalization API.

**Request Body:**
```json
{
  "userId": "user-123"
}
```

**Response:**
```json
{
  "userId": "user-123",
  "audiences": {
    "premium_subscriber": true,
    "high_value_customer": false,
    "at_risk_churn": false
  },
  "attributes": {
    "lifetime_value": 1492.18,
    "churn_risk": 0.04,
    "tier": "premium"
  },
  "found": true,
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### Track Event
```
POST /track-event
```

Track a custom event in Braze with flag assignment metadata.

**Request Body:**
```json
{
  "userId": "user-123",
  "eventName": "feature_used",
  "eventProperties": {
    "feature_name": "new_checkout"
  },
  "userAttributes": {
    "country": "US"
  }
}
```

### Webhook Endpoints

The server accepts webhooks at both `/` and `/webhook` endpoints for Braze webhook campaigns.

```
POST /
POST /webhook
```

These endpoints process incoming webhook data, evaluate Eppo flags, and return appropriate responses.

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `EPPO_SDK_KEY` | Your Eppo SDK key | Yes |
| `BRAZE_API_KEY` | Your Braze REST API key | Yes |
| `BRAZE_REST_ENDPOINT` | Your Braze REST endpoint URL | Yes |
| `BRAZE_APP_ID` | Your Braze app identifier | Yes |
| `BRAZE_WEBHOOK_CAMPAIGN_ID` | Your Braze webhook campaign identifier | Yes |
| `HIGHTOUCH_API_KEY` | Your Hightouch Personalization API key | No |
| `HIGHTOUCH_API_URL` | Your Hightouch API endpoint URL | No (defaults to us-west-2) |
| `HIGHTOUCH_COLLECTION_NAME` | Your Hightouch collection name | No (defaults to 'customers') |
| `EXPERIMENT_FLAG_KEY` | The Eppo flag key to evaluate | No (defaults to 'braze_message_experiment') |
| `PORT` | Server port | No (defaults to 3000) |
| `NODE_ENV` | Environment mode | No (defaults to 'development') |

## Braze API Permissions

Your Braze API key needs the following permissions:
- `users.track` - For tracking events and updating user attributes
- `messages.send` - For sending messages (if using real messaging)
- `campaigns.trigger` - For triggering campaigns (if using campaign triggers)

## How It Works

### **Complete Integration Flow:**

1. **User Request**: Demo UI or external system sends user data to the server
2. **Attribute Enrichment**: 
   - **Primary**: Looks up user audiences from Hightouch Personalization API
   - **Fallback**: Uses browser-provided attributes if Hightouch unavailable
   - Maps attributes to experiment-friendly format (e.g., `subscriptionTier: "premium"` → `premium_subscriber: true`)
3. **Flag Evaluation**: Calls Eppo SDK with enriched user attributes to get feature flag assignment
4. **Campaign Trigger**: Triggers Braze campaign with assignment data and user attributes
5. **Webhook Processing**: Braze sends webhook back to server with campaign context
6. **Message Generation**: Based on flag assignment, generates appropriate message variant:
   - **Treatment**: `"🎉 Special Offer - Treatment Version!"`
   - **Control**: `"📰 Your Weekly Update"`
   - **Default**: `"👋 Hello from our integration!"`
7. **Response**: Returns structured response with assignment details and message preview

### **Key Features:**
- **🔄 Loop Prevention**: Detects Braze webhooks vs. internal calls to prevent infinite loops
- **🎯 Consistent Assignment**: Same user + attributes = same assignment across calls
- **📊 Rich Logging**: Comprehensive debugging output for troubleshooting
- **⚡ Atomic Operations**: User attributes updated alongside campaign triggers for consistency

## Braze Webhook Campaign Setup

For the integration to work properly, you need to set up a **Webhook campaign** in Braze:

1. **Create a new API-Triggered Campaign** in Braze
2. **Set the message type to "Webhook"** (not Email/Push/In-App)
3. **Configure the webhook:**
   - **URL**: Your public endpoint (e.g., from ngrok: `https://abc123.ngrok-free.app/`)
   - **Method**: POST
   - **Content-Type**: application/json
   - **Body**:
   ```json
   {
     "user_id": "{{${user_id}}}",
     "eppo_flag_key": "{{${trigger_properties.eppo_flag_key}}}",
     "eppo_assignment": "{{${trigger_properties.eppo_assignment}}}"
   }
   ```
4. **Copy the Campaign ID** and set it as `BRAZE_WEBHOOK_CAMPAIGN_ID` in your `.env` file
5. **Launch the campaign**

## User Attribute Enrichment

The server automatically enriches user attributes for Eppo experiments using a two-tier approach:

### 1. **Hightouch Personalization API (Primary)**
When Hightouch is configured and user data is found:
- Uses audience flags like `premium_subscriber`, `high_value_customer`
- Includes attributes like `lifetime_value`, `churn_risk`, `tier`
- Provides the most comprehensive user context

### 2. **Browser Attributes (Fallback)**
When Hightouch data is unavailable, uses browser-provided attributes:
```javascript
// Example browser attributes that get mapped:
{
  "subscriptionTier": "premium",  // → premium_subscriber: true
  "subscription_tier": "premium", // → premium_subscriber: true  
  "isPremium": true,              // → premium_subscriber: true
  "isHighValue": false,           // → high_value_customer: false
  "tier": "gold",                 // → subscription_tier: "gold"
  "country": "US",                // → country: "US"
  "device_type": "mobile"         // → device_type: "mobile"
}
```

This ensures experiments always have relevant user context, regardless of Hightouch availability.

### **Attribute Mapping Examples:**

| Browser Input | Mapped Attribute | Value |
|---------------|------------------|-------|
| `subscriptionTier: "premium"` | `premium_subscriber` | `true` |
| `subscriptionTier: "basic"` | `premium_subscriber` | `false` |
| `subscriptionTier: "free"` | `at_risk_churn` | `true` |
| `isPremium: true` | `premium_subscriber` | `true` |
| `isHighValue: true` | `high_value_customer` | `true` |
| `country: "US"` | `country` | `"US"` |

### Important Notes:
- User IDs must be alphanumeric with only dashes (`-`), underscores (`_`), and periods (`.`)
- Invalid characters like semicolons (`;`) or spaces will cause webhooks to fail
- Braze may batch rapid triggers together - space out test requests by 2-3 minutes for consistent webhook delivery
- **Consistent Assignments**: Same user + same attributes = same flag assignment across all endpoints

## Project Structure

```
braze-eppo-flags/
├── server.js              # Main Express server
├── services/
│   ├── eppoService.js      # Eppo SDK integration
│   ├── brazeService.js     # Braze API integration
│   └── hightouchService.js # Hightouch Personalization API integration
├── public/
│   └── index.html          # Interactive demo UI
├── .env.example            # Environment variables template
├── package.json            # Node.js dependencies
└── README.md               # Project documentation
```

## Development

### Local Development

1. Clone the repository
2. Install dependencies: `npm install`
3. Copy and configure environment: `cp .env.example .env`
4. Start development server: `npm run dev`
5. Open browser to `http://localhost:3000`

### Troubleshooting

#### **Common Issues:**

**1. Assignment Mismatch Between Endpoints**
- **Symptom**: `/get-assignment` shows "control" but message shows "treatment"
- **Cause**: Different user attributes being passed to each endpoint
- **Solution**: Ensure both endpoints receive identical `userAttributes` object

**2. Hightouch Attributes Not Working**
- **Symptom**: `premium_subscriber` always false despite selecting "premium"
- **Cause**: Attribute mapping not configured correctly
- **Solution**: Check attribute mapping in `hightouchService.js` - supports `subscriptionTier`, `subscription_tier`, `isPremium`

**3. Server Crashes with "EADDRINUSE"**
- **Symptom**: `Error: listen EADDRINUSE: address already in use :::3000`
- **Cause**: Another server instance is already running on port 3000
- **Solution**: Kill existing process or change PORT in `.env`

**4. Webhook Not Firing**
- **Symptom**: No webhook requests in server logs
- **Cause**: Braze campaign configuration or ngrok issues
- **Solution**: Verify webhook URL, check Braze campaign status, ensure ngrok is running

**5. Empty Flag Assignment**
- **Symptom**: Assignment returns `null` or empty
- **Cause**: Eppo SDK not initialized or invalid flag key
- **Solution**: Check `EPPO_SDK_KEY` and `EXPERIMENT_FLAG_KEY` in `.env`

#### **Debug Mode:**
Enable detailed logging by checking server console output. Look for:
- `🔍 /get-assignment called for user...`
- `🎯 EPPO ASSIGNMENT DEBUG for user...`
- `📧 MESSAGE GENERATION DEBUG for user...`

### Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test your changes using the demo interface
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

For questions or issues:
1. Check the [Eppo documentation](https://docs.geteppo.com/)
2. Check the [Braze documentation](https://www.braze.com/docs/)
3. Open an issue in this repository 
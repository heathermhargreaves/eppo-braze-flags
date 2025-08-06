const axios = require('axios');
require('dotenv').config();

async function testBrazeConnection() {
  console.log('🔍 Testing Braze Connection...\n');
  
  // Check environment variables
  console.log('Environment Variables:');
  console.log('- BRAZE_API_KEY:', process.env.BRAZE_API_KEY ? 'Set' : 'Missing');
  console.log('- BRAZE_REST_ENDPOINT:', process.env.BRAZE_REST_ENDPOINT || 'Missing');
  console.log('- BRAZE_APP_ID:', process.env.BRAZE_APP_ID ? 'Set' : 'Missing');
  console.log('');

  if (!process.env.BRAZE_API_KEY || !process.env.BRAZE_REST_ENDPOINT) {
    console.error('❌ Missing required Braze configuration');
    console.log('\n📝 To fix this:');
    console.log('1. Copy env.example to .env');
    console.log('2. Get your Braze API key from: Settings > API Keys');
    console.log('3. Find your REST endpoint from: Settings > Manage Settings > API Keys');
    console.log('4. Get your App ID from: Settings > Manage Settings > App Settings');
    return;
  }

  try {
    // Test 1: Simple POST to users/track (this is always available)
    console.log('1. Testing API credentials with users/track...');
    const trackResponse = await axios.post(`${process.env.BRAZE_REST_ENDPOINT}/users/track`, {
      attributes: [
        {
          external_id: 'test-connection-user',
          first_name: 'Test',
          email: 'test@example.com'
        }
      ]
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.BRAZE_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ API credentials are valid!');
    console.log('   Status:', trackResponse.status);
    console.log('   Message:', trackResponse.data.message || 'Success');
    
  } catch (error) {
    console.error('❌ API credentials test failed:');
    
    if (error.response) {
      console.log('   Status:', error.response.status);
      console.log('   Message:', error.response.data?.message || 'Unknown error');
      
      if (error.response.status === 401) {
        console.log('\n🔧 401 Unauthorized - Your API key issues:');
        console.log('   • API key is invalid or expired');
        console.log('   • API key doesn\'t have "users.track" permission');
        console.log('   • Check that your API key is enabled');
        console.log('   • Make sure you\'re using the REST API key, not SDK key');
      } else if (error.response.status === 400) {
        console.log('\n🔧 400 Bad Request:');
        console.log('   • Check your REST endpoint URL');
        console.log('   • Verify the endpoint format');
      } else if (error.response.status === 405) {
        console.log('\n🔧 405 Method Not Allowed:');
        console.log('   • Your REST endpoint might be wrong');
        console.log('   • Try different endpoint formats');
      }
    } else {
      console.log('   Network error:', error.message);
    }
    console.log('\n📚 Check your Braze setup:');
    console.log('   1. Go to Settings > API Keys in Braze dashboard');
    console.log('   2. Create or find your REST API key');
    console.log('   3. Ensure it has these permissions:');
    console.log('      - users.track');
    console.log('      - campaigns.trigger');
    console.log('      - messages.send');
    return;
  }

  try {
    // Test 2: Check if we can send messages
    console.log('\n2. Testing message sending permissions...');
    const messageResponse = await axios.post(`${process.env.BRAZE_REST_ENDPOINT}/messages/send`, {
      external_user_ids: ['test-nonexistent-user'],
      messages: {
        push: {
          alert: 'Test message',
          title: 'Test'
        }
      }
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.BRAZE_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Message sending works!');
    console.log('   Status:', messageResponse.status);
    
  } catch (error) {
    if (error.response?.status === 400) {
      console.log('✅ Message endpoint accessible (expected 400 for invalid user)');
    } else if (error.response?.status === 401) {
      console.error('❌ No permission for messages.send');
      console.log('   Add "messages.send" permission to your API key');
    } else {
      console.error('❌ Message sending test failed:', error.response?.status);
    }
  }

  try {
    // Test 3: Check campaign trigger permissions
    console.log('\n3. Testing campaign trigger permissions...');
    const campaignResponse = await axios.post(`${process.env.BRAZE_REST_ENDPOINT}/campaigns/trigger/send`, {
      campaign_id: 'test-nonexistent-campaign',
      recipients: [
        {
          external_user_id: 'test-user'
        }
      ]
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.BRAZE_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Campaign triggering works!');
    
  } catch (error) {
    if (error.response?.status === 400) {
      console.log('✅ Campaign trigger endpoint accessible (expected 400 for invalid campaign)');
    } else if (error.response?.status === 401) {
      console.error('❌ No permission for campaigns.trigger');
      console.log('   Add "campaigns.trigger" permission to your API key');
    } else {
      console.error('❌ Campaign trigger test failed:', error.response?.status);
    }
  }

  console.log('\n🎯 Next steps:');
  console.log('1. If you got 401 errors, update your API key permissions in Braze');
  console.log('2. Create test campaigns in Braze for control/treatment variants');
  console.log('3. Use the campaign IDs in your integration calls');
}

// Run the test
testBrazeConnection().catch(console.error); 
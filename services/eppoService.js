const EppoSdk = require('@eppo/node-server-sdk');

class EppoService {
  constructor() {
    this.client = null;
    this.initialized = false;
    this.recentAssignments = new Map();
    this.assignmentLoggerCalled = false;
    this.currentRequest = null;
  }

  async initializeEppo() {
    try {
      if (!process.env.EPPO_SDK_KEY) {
        throw new Error('EPPO_SDK_KEY environment variable is required');
      }
      
      console.log('Initializing Eppo SDK...');
      await EppoSdk.init({
        apiKey: process.env.EPPO_SDK_KEY,
        assignmentLogger: {
          logAssignment: (assignment) => {
            this.assignmentLoggerCalled = true;
            
            // Use the flagKey from current request if assignment.flagKey is undefined
            const flagKey = assignment.flagKey || (this.currentRequest ? this.currentRequest.flagKey : 'unknown');
            const subject = assignment.subject || (this.currentRequest ? this.currentRequest.userId : 'unknown');
            
            // Store assignment by user+flag key for retrieval
            const key = `${subject}:${flagKey}`;
            const assignmentToStore = {
              ...assignment,
              flagKey: flagKey,
              timestamp: assignment.timestamp || new Date().toISOString()
            };
            
            this.recentAssignments.set(key, assignmentToStore);
            
            // Clean up old assignments (keep only last 100)
            if (this.recentAssignments.size > 100) {
              const firstKey = this.recentAssignments.keys().next().value;
              this.recentAssignments.delete(firstKey);
            }
          }
        }
      });
      
      this.client = EppoSdk.getInstance();
      
      // Disable assignment cache for demo purposes
      if (this.client && typeof this.client.disableAssignmentCache === 'function') {
        this.client.disableAssignmentCache();
      }
      
      // Try alternative cache disable methods
      if (this.client.assignmentCache !== undefined) {
        this.client.assignmentCache = false;
      }
      
      if (this.client._assignmentCache !== undefined) {
        this.client._assignmentCache = false;
      }
      
      if (this.client.setCacheSize && typeof this.client.setCacheSize === 'function') {
        this.client.setCacheSize(0);
      }
      
      this.initialized = true;
      console.log('Eppo SDK initialized successfully');
      
    } catch (error) {
      console.error('Failed to initialize Eppo SDK:', error);
      this.initialized = false;
      throw error;
    }
  }

  getAssignment(flagKey, userId, userAttributes = {}) {
    if (!this.client || !this.initialized) {
      console.warn('Eppo client not initialized, returning null assignment');
      return {
        assignment: null, 
        flagKey, 
        userId, 
        userAttributes, 
        initialized: false, 
        assignmentDetails: null, 
        timestamp: new Date().toISOString()
      };
    }
    
    try {
      // Reset the logger called flag
      this.assignmentLoggerCalled = false;
      
      // Store the current request context so the logger can access it
      this.currentRequest = { flagKey, userId, userAttributes };

      // Get assignment - this should trigger the assignment logger
      const assignment = this.client.getStringAssignment(
        flagKey, userId, userAttributes, null
      );
      
      let assignmentDetails = null;
      
      // Check our stored assignments with correct key
      const assignmentKey = `${userId}:${flagKey}`;
      assignmentDetails = this.recentAssignments.get(assignmentKey);
      
      // Also check with undefined key (in case that's how it was stored)
      if (!assignmentDetails) {
        const undefinedKey = `${userId}:undefined`;
        const storedWithUndefinedKey = this.recentAssignments.get(undefinedKey);
        if (storedWithUndefinedKey) {
          // Fix the assignment by adding the correct flagKey
          assignmentDetails = {
            ...storedWithUndefinedKey,
            flagKey: flagKey
          };
          // Store it with the correct key for future use
          this.recentAssignments.set(assignmentKey, assignmentDetails);
          // Remove the incorrectly keyed entry
          this.recentAssignments.delete(undefinedKey);
        }
      }

      const fallbackDetails = {
        flagKey, 
        allocation: null, 
        variation: assignment, 
        subject: userId, 
        experiment: null, 
        featureFlag: null, 
        timestamp: new Date().toISOString(),
        debug: {
          assignmentLoggerFired: this.assignmentLoggerCalled,
          storedAssignmentsCount: this.recentAssignments.size,
          lookupKey: assignmentKey,
          note: this.assignmentLoggerCalled
            ? "Logger fired but assignment not found in storage"
            : "Assignment logger did not fire - may be cached or default assignment"
        }
      };

      // Clean up request context
      this.currentRequest = null;

      return {
        assignment, 
        flagKey, 
        userId, 
        userAttributes,
        assignmentDetails: assignmentDetails || fallbackDetails,
        clientInfo: {
          initialized: this.initialized, 
          hasClient: !!this.client, 
          sdkVersion: 'node-server-sdk-3.11.0',
          hasAssignmentLogger: !!this.client.assignmentLogger,
          cacheDisabled: this.client.assignmentCache === false || this.client._assignmentCache === false
        },
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      console.error('Error getting Eppo assignment:', error);
      return {
        assignment: null, 
        flagKey, 
        userId, 
        userAttributes, 
        assignmentDetails: null, 
        error: error.message, 
        timestamp: new Date().toISOString()
      };
    }
  }

  getBooleanAssignment(flagKey, userId, userAttributes = {}, defaultValue = false) {
    if (!this.client || !this.initialized) {
      console.warn('Eppo client not initialized');
      return defaultValue;
    }

    try {
      const assignment = this.client.getBooleanAssignment(flagKey, userId, userAttributes, defaultValue);
      return assignment;
    } catch (error) {
      console.error('Error getting boolean assignment:', error);
      return defaultValue;
    }
  }

  getNumericAssignment(flagKey, userId, userAttributes = {}, defaultValue = 0) {
    if (!this.client || !this.initialized) {
      console.warn('Eppo client not initialized');
      return defaultValue;
    }

    try {
      const assignment = this.client.getNumericAssignment(flagKey, userId, userAttributes, defaultValue);
      return assignment;
    } catch (error) {
      console.error('Error getting numeric assignment:', error);
      return defaultValue;
    }
  }

  isInitialized() {
    return this.initialized;
  }

  getClientInfo() {
    return {
      initialized: this.initialized,
      hasClient: !!this.client,
      clientType: this.client ? 'EppoClient' : null,
      recentAssignmentsCount: this.recentAssignments.size,
      hasAssignmentLogger: !!(this.client && this.client.assignmentLogger)
    };
  }
}

module.exports = new EppoService(); 
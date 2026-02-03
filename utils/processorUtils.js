const { logger } = require('./logger');

/**
 * Shared utilities for Avro and JSON processors
 * Consolidates common patterns to reduce code duplication
 */

/**
 * Safely get a value that might be a function or direct value
 * @param {*} obj - The object to get value from
 * @param {*} defaultValue - Default value if obj is null/undefined
 * @returns {*} The resolved value
 */
function getValue(obj, defaultValue = undefined) {
  if (obj === undefined || obj === null) return defaultValue;
  if (typeof obj === 'function') return obj();
  return obj;
}

/**
 * Get operations from a channel in a safe manner
 * @param {Object} channel - The channel object
 * @returns {Array} Array of operations
 */
function getChannelOperations(channel) {
  if (!channel) return [];
  return channel.operations && typeof channel.operations === 'function'
    ? Array.from(channel.operations().values())
    : [];
}

/**
 * Find publish operation from operations array
 * @param {Array} operations - Array of operations
 * @returns {Object|undefined} The publish operation or undefined
 */
function findPublishOperation(operations) {
  return operations.find(op => op.action && op.action() === 'publish');
}

/**
 * Find subscribe operation from operations array
 * @param {Array} operations - Array of operations
 * @returns {Object|undefined} The subscribe operation or undefined
 */
function findSubscribeOperation(operations) {
  return operations.find(op => op.action && op.action() === 'subscribe');
}

/**
 * Get messages from an operation safely
 * @param {Object} operation - The operation object
 * @returns {Array} Array of messages
 */
function getOperationMessages(operation) {
  if (!operation) return [];
  const messages = operation.messages && typeof operation.messages === 'function'
    ? operation.messages()
    : [];
  return messages && messages.length > 0 ? messages : [];
}

/**
 * Get the first message from an operation
 * @param {Object} operation - The operation object
 * @returns {Object|null} The first message or null
 */
function getFirstMessage(operation) {
  const messages = getOperationMessages(operation);
  return messages.length > 0 ? messages[0] : null;
}

/**
 * Iterate over channels with publish/subscribe operations
 * @param {Object} asyncapi - The AsyncAPI document
 * @param {Function} callback - Callback function(channel, channelName, publishOp, subscribeOp)
 */
function iterateChannelOperations(asyncapi, callback) {
  const channels = asyncapi.channels();
  if (!channels) return;

  for (const channel of channels.values()) {
    const channelName = channel.id();
    const operations = getChannelOperations(channel);
    const publishOperation = findPublishOperation(operations);
    const subscribeOperation = findSubscribeOperation(operations);

    callback(channel, channelName, publishOperation, subscribeOperation);
  }
}

/**
 * Get schema type with consistent handling for both Avro and JSON processors
 * @param {Object} schema - The schema object
 * @param {Object} options - Options for type detection
 * @param {boolean} options.useArrayObject - Return 'array-object' for object arrays (Avro style)
 * @returns {string} The schema type
 */
function getSchemaType(schema, options = {}) {
  const { useArrayObject = false } = options;

  if (!schema) return 'object';

  const type = schema.type ? schema.type() : null;

  if (type === 'array') {
    const items = schema.items ? schema.items() : null;
    if (items) {
      const itemType = items.type ? items.type() : null;
      if (!itemType || itemType === 'object') {
        return useArrayObject ? 'array-object' : 'array';
      }
      return `array-${itemType}`;
    }
    return 'array';
  }

  if (!type || type === 'object') {
    const schemaName = schema.extensions && schema.extensions().get('x-parser-schema-id')?.value();
    if (schemaName) {
      return `object-${schemaName}`;
    }
    return 'object';
  }

  return type;
}

/**
 * Iterate over schema properties using various accessor patterns
 * Handles: values(), forEach(), and plain object patterns
 * @param {Object} schemaProperties - The schema properties object
 * @param {Function} callback - Callback function(property, propertyName)
 */
function iterateSchemaProperties(schemaProperties, callback) {
  if (!schemaProperties) return;

  if (typeof schemaProperties.values === 'function') {
    const propertyArray = Array.from(schemaProperties.values());
    propertyArray.forEach(prop => {
      const propertyName = prop.id ? prop.id() : null;
      if (propertyName) {
        callback(prop, propertyName);
      }
    });
  } else if (typeof schemaProperties.forEach === 'function') {
    schemaProperties.forEach((prop, propName) => {
      callback(prop, propName);
    });
  } else if (typeof schemaProperties === 'object') {
    Object.entries(schemaProperties).forEach(([propName, prop]) => {
      callback(prop, propName);
    });
  }
}

/**
 * Create standard processor result object
 * @param {Array} schemas - Processed schemas
 * @param {Array} functions - Extracted functions
 * @param {Array} extraIncludes - Extra include statements
 * @param {Array} imports - Import statements
 * @param {Object} appProperties - Application properties
 * @returns {Object} Standard result object
 */
function createProcessorResult(schemas, functions, extraIncludes = [], imports = [], appProperties = {}) {
  return {
    schemas,
    functions,
    extraIncludes,
    imports,
    appProperties
  };
}

/**
 * Initialize schema model with AsyncAPI document
 * Common pattern for both Avro and JSON processors
 * @param {Object} schemaModel - The schema model instance
 * @param {Object} asyncapi - The AsyncAPI document
 */
function initializeSchemaModel(schemaModel, asyncapi) {
  schemaModel.setupSuperClassMap(asyncapi);
  schemaModel.setupModelClassMap(asyncapi);
}

/**
 * Extract functions using core processor
 * Common pattern for both Avro and JSON processors
 * @param {Object} asyncapi - The AsyncAPI document
 * @param {Object} params - Template parameters
 * @param {Array} schemas - Processed schemas
 * @returns {Array} Extracted functions
 */
function extractFunctionsFromCore(asyncapi, params, schemas) {
  const coreProcessor = require('./coreProcessor');
  return coreProcessor.extractFunctions(asyncapi, params, schemas);
}

/**
 * Log processing summary for debugging
 * @param {string} processorName - Name of the processor (e.g., 'avro', 'json')
 * @param {number} schemaCount - Number of schemas processed
 * @param {number} functionCount - Number of functions extracted
 */
function logProcessingSummary(processorName, schemaCount, functionCount) {
  logger.debug(`${processorName}Processor: Processed ${schemaCount} schemas, extracted ${functionCount} functions`);
}

module.exports = {
  getValue,
  getChannelOperations,
  findPublishOperation,
  findSubscribeOperation,
  getOperationMessages,
  getFirstMessage,
  iterateChannelOperations,
  getSchemaType,
  iterateSchemaProperties,
  createProcessorResult,
  initializeSchemaModel,
  extractFunctionsFromCore,
  logProcessingSummary
};

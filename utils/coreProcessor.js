const _ = require('lodash');
const { logger } = require('./logger');
const { processJsonSchemas } = require('./jsonProcessor/index');
const { extractAvroSchemasFromMessages, isAvroSchema, isAvroMessage } = require('./avroProcessor');
const { toPascalCase, toCamelCase, getSchemaType } = require('./typeUtils');
const { getFunctionName, getMultipleMessageComment, sortParametersUsingChannelName, getFunctionPayloadType } = require('./functionUtils');
const { getPackageName } = require('../components/Application');
/**
 * Main processor for AsyncAPI documents
 * Orchestrates schema extraction, function generation, and configuration
 */
function processAsyncApi(asyncapi, params) {
  const schemas = extractSchemas(asyncapi);
  const functions = extractFunctions(asyncapi, params, schemas);
  
  // Consolidate functions for queue-based consumers with multiple message types
  const { consolidateQueueFunctions } = require('./functionUtils');
  const consolidatedFunctions = consolidateQueueFunctions(functions);
  
  // Get package name from params
  const packageName = getPackageName(params, asyncapi);
  
  const extraIncludes = determineExtraIncludes(consolidatedFunctions);
  const imports = determineImports(consolidatedFunctions, extraIncludes, schemas, packageName);
  const appProperties = generateAppProperties(asyncapi, params);

  return {
    schemas,
    functions: consolidatedFunctions,
    extraIncludes,
    imports,
    appProperties
  };
}

/**
 * Extract and process schemas from AsyncAPI document
 * Handles both Avro and JSON schemas with proper deduplication
 */
function extractSchemas(asyncapi) {
  const schemas = [];
  
  // Detect what types of schemas exist in the document
  const hasAvroSchemas = detectAvroSchemas(asyncapi);
  const hasJsonSchemas = detectJsonSchemas(asyncapi);
  
  // Process Avro schemas from message payloads (if any exist)
  if (hasAvroSchemas) {
    const avroSchemas = extractAvroSchemasFromMessages(asyncapi);
    schemas.push(...avroSchemas);
    
    // Create a set of Avro schema names to avoid duplicates
    const avroSchemaNames = new Set(avroSchemas.map(s => s.name));
    
    // Also create a set of Avro class names (without namespace) for deduplication
    const avroClassNames = new Set(avroSchemas.map(s => {
      const lastDotIndex = s.name.lastIndexOf('.');
      return lastDotIndex > 0 ? s.name.substring(lastDotIndex + 1) : s.name;
    }));
    
    // Process JSON schemas from components.schemas (skip any that are already Avro schemas)
    if (hasJsonSchemas) {
      const jsonSchemas = processJsonSchemas(asyncapi, avroSchemaNames, avroClassNames);
      schemas.push(...jsonSchemas);
    }
  } else if (hasJsonSchemas) {
    // Only JSON schemas exist, no need to check for duplicates
    const jsonSchemas = processJsonSchemas(asyncapi, new Set());
    schemas.push(...jsonSchemas);
  }
  
  if (schemas.length === 0) {
    logger.debug('No schemas found in AsyncAPI document. Skipping model class generation.');
  }
  
  // Filter out schemas that are empty, undefined, or do not have a valid properties array
  logger.debug(`coreProcessor: Before filtering - ${schemas.length} schemas:`, schemas.map(s => ({
    name: s?.name,
    hasProperties: s?.properties ? 'yes' : 'no',
    propertiesType: Array.isArray(s?.properties) ? 'array' : typeof s?.properties,
    propertiesLength: s?.properties?.length,
    hasAllOf: s?.allOf ? 'yes' : 'no'
  })));
  
  const filteredSchemas = schemas.filter(s => {
    // Keep schemas that have properties OR should have inheritance (detected from schema structure)
    const hasValidProperties = s && Array.isArray(s.properties) && s.properties.length > 0;
    const shouldHaveInheritance = s && s.name && typeof s.name === 'string' && !s.name.startsWith('<anonymous-schema-') && 
                                  Array.isArray(s.properties) && s.properties.length === 0;
    
    const isValid = hasValidProperties || shouldHaveInheritance;
    
    if (!isValid) {
      logger.debug(`coreProcessor: ❌ Filtering out schema: ${s?.name} - hasProperties: ${s?.properties ? 'yes' : 'no'}, isArray: ${Array.isArray(s?.properties)}, length: ${s?.properties?.length}`);
    } else if (shouldHaveInheritance) {
      logger.debug(`coreProcessor: ✅ Keeping inheritance schema: ${s?.name} - zero direct properties but likely has allOf`);
    }
    
    return isValid;
  });
  
  if (filteredSchemas.length !== schemas.length) {
    logger.warn(`Filtered out ${schemas.length - filteredSchemas.length} invalid/empty schemas.`);
  }
  return filteredSchemas;
}

/**
 * Detect if AsyncAPI document contains Avro schemas
 */
function detectAvroSchemas(asyncapi) {
  let hasAvro = false;
  
  // Check for Avro schemas in components.messages
  const messages = asyncapi.components().messages();
  if (messages) {
    messages.forEach((message, messageName) => {
      try {
        const schemaFormat = message.schemaFormat && message.schemaFormat();
        if (schemaFormat && schemaFormat.includes('avro')) {
          logger.debug(`coreProcessor: Found Avro schema in components.messages: ${messageName}`);
          hasAvro = true;
        }
      } catch (error) {
        logger.warn(`Error checking message ${messageName} for Avro schema:`, error.message);
      }
    });
  }
  
  // Also check for Avro schemas in channel operations (inline messages)
  if (!hasAvro) {
    const channels = asyncapi.channels();
    if (channels && typeof channels.values === 'function') {
      for (const channel of channels.values()) {
        const channelName = channel.id();
        
        // Get all operations for this channel
        const operations = channel.operations && typeof channel.operations === 'function'
          ? Array.from(channel.operations().values())
          : [];

        // Check all operations for Avro messages
        for (const operation of operations) {
          try {
            const messages = operation.messages && typeof operation.messages === 'function'
              ? Array.from(operation.messages().values())
              : [];
            
            for (const message of messages) {
              const schemaFormat = message.schemaFormat && message.schemaFormat();
              if (schemaFormat && schemaFormat.includes('avro')) {
                logger.debug(`coreProcessor: Found Avro schema in channel operation: ${channelName}`);
                hasAvro = true;
                break;
              }
            }
            
            if (hasAvro) break;
          } catch (error) {
            logger.warn(`Error checking channel ${channelName} operation for Avro schema:`, error.message);
          }
        }
        
        if (hasAvro) break;
      }
    }
  }
  
  return hasAvro;
}

/**
 * Detect if AsyncAPI document contains JSON schemas
 */
function detectJsonSchemas(asyncapi) {
  const componentsSchemas = asyncapi.components().schemas();
  return componentsSchemas && 
         ((typeof componentsSchemas.size === 'number' && componentsSchemas.size > 0) || 
          (typeof componentsSchemas === 'object' && Object.keys(componentsSchemas).length > 0));
}

/**
 * Extract functions from AsyncAPI document
 * Generates consumer, supplier, and send functions based on channel operations
 */
function extractFunctions(asyncapi, params, processedSchemas = []) {
  const functionMap = new Map();
  const usedFunctionNames = new Set();
  const { reactive = false, dynamicType = 'streamBridge', binder = 'solace', parametersToHeaders = false } = params;
  const channels = asyncapi.channels();
  
  logger.debug('extractFunctions: Starting function extraction');
  logger.debug(`extractFunctions: channels = ${channels ? 'exists' : 'null'}`);
  
  if (!channels || typeof channels.values !== 'function') {
    logger.warn('extractFunctions: No channels found or channels.values is not a function');
    return [];
  }

  // Determine view (provider/client)
  const info = asyncapi.info();
  // Priority: AsyncAPI x-view extension > params.view > undefined
  const xViewExtension = info.extensions && info.extensions().get('x-view') ? info.extensions().get('x-view').value() : undefined;
  const view = xViewExtension || params.view;
  const isProvider = view === 'provider';
  
  logger.debug(`extractFunctions: view = ${view}, isProvider = ${isProvider}`);

  // Create a map of Avro schemas for quick lookup
  const avroSchemaMap = new Map();
  processedSchemas.forEach(schema => {
    if (schema.isAvro || schema.isAvroSchema) {
      avroSchemaMap.set(schema.name, schema);
    }
  });

  const channelArray = Array.from(channels.values());
  logger.debug(`extractFunctions: Found ${channelArray.length} channels`);
  
  const functions = [];
  const consumerGroups = new Map();

  channelArray.forEach((channel, index) => {
    const channelName = channel.id();
    logger.debug(`extractFunctions: Processing channel ${index + 1}/${channelArray.length}: ${channelName}`);
    const parameters = extractChannelParameters(channel);
    
    // Get all operations for this channel
    const operations = channel.operations && typeof channel.operations === 'function'
      ? Array.from(channel.operations().values())
      : [];
    const publishOperation = operations.find(op => op.action() === 'publish') || null;
    const subscribeOperation = operations.find(op => op.action() === 'subscribe') || null;
    
    // View-based mapping
    const realPublisher = isProvider ? publishOperation : subscribeOperation;
    const realSubscriber = isProvider ? subscribeOperation : publishOperation;
    
    logger.debug(`coreProcessor.js: extractFunctions() - Channel: ${channelName}`);
    logger.debug(`coreProcessor.js: extractFunctions() - isProvider: ${isProvider}`);
    logger.debug(`coreProcessor.js: extractFunctions() - publishOperation: ${publishOperation ? publishOperation.action() : 'null'}`);
    logger.debug(`coreProcessor.js: extractFunctions() - subscribeOperation: ${subscribeOperation ? subscribeOperation.action() : 'null'}`);
    logger.debug(`coreProcessor.js: extractFunctions() - realPublisher: ${realPublisher ? realPublisher.action() : 'null'}`);
    logger.debug(`coreProcessor.js: extractFunctions() - realSubscriber: ${realSubscriber ? realSubscriber.action() : 'null'}`);

    // --- Handle Real Publisher Operations (following Nunjucks reference project pattern) ---
    if (realPublisher) {
      const payloadType = getFunctionPayloadType(realPublisher, avroSchemaMap);
      const channelInfo = getChannelInfo(channel, realPublisher, parameters);
      const messageName = extractMessageName(realPublisher);
      const isDynamicTopic = parameters.length > 0;
      
      logger.debug(`coreProcessor.js: extractFunctions() - Processing real publisher: ${channelName}, isDynamic: ${isDynamicTopic}`);
      
      if (isDynamicTopic) {
        // Dynamic channel → Send function (using StreamBridge)
        // Generate unique send method name with priority: operationId > messageName > channel parts
        let sendMethodName;
        const existingMethodNames = functions.map(f => f.sendMethodName || f.name);
        
        // Priority 1: Try operationId first
        if (realPublisher.operationId && realPublisher.operationId()) {
          sendMethodName = `send${toPascalCase(realPublisher.operationId())}`;
          if (!existingMethodNames.includes(sendMethodName)) {
            logger.debug(`coreProcessor.js: Using operationId for send method name: ${sendMethodName}`);
          }
        }
        
        // Priority 2: Try message name from ref if operationId not available or conflicts
        if (!sendMethodName) {
          const messageName = extractMessageName(realPublisher);
          if (messageName) {
            sendMethodName = `send${toPascalCase(messageName)}`;
            if (!existingMethodNames.includes(sendMethodName)) {
              logger.debug(`coreProcessor.js: Using message name for send method name: ${sendMethodName}`);
            }
          }
        }
        
        // Priority 3: Use channel parts if previous methods conflict or not available
        if (!sendMethodName) {
          const channelPathParts = channelName.split('/');
          sendMethodName = `send${toCamelCase(channelPathParts[0])}${channelPathParts.slice(1).toPascalCase().join('')}`;
          logger.debug(`coreProcessor.js: Using channel parts for send method name: ${sendMethodName}`);
        }
        
        // Handle remaining conflicts by adding a unique suffix
        if (existingMethodNames.includes(sendMethodName)) {
          let counter = 1;
          let baseName = sendMethodName;
          while (existingMethodNames.includes(sendMethodName)) {
            sendMethodName = `${baseName}${counter}`;
            counter++;
          }
          logger.debug(`coreProcessor.js: Resolved conflict by adding suffix: ${sendMethodName}`);
        }
        logger.debug(`coreProcessor.js: extractFunctions() - Creating send function: ${sendMethodName}`);
        functions.push({
          name: getFunctionName(channelName, realPublisher, false),
          type: 'send',
          sendMethodName: sendMethodName,
          publishPayload: payloadType,
          dynamic: true,
          dynamicType,
          reactive,
          isPublisher: true,
          hasParams: true,
          parameters,
          channelInfo,
          operation: realPublisher,
          messageName: messageName,
          multipleMessageComment: getMultipleMessageComment(realPublisher)
        });
      } else {
        // Static channel → Supplier function
        logger.debug(`coreProcessor.js: extractFunctions() - Creating supplier function: ${channelName}`);
        functions.push({
          name: getFunctionName(channelName, realPublisher, false),
          type: 'supplier',
          publishPayload: payloadType,
          dynamic: false,
          dynamicType,
          reactive,
          isPublisher: true,
          hasParams: false,
          parameters: [],
          channelInfo,
          operation: realPublisher,
          messageName: messageName,
          multipleMessageComment: getMultipleMessageComment(realPublisher)
        });
      }
    }

    // --- Handle SUBSCRIBE operations ---
    if (realSubscriber) {
      const payloadType = getFunctionPayloadType(realSubscriber, avroSchemaMap);
      const channelInfo = getChannelInfoForConsumer(channel, realSubscriber, parameters, isProvider);
      
      // Extract message name from the operation
      const messageName = extractMessageName(realSubscriber);
      
      // Check if this is a queue-based subscription
      logger.debug(`coreProcessor.js: extractFunctions() - ChannelInfo for ${channelName}: allQueueInfos=${channelInfo.allQueueInfos ? channelInfo.allQueueInfos.length : 'null'}, queueName=${channelInfo.queueName}`);
      
      if (channelInfo.allQueueInfos && channelInfo.allQueueInfos.length > 0) {
        // Handle multiple destinations - create separate consumer for each queue
        channelInfo.allQueueInfos.forEach((queueInfo, index) => {
          // Include channel name in queue key to allow separate functions for each channel
          const queueKey = `${channelName}::${queueInfo.queueName}::${(queueInfo.topicSubscriptions||[]).join(',')}`;
          
          if (!consumerGroups.has(queueKey)) {
            // Create a unique consumer name for each destination
            const baseName = toConsumerBeanName(queueInfo.queueName);
            const consumerName = index === 0 ? baseName : `${baseName}${index + 1}`;
            
            // Detect if channel has enum parameters for better Message<XX> signature
            const hasEnumParameters = channelInfo.parameters && channelInfo.parameters.length > 0 && 
              channelInfo.parameters.some(param => param.hasEnum);
            
            consumerGroups.set(queueKey, {
              name: consumerName,
              type: 'consumer',
              subscribePayload: payloadType,
              dynamic: channelInfo.hasParams || false,
              dynamicType,
              reactive,
              parametersToHeaders,
              isSubscriber: true,
              isPublisher: false,
              hasParams: channelInfo.hasParams || false,
              parameters: channelInfo.parameters || [],
              channelInfo: {
                ...channelInfo,
                queueName: queueInfo.queueName,
                topicSubscriptions: queueInfo.topicSubscriptions
              },
              group: queueInfo.queueName + '-group',
              isQueueWithSubscription: true,
              queueName: queueInfo.queueName,
              topicSubscriptions: queueInfo.topicSubscriptions,
              subscribeChannel: channelInfo.subscribeChannel,
              publishChannel: channelInfo.publishChannel,
              operation: realSubscriber,
              messageName: messageName,
              hasEnumParameters: hasEnumParameters
            });
          }
        });
      } else if (channelInfo.queueName) {
        // Handle single destination (backward compatibility)
        const queueKey = `${channelInfo.queueName}::${(channelInfo.topicSubscriptions||[]).join(',')}`;
        
        if (!consumerGroups.has(queueKey)) {
          // Detect if channel has enum parameters for better Message<XX> signature
          const hasEnumParameters = channelInfo.parameters && channelInfo.parameters.length > 0 && 
            channelInfo.parameters.some(param => param.hasEnum);
          
          consumerGroups.set(queueKey, {
            name: toConsumerBeanName(channelInfo.queueName),
            type: 'consumer',
            subscribePayload: payloadType,
            dynamic: channelInfo.hasParams || false,
            dynamicType,
            reactive,
            parametersToHeaders,
            isSubscriber: true,
            isPublisher: false,
            hasParams: channelInfo.hasParams || false,
            parameters: channelInfo.parameters || [],
            channelInfo,
            group: channelInfo.queueName + '-group',
            isQueueWithSubscription: true,
            queueName: channelInfo.queueName,
            topicSubscriptions: channelInfo.topicSubscriptions,
            subscribeChannel: channelInfo.subscribeChannel,
            publishChannel: channelInfo.publishChannel,
            operation: realSubscriber,
            messageName: messageName,
            hasEnumParameters: hasEnumParameters
          });
        }
      } else {
        // Regular consumer (not queue-based)
        // Detect if channel has enum parameters for better Message<XX> signature
        const hasEnumParameters = channelInfo.parameters && channelInfo.parameters.length > 0 && 
          channelInfo.parameters.some(param => param.hasEnum);
        
        functions.push({
          // name: getFunctionName(realSubscriber, channelName, true),
          name: getFunctionName(channelName, realSubscriber, true),
          type: 'consumer',
          subscribePayload: payloadType,
          dynamic: channelInfo.hasParams || false,
          dynamicType,
          reactive,
          parametersToHeaders,
          isSubscriber: true,
          isPublisher: false,
          hasParams: channelInfo.hasParams || false,
          parameters: channelInfo.parameters || [],
          channelInfo,
          operation: realSubscriber,
          messageName: messageName,
          multipleMessageComment: getMultipleMessageComment(realSubscriber),
          hasEnumParameters: hasEnumParameters
        });
      }
    }
  });

  // Add grouped consumers
  functions.push(...Array.from(consumerGroups.values()));
  
  // Process x-scs-function-name grouping for Function type creation
  const processedFunctions = processXScsFunctionNameGrouping(functions, isProvider);
  
  logger.debug(`extractFunctions: Extracted ${processedFunctions.length} functions total (after x-scs-function-name processing)`);
  return processedFunctions;
}


/**
 * Convert queue name to consumer bean name
 * Handles dot-separated names (e.g., 'coreBanking.accounts' -> 'CoreBankingaccounts')
 */
function toConsumerBeanName(str) {
  if (!str) return '';
  
  // Remove curly braces first
  let cleaned = str.replace(/([{}:,])/g, '');
  
  // Special case for consumer bean names with dots (matching reference)
  if (cleaned.includes('.')) {
    const parts = cleaned.split('.');
    cleaned = toCamelCase(parts[0]) + parts.slice(1).map(part => toPascalCase(part)).join('');
  }
  
  // For other cases, use standard PascalCase
  return toCamelCase(cleaned);
}

/**
 * Extract message name from an operation
 */
function extractMessageName(operation) {
  try {
    if (!operation) {
      logger.debug(`extractMessageName: operation is null`);
      return null;
    }
    
    const messages = operation.messages();
    if (!messages || typeof messages.values !== 'function') {
      logger.debug(`extractMessageName: No messages or values function`);
      return null;
    }
    
    const messageArray = Array.from(messages.values());
    logger.debug(`extractMessageName: Found ${messageArray.length} messages`);
    if (messageArray.length === 0) {
      logger.debug(`extractMessageName: No messages in array`);
      return null;
    }
    
    // Take the first message
    const message = messageArray[0];
    logger.debug(`extractMessageName: Processing first message`);
    
    // Try to get the message name using AsyncAPI library functions
    if (message.name && typeof message.name === 'function') {
      const messageName = message.name();
      logger.debug(`extractMessageName: message.name() returned: ${messageName}`);
      if (messageName) {
        return messageName;
      }
    }
    
    // Try to get from operation's message binding
    logger.debug(`extractMessageName: Checking operation message binding - exists: ${!!operation.message}, type: ${typeof operation.message}`);
    if (operation.message && typeof operation.message === 'function') {
      const operationMessage = operation.message();
      logger.debug(`extractMessageName: operation.message() returned: ${operationMessage ? 'exists' : 'null'}`);
      if (operationMessage && operationMessage.name && typeof operationMessage.name === 'function') {
        const operationMessageName = operationMessage.name();
        logger.debug(`extractMessageName: operationMessage.name() returned: ${operationMessageName}`);
        if (operationMessageName) {
          return operationMessageName;
        }
      }
    }
    
    // Try to get from message extensions
    if (message.extensions && typeof message.extensions === 'function') {
      const extensions = message.extensions();
      if (extensions) {
        const eventName = extensions.get('x-ep-event-name');
        if (eventName && eventName.value) {
          logger.debug(`extractMessageName: Found x-ep-event-name: ${eventName.value()}`);
          return eventName.value();
        }
      }
    }
    
    // Try to get from message reference
    logger.debug(`extractMessageName: Checking message.ref - exists: ${!!message.ref}, type: ${typeof message.ref}`);
    if (message.ref && typeof message.ref === 'function') {
      const ref = message.ref();
      logger.debug(`extractMessageName: message.ref() returned: ${ref}`);
      if (ref) {
        // Extract the message name from "#/components/messages/MessageName"
        const match = ref.match(/#\/components\/messages\/(.+)$/);
        if (match) {
          logger.debug(`extractMessageName: Extracted message name from ref: ${match[1]}`);
          return match[1];
        }
      }
    }
    
    // Try to get from message object's internal structure
    logger.debug(`extractMessageName: Checking message object properties`);
    if (message._json) {
      logger.debug(`extractMessageName: message._json exists`);
      // Try to get the message name from the internal JSON structure
      const messageJson = message._json;
      logger.debug(`extractMessageName: message._json keys: ${Object.keys(messageJson).join(', ')}`);
      
      // Check if there's a messageId or similar property
      if (messageJson.messageId) {
        logger.debug(`extractMessageName: Found messageId: ${messageJson.messageId}`);
        return messageJson.messageId;
      }
      
      // Check if there's a name property
      if (messageJson.name) {
        logger.debug(`extractMessageName: Found name: ${messageJson.name}`);
        return messageJson.name;
      }
      
      // Check for x-parser-message-name property
      if (messageJson['x-parser-message-name']) {
        logger.debug(`extractMessageName: Found x-parser-message-name: ${messageJson['x-parser-message-name']}`);
        return messageJson['x-parser-message-name'];
      }
    }
    
    return null;
  } catch (error) {
    logger.warn(`extractMessageName: Error extracting message name: ${error.message}`);
    return null;
  }
}

/**
 * Convert parameter name to camelCase
 * Preserves camelCase patterns like 'transactionID' -> 'transactionID'
 */
function toParameterName(str) {
  if (!str) return '';
  
  // Remove curly braces first
  let cleaned = str.replace(/([{}])/g, '');
  
  // Preserve camelCase parameters (e.g., 'transactionID' -> 'transactionID')
  if (cleaned.match(/^[a-z]+[A-Z][A-Z]/)) {
    return cleaned; // Keep as is for camelCase like transactionID
  }
  
  // Handle camelCase parameters with single capital letter (e.g., 'transactionID' -> 'transactionId')
  if (cleaned.match(/^[a-z]+[A-Z][a-z]*$/)) {
    return cleaned.charAt(0).toLowerCase() + cleaned.slice(1);
  }
  
  // For simple parameters, just lowercase
  return cleaned.toLowerCase();
}

/**
 * Calculate the actual position of a parameter in the channel path
 */
function calculateParameterPosition(channelPath, parameterName) {
  const segments = channelPath.split('/');
  const parameterPlaceholder = `{${parameterName}}`;
  
  for (let i = 0; i < segments.length; i++) {
    if (segments[i] === parameterPlaceholder) {
      return i;
    }
  }
  
  logger.warn(`Parameter ${parameterName} not found in channel path ${channelPath}`);
  return -1;
}

/**
 * Extract channel parameters
 */
function extractChannelParameters(channel) {
  const parameters = [];
  const channelParameters = channel.parameters();
  const channelPath = channel.id();
  
  if (channelParameters && typeof channelParameters.values === 'function') {
    const paramArray = Array.from(channelParameters.values());
    paramArray.forEach((param, index) => {
      try {
        // Handle different ways the required property might be accessed
        let isRequired = false;
        if (typeof param.required === 'function') {
          isRequired = param.required();
        } else if (typeof param.required === 'boolean') {
          isRequired = param.required;
        } else {
          // Default to true for channel parameters
          isRequired = true;
        }
        
        const paramName = toParameterName(param.id());
        const actualPosition = calculateParameterPosition(channelPath, param.id());
        
        // Check if parameter has enum values
        const enumValues = getParameterEnumValues(param);
        const hasEnum = enumValues && enumValues.length > 0;
        
        parameters.push({
          name: paramName,
          type: getParameterType(param),
          required: isRequired,
          position: actualPosition,
          enumValues: enumValues,
          hasEnum: hasEnum
        });
      } catch (error) {
        logger.warn(`Error processing channel parameter ${param?.id() || 'unknown'}:`, error.message);
        // Add a default parameter entry to avoid breaking the generation
        parameters.push({
          name: param?.id() || 'unknown',
          type: 'String',
          required: true,
          position: index
        });
      }
    });
  }
  return sortParametersUsingChannelName(parameters, channel.id());
}

/**
 * Get parameter enum values
 */
function getParameterEnumValues(param) {
  try {
    const schema = param.schema();
    
    if (schema) {
      // Check if schema has enum property
      if (schema.enum && typeof schema.enum === 'function') {
        const enumValues = schema.enum();
        if (Array.isArray(enumValues) && enumValues.length > 0) {
          return enumValues;
        }
      }
      
      // Also check _json for enum values
      if (schema._json && schema._json.enum && Array.isArray(schema._json.enum)) {
        return schema._json.enum;
      }
    }
    return null;
  } catch (error) {
    logger.warn(`Error getting parameter enum values for ${param?.id() || 'unknown'}:`, error.message);
    return null;
  }
}

/**
 * Get parameter type
 */
function getParameterType(param) {
  try {
    const schema = param.schema();
    if (schema) {
      const schemaType = getSchemaType(schema);
      // Convert schema type to Java type
      switch (schemaType.toLowerCase()) {
        case 'string':
          return 'String';
        case 'integer':
          return 'Integer';
        case 'number':
          return 'Double';
        case 'boolean':
          return 'Boolean';
        default:
          return 'String'; // Default to String for unknown types
      }
    }
    return 'String';
  } catch (error) {
    logger.warn(`Error getting parameter type for ${param?.id() || 'unknown'}:`, error.message);
    return 'String';
  }
}

/**
 * Determine extra includes based on functions
 */
function determineExtraIncludes(functions) {
  const extraIncludes = {
    needFunction: false,
    needConsumer: false,
    needSupplier: false,
    needBean: false,
    needMessage: false,
    dynamic: false
  };

  functions.forEach(func => {
    // Check for dynamic functions (functions with parameters)
    if (func.dynamic) {
      extraIncludes.dynamic = true;
    }

    // Check for consumer functions
    if (func.type === 'consumer') {
      extraIncludes.needConsumer = true;
      extraIncludes.needBean = true;
    }

    // Check for supplier functions
    if (func.type === 'supplier') {
      extraIncludes.needSupplier = true;
      extraIncludes.needBean = true;
    }

    // Check for functions that need Message type
    if (func.multipleMessages || func.dynamic) {
      extraIncludes.needMessage = true;
    }

    // Check for functions that need Function type (if any function uses Function)
    if (func.type === 'function') {
      extraIncludes.needFunction = true;
    }
  });

  return extraIncludes;
}

/**
 * Determine imports based on functions and extra includes
 */
function determineImports(functions, extraIncludes, processedSchemas = [], packageName = null) {
  const imports = new Set();
  
  // Add schema imports
  const schemaImports = determineSchemaImports(functions, processedSchemas, packageName);
  schemaImports.forEach(importStr => imports.add(importStr));
  
  return Array.from(imports);
}

/**
 * Determine schema imports based on functions and processed schemas
 */
function determineSchemaImports(functions, processedSchemas = [], currentPackage = null) {
  const imports = new Set();
  
  // Create a map of Avro schemas for quick lookup
  const avroSchemaMap = new Map();
  processedSchemas.forEach(schema => {
    if (schema.isAvro || schema.isAvroSchema) {
      avroSchemaMap.set(schema.name, schema);
    }
  });
  
  functions.forEach(func => {
    // Add imports for subscribe payload types
    let subscribePayloadType = func.subscribePayload;
    if (subscribePayloadType && typeof subscribePayloadType === 'object' && subscribePayloadType.javaType) {
      subscribePayloadType = subscribePayloadType.javaType;
    }
    if (subscribePayloadType && typeof subscribePayloadType === 'string' && subscribePayloadType !== 'String' && subscribePayloadType !== 'Message<?>' && subscribePayloadType !== 'Object') {
      const importStr = getSchemaImport(subscribePayloadType, avroSchemaMap, currentPackage);
      if (importStr) {
        imports.add(importStr);
      }
    }
    // Add imports for publish payload types
    let publishPayloadType = func.publishPayload;
    if (publishPayloadType && typeof publishPayloadType === 'object' && publishPayloadType.javaType) {
      publishPayloadType = publishPayloadType.javaType;
    }
    if (publishPayloadType && typeof publishPayloadType === 'string' && publishPayloadType !== 'String' && publishPayloadType !== 'Message<?>' && publishPayloadType !== 'Object') {
      const importStr = getSchemaImport(publishPayloadType, avroSchemaMap, currentPackage);
      if (importStr) {
        imports.add(importStr);
      }
    }
  });
  
  return Array.from(imports);
}

/**
 * Get schema import for a given schema name
 */
function getSchemaImport(schemaName, avroSchemaMap = new Map(), currentPackage = null) {
  if (!schemaName || schemaName === 'String' || schemaName === 'Message<?>') {
    return null;
  }
  
  // Handle generic types like List<Type>
  if (schemaName.includes('<') && schemaName.includes('>')) {
    // Extract the generic type (e.g., "List<Customer>" -> "Customer")
    const match = schemaName.match(/<([^>]+)>/);
    if (match) {
      const innerType = match[1];
      // Recursively get import for the inner type
      const innerImport = getSchemaImport(innerType, avroSchemaMap);
      return innerImport; // Return the import for the inner type, not the generic
    }
  }
  
  // Check if it's a Java primitive type - don't add import
  const javaPrimitiveTypes = [
    'String', 'Integer', 'Long', 'Float', 'Double', 'Boolean',
    'java.time.OffsetDateTime', 'java.time.LocalDate', 'java.time.LocalTime',
    'java.time.LocalDateTime', 'java.time.Instant', 'java.math.BigDecimal',
    'byte[]', 'Object'
  ];
  
  if (javaPrimitiveTypes.includes(schemaName)) {
    return null; // No import needed for primitive types
  }
  
  // Check if it's an anonymous schema - don't add import
  if (schemaName.includes('<anonymousSchema') || schemaName.includes('anonymousSchema')) {
    return null; // Don't import anonymous schemas
  }
  
  // Check if it's an Avro schema
  if (avroSchemaMap.has(schemaName)) {
    const avroSchema = avroSchemaMap.get(schemaName);
    const packageName = avroSchema.packagePath || 'com.company';
    const className = avroSchema.className || schemaName;
    return `${packageName}.${className}`;
  }
  
  // Check if we can find the schema by className in the Avro map
  for (const [fullSchemaName, avroSchema] of avroSchemaMap.entries()) {
    if (avroSchema.className === schemaName) {
      // Extract namespace from the full schema name (e.g., "userpublisher.User" -> "userpublisher")
      const lastDotIndex = fullSchemaName.lastIndexOf('.');
      if (lastDotIndex > 0) {
        const namespace = fullSchemaName.substring(0, lastDotIndex);
        const className = avroSchema.className || schemaName;
        logger.debug(`coreProcessor.js: getSchemaImport() - Found Avro schema ${schemaName} in namespace ${namespace}`);
        return `${namespace}.${className}`;
      }
    }
  }
  
  // For regular schemas, check if they're in the same package
  if (currentPackage) {
    // Check if this schema exists in the current package (same directory)
    // If it's in the same package, don't generate an import
    const schemaInCurrentPackage = `${currentPackage}.${schemaName}`;
    logger.debug(`coreProcessor.js: getSchemaImport() - Schema ${schemaName} would be in current package: ${schemaInCurrentPackage}`);
    // For now, assume all schemas are in the same package unless they have a specific package path
    return null; // Don't import schemas in the same package
  }
  
  // Fallback: assume they're in the default package (for backward compatibility)
  return `com.company.${schemaName}`;
}

/**
 * Generate app properties
 */
function generateAppProperties(asyncapi, params) {
  // Destructure parameters with defaults from package.json
  const { 
    binder = 'kafka', 
    host, 
    username, 
    password, 
    msgVpn, 
    parametersToHeaders = false,
    view: paramView 
  } = params;
  
  // Validate binder parameter
  if (binder !== 'kafka' && binder !== 'rabbit' && binder !== 'solace') {
    throw new Error('Please provide a parameter named \'binder\' with the value kafka, rabbit or solace.');
  }
  
  const properties = [];
  const channels = asyncapi.channels();
  
  if (!channels || typeof channels.values !== 'function') {
    return properties;
  }
  
  // Determine view (provider/client)
  const info = asyncapi.info();
  const view = paramView || (info.extensions && info.extensions().get('x-view') ? info.extensions().get('x-view').value() : undefined);
  const isProvider = view === 'provider';
  
  Array.from(channels.values()).forEach(channel => {
    const channelName = channel.id();
    
    // Handle publish operations
    const publishOperation = channel.publish ? channel.publish() : null;
    if (publishOperation) {
      // const functionName = getFunctionName(publishOperation, channelName, false);
      const functionName = getFunctionName(channelName, publishOperation, false);
      const destination = getChannelDestination(channel, publishOperation);
      
      // Client view: publish operations become subscribers (consumers)
      // Provider view: publish operations become publishers (suppliers)
      const isPublisher = isProvider;
      const bindingType = isPublisher ? 'out-0' : 'in-0';
      const operationType = isPublisher ? 'Supplier' : 'Consumer';
      
      properties.push(`spring.cloud.stream.bindings.${functionName}-${bindingType}.destination=${destination}`);
      
      // Add binder-specific properties
      if (binder === 'solace') {
        properties.push(`spring.cloud.stream.bindings.${functionName}-${bindingType}.binder=solace`);
      }
    }
    
    // Handle subscribe operations
    const subscribeOperation = channel.subscribe ? channel.subscribe() : null;
    if (subscribeOperation) {
      // const functionName = getFunctionName(subscribeOperation, channelName, true);
      const functionName = getFunctionName(channelName, subscribeOperation, true);
      const destination = getChannelDestination(channel, subscribeOperation);
      
      // Client view: subscribe operations become publishers (suppliers)
      // Provider view: subscribe operations become subscribers (consumers)
      const isPublisher = !isProvider;
      const bindingType = isPublisher ? 'out-0' : 'in-0';
      const operationType = isPublisher ? 'Supplier' : 'Consumer';
      
      properties.push(`spring.cloud.stream.bindings.${functionName}-${bindingType}.destination=${destination}`);
      
      // Add binder-specific properties
      if (binder === 'solace') {
        properties.push(`spring.cloud.stream.bindings.${functionName}-${bindingType}.binder=solace`);
      }
    }
  });
  
  return properties;
}

/**
 * Get channel destination for an operation
 */
function getChannelDestination(channel, operation) {
  // Check for x-scs-destination extension on the operation
  const extensions = operation.extensions();
  if (extensions && extensions.get('x-scs-destination')) {
    return extensions.get('x-scs-destination').value();
  }
  
  // Default to channel name
  return channel.id();
}

/**
 * Get channel information for a function
 */
function getChannelInfo(channel, operation, parameters) {
  // For send functions (subscribe operations in client view), we need to ensure publishChannel is set
  let publishChannel = getPublishChannel(channel, operation);
  
  // If publishChannel is null but this is a send function (subscribe operation), 
  // we need to create the publish channel from the current channel
  if (!publishChannel && operation.action() === 'subscribe') {
    publishChannel = replaceChannelParametersWithFormatStrings(channel.id(), channel);
  }
  
  const channelInfo = {
    publishChannel: publishChannel,
    subscribeChannel: getSubscribeChannel(channel, operation),
    parameters
  };
  
  // Generate function parameter list and argument list for send functions
  if (parameters && parameters.length > 0) {
    const paramList = parameters.map(param => `${param.type} ${param.name}`).join(', ');
    const argList = parameters.map(param => param.name).join(', ');
    channelInfo.functionParamList = paramList;
    channelInfo.functionArgList = argList;
  } else {
    channelInfo.functionParamList = '';
    channelInfo.functionArgList = '';
  }
  
  // Extract Solace queue information from bindings
  const queueInfo = extractSolaceQueueInfo(channel, operation);
  if (queueInfo) {
    channelInfo.queueName = queueInfo.queueName;
    channelInfo.topicSubscriptions = queueInfo.topicSubscriptions;
  }
  
  return channelInfo;
}

/**
 * Get channel information for a consumer function, checking publish operation for Solace queue bindings
 */
function getChannelInfoForConsumer(channel, operation, parameters, isProvider) {
  logger.debug(`coreProcessor.js: getChannelInfoForConsumer() - Operation action: ${operation.action()}`);
  
  // For consumer functions, we need to get the actual subscribe operation for subscribeChannel
  // regardless of the view (provider/client)
  const operations = channel.operations && typeof channel.operations === 'function'
    ? Array.from(channel.operations().values())
    : [];
  const subscribeOperation = operations.find(op => op.action() === 'subscribe') || null;
  const publishOperation = operations.find(op => op.action() === 'publish') || null;
  
  logger.debug(`coreProcessor.js: getChannelInfoForConsumer() - subscribeOperation: ${subscribeOperation ? subscribeOperation.action() : 'null'}`);
  logger.debug(`coreProcessor.js: getChannelInfoForConsumer() - publishOperation: ${publishOperation ? publishOperation.action() : 'null'}`);
  
  const channelInfo = {
    publishChannel: getPublishChannel(channel, operation),
    subscribeChannel: subscribeOperation ? getSubscribeChannel(channel, subscribeOperation) : replaceChannelParametersWithWildcards(channel.id(), channel),
    parameters,
    hasParams: parameters && parameters.length > 0
  };
  
  // For consumer functions, check the publish operation for Solace queue bindings
  // In client view: consumer functions come from publish operations
  // In provider view: consumer functions come from subscribe operations
  let queueOperation = operation;
  if (!isProvider) {
    // Client view: check publish operation for queue bindings
    const publishOperation = channel.publish ? channel.publish() : null;
    if (publishOperation) {
      queueOperation = publishOperation;
    }
  }
  
  // Extract Solace queue information from bindings
  const queueInfos = extractSolaceQueueInfo(channel, queueOperation);
  if (queueInfos && queueInfos.length > 0) {
    // For backward compatibility, use the first queue info for the main channelInfo
    const firstQueueInfo = queueInfos[0];
    channelInfo.queueName = firstQueueInfo.queueName;
    channelInfo.topicSubscriptions = firstQueueInfo.topicSubscriptions;
    
    // Store all queue infos for multiple destination handling
    channelInfo.allQueueInfos = queueInfos;
  }
  
  return channelInfo;
}

/**
 * Extract Solace queue information from channel bindings
 * Returns an array of queue information for all destinations
 */
function extractSolaceQueueInfo(channel, operation) {
  try {
    logger.debug(`coreProcessor.js: extractSolaceQueueInfo() - Extracting queue info for channel: ${channel.id()}`);
    
    const bindings = operation.bindings();
    if (!bindings) {
      logger.debug(`coreProcessor.js: extractSolaceQueueInfo() - No bindings found`);
      return null;
    }
    
    const solaceBinding = bindings.get('solace');
    if (!solaceBinding) {
      logger.debug(`coreProcessor.js: extractSolaceQueueInfo() - No solace binding found`);
      return null;
    }
    
    // Access the raw JSON structure since the AsyncAPI library methods might not work as expected
    const solaceBindingJson = solaceBinding._json || solaceBinding;
    if (!solaceBindingJson || !solaceBindingJson.destinations) {
      logger.debug(`coreProcessor.js: extractSolaceQueueInfo() - No destinations found in solace binding`);
      return null;
    }
    
    const destinations = solaceBindingJson.destinations;
    if (!destinations || destinations.length === 0) {
      logger.debug(`coreProcessor.js: extractSolaceQueueInfo() - No destinations array found`);
      return null;
    }
    
    logger.debug(`coreProcessor.js: extractSolaceQueueInfo() - Found ${destinations.length} destinations`);
    
    const queueInfos = [];
    
    destinations.forEach((destination, index) => {
      logger.debug(`coreProcessor.js: extractSolaceQueueInfo() - Processing destination ${index}: ${JSON.stringify(destination)}`);
      
      if (destination.destinationType === 'queue') {
        const queue = destination.queue;
        if (queue) {
          const queueName = queue.name;
          const topicSubscriptions = queue.topicSubscriptions || [];
          
          logger.debug(`coreProcessor.js: extractSolaceQueueInfo() - Found queue: ${queueName} with ${topicSubscriptions.length} topic subscriptions`);
          
          queueInfos.push({
            queueName,
            topicSubscriptions
          });
        }
      }
    });
    
    logger.debug(`coreProcessor.js: extractSolaceQueueInfo() - Returning ${queueInfos.length} queue infos`);
    return queueInfos.length > 0 ? queueInfos : null;
  } catch (error) {
    logger.debug(`coreProcessor.js: extractSolaceQueueInfo() - Error: ${error.message}`);
    return null;
  }
}

/**
 * Get group name for a function
 */
function getGroupName(channel, operation, params) {
  // Check for x-scs-group extension first
  const extensions = operation.extensions();
  if (extensions && extensions.get('x-scs-group')) {
    return extensions.get('x-scs-group').value();
  }
  
  // Only return a group name if explicitly defined in AsyncAPI
  // Don't generate default group names
  return null;
}

/**
 * Check if channel has queue with subscription
 */
function isQueueWithSubscription(channel, operation) {
  // Check for x-scs-queue extension
  const extensions = operation.extensions();
  if (extensions && extensions.get('x-scs-queue')) {
    return true;
  }
  
  // Check for x-scs-group extension (indicates queue-based consumer)
  if (extensions && extensions.get('x-scs-group')) {
    return true;
  }
  
  return false;
}

/**
 * Get queue name for a function
 */
function getQueueName(channel, operation, params) {
  // Check for x-scs-queue extension first
  const extensions = operation.extensions();
  if (extensions && extensions.get('x-scs-queue')) {
    return extensions.get('x-scs-queue').value();
  }
  
  // Check for x-scs-group extension
  if (extensions && extensions.get('x-scs-group')) {
    return extensions.get('x-scs-group').value();
  }
  
  // Generate queue name from channel and operation
  const channelName = channel.id();
  const operationId = operation.id() || 'unknown';
  
  return `${channelName}.${operationId}`;
}

/**
 * Get subscribe channel for a function
 * Replaces parameter placeholders with wildcards for subscribe operations
 */
function getSubscribeChannel(channel, operation) {
  let channelName = channel.id();
  
  // For subscribe operations, use the channel name with wildcards
  if (operation.action() === 'subscribe') {
    return replaceChannelParametersWithWildcards(channelName, channel);
  }
  
  // For publish operations, check if there's a subscribe operation on the same channel
  const subscribeOperation = channel.subscribe ? channel.subscribe() : null;
  if (subscribeOperation) {
    return replaceChannelParametersWithWildcards(channelName, channel);
  }
  
  return null;
}

/**
 * Get publish channel for a function
 * Replaces parameter placeholders with format strings for publish operations
 */
function getPublishChannel(channel, operation) {
  let channelName = channel.id();
  
  // For publish operations, use the channel name with format strings
  if (operation.action() === 'publish') {
    return replaceChannelParametersWithFormatStrings(channelName, channel);
  }
  
  // For subscribe operations, check if there's a publish operation on the same channel
  const publishOperation = channel.publish ? channel.publish() : null;
  if (publishOperation) {
    return replaceChannelParametersWithFormatStrings(channelName, channel);
  }
  
  return null;
}

/**
 * Replace channel parameters with wildcards for subscribe operations
 */
function replaceChannelParametersWithWildcards(channelName, channel) {
  logger.debug(`coreProcessor.js: replaceChannelParametersWithWildcards() - Processing channel: ${channelName}`);
  let result = channelName;
  const channelParameters = channel.parameters();
  
  if (channelParameters && typeof channelParameters.values === 'function') {
    Array.from(channelParameters.values()).forEach(param => {
      const paramName = param.id();
      const placeholder = `{${paramName}}`;
      result = result.replace(placeholder, '*');
      logger.debug(`coreProcessor.js: replaceChannelParametersWithWildcards() - Replaced ${placeholder} with *`);
    });
  }
  
  logger.debug(`coreProcessor.js: replaceChannelParametersWithWildcards() - Final result: ${result}`);
  return result;
}

/**
 * Replace channel parameters with format strings for publish operations
 */
function replaceChannelParametersWithFormatStrings(channelName, channel) {
  logger.debug(`coreProcessor.js: replaceChannelParametersWithFormatStrings() - Processing channel: ${channelName}`);
  let result = channelName;
  const channelParameters = channel.parameters();
  
  if (channelParameters && typeof channelParameters.values === 'function') {
    Array.from(channelParameters.values()).forEach(param => {
      const paramName = param.id();
      const placeholder = `{${paramName}}`;
      const schema = param.schema();
      
      // Determine format string based on parameter type
      let formatString = '%s'; // Default to string
      if (schema) {
        const type = schema.type();
        const format = schema.format();
        
        if (type === 'integer') {
          formatString = '%d';
        } else if (type === 'number') {
          formatString = '%f';
        } else if (type === 'boolean') {
          formatString = '%b';
        }
        // For string and other types, use '%s'
      }
      
      result = result.replace(placeholder, formatString);
      logger.debug(`coreProcessor.js: replaceChannelParametersWithFormatStrings() - Replaced ${placeholder} with ${formatString}`);
    });
  }
  
  logger.debug(`coreProcessor.js: replaceChannelParametersWithFormatStrings() - Final result: ${result}`);
  return result;
}

/**
 * Process functions to group operations by matching x-scs-function-name and create Function types
 */
function processXScsFunctionNameGrouping(functions, isProvider = false) {
  logger.debug('processXScsFunctionNameGrouping: Starting x-scs-function-name grouping');
  
  // Group functions by their operation's x-scs-function-name extension
  const functionNameGroups = new Map();
  const remainingFunctions = [];
  
  functions.forEach(func => {
    const operation = func.operation;
    if (operation && operation.extensions && operation.extensions().get('x-scs-function-name')) {
      const customName = operation.extensions().get('x-scs-function-name').value();
      
      if (!functionNameGroups.has(customName)) {
        functionNameGroups.set(customName, []);
      }
      functionNameGroups.get(customName).push(func);
      logger.debug(`processXScsFunctionNameGrouping: Grouped function ${func.name} under custom name: ${customName}`);
    } else {
      // Functions without x-scs-function-name remain as-is
      remainingFunctions.push(func);
    }
  });
  
  const processedFunctions = [...remainingFunctions];
  
  // Process each group to create Function types where appropriate
  functionNameGroups.forEach((groupedFunctions, customName) => {
    if (groupedFunctions.length === 2) {
      // Check if we have exactly one supplier and one consumer
      const suppliers = groupedFunctions.filter(f => f.type === 'supplier');
      const consumers = groupedFunctions.filter(f => f.type === 'consumer');
      
      if (suppliers.length === 1 && consumers.length === 1) {
        // Create a Function type
        const supplier = suppliers[0];
        const consumer = consumers[0];
        
        // FIX: Handle view-aware input/output mapping for x-scs-function-name
        // For x-scs-function-name, we want: subscribe operation = input, publish operation = output
        let inputPayload, outputPayload, inputOperation, outputOperation;
        
        if (isProvider) {
          // Provider view: consumer comes from subscribe (input), supplier comes from publish (output)
          inputPayload = consumer.subscribePayload;
          outputPayload = supplier.publishPayload;
          inputOperation = consumer.operation;
          outputOperation = supplier.operation;
        } else {
          // Client view: supplier comes from subscribe (input), consumer comes from publish (output)
          inputPayload = supplier.publishPayload;
          outputPayload = consumer.subscribePayload;
          inputOperation = supplier.operation;
          outputOperation = consumer.operation;
        }
        
        const functionSpec = {
          name: customName, // Use custom name without suffix
          type: 'function',
          subscribePayload: inputPayload,
          publishPayload: outputPayload,
          dynamic: consumer.dynamic || supplier.dynamic,
          dynamicType: consumer.dynamicType || supplier.dynamicType,
          reactive: consumer.reactive || supplier.reactive,
          parametersToHeaders: consumer.parametersToHeaders || supplier.parametersToHeaders,
          isSubscriber: false,
          isPublisher: false,
          hasParams: consumer.hasParams || supplier.hasParams,
          parameters: consumer.parameters || supplier.parameters || [],
          channelInfo: consumer.channelInfo || supplier.channelInfo,
          operation: inputOperation, // Use input operation
          messageName: consumer.messageName,
          multipleMessageComment: consumer.multipleMessageComment,
          // Additional properties for Function type
          inputPayload: inputPayload,
          outputPayload: outputPayload,
          inputOperation: inputOperation,
          outputOperation: outputOperation
        };
        
        processedFunctions.push(functionSpec);
        logger.debug(`processXScsFunctionNameGrouping: Created Function type: ${customName} (${inputPayload} -> ${outputPayload}) [view: ${isProvider ? 'provider' : 'client'}]`);
      } else {
        // Invalid grouping - add functions individually
        processedFunctions.push(...groupedFunctions);
        logger.warn(`processXScsFunctionNameGrouping: Invalid grouping for ${customName}: ${suppliers.length} suppliers, ${consumers.length} consumers`);
      }
    } else if (groupedFunctions.length === 1) {
      // Single function with custom name - use as-is
      processedFunctions.push(groupedFunctions[0]);
      logger.debug(`processXScsFunctionNameGrouping: Single function with custom name: ${customName}`);
    } else {
      // Invalid grouping (more than 2 functions with same name)
      processedFunctions.push(...groupedFunctions);
      logger.error(`processXScsFunctionNameGrouping: Too many functions (${groupedFunctions.length}) with same x-scs-function-name: ${customName}`);
    }
  });
  
  logger.debug(`processXScsFunctionNameGrouping: Processed ${functions.length} -> ${processedFunctions.length} functions`);
  return processedFunctions;
}

module.exports = {
  processAsyncApi,
  extractSchemas,
  extractFunctions
};
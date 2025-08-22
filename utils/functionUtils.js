const _ = require('lodash');
const { logger } = require('./logger');
const { toPascalCase, toCamelCase, getSchemaType, stripPackageName, getEnhancedType } = require('./typeUtils');

/**
 * Get Java primitive type for AsyncAPI schema type
 * Following Nunjucks reference project type mapping logic
 */
function getPrimitiveJavaType(schemaType, payload) {
  if (!schemaType) return null;
  
  // Get format if available
  const format = payload && payload.format && typeof payload.format === 'function' 
    ? payload.format() 
    : null;
  
  switch (schemaType.toLowerCase()) {
    case 'string':
      // Handle string formats (following Nunjucks typeMap)
      switch (format) {
        case 'date-time':
          return 'java.time.OffsetDateTime';
        case 'byte':
        case 'binary':
          return 'byte[]';
        default:
          return 'String';
      }
    case 'integer':
      // Handle integer formats
      switch (format) {
        case 'int64':
          return 'Long';
        case 'int32':
        default:
          return 'Integer';
      }
    case 'number':
      // Handle number formats
      switch (format) {
        case 'float':
          return 'Float';
        case 'double':
          return 'Double';
        default:
          return 'java.math.BigDecimal';
      }
    case 'boolean':
      return 'Boolean';
    case 'null':
      return 'String';
    default:
      return null; // Not a primitive type
  }
}

/**
 * Check if operation has multiple messages
 */
function hasMultipleMessages(operation) {
  if (!operation || !operation.messages) {
    return false;
  }
  
  const messages = operation.messages();
  if (!messages || typeof messages.values !== 'function') {
    return false;
  }
  
  const messageArray = Array.from(messages.values());
  return messageArray.length > 1;
}

/**
 * Get the correct payload type for a function
 * Extracts type information from operation messages
 */
function getFunctionPayloadType(operation, avroSchemaMap) {
  logger.debug('coreProcessor.js: getFunctionPayloadType() - Getting function payload type');
  try {
    if (!operation) {
      logger.warn('getFunctionPayloadType: operation is null or undefined');
      return 'String';
    }
    
    const messages = operation.messages();
    if (!messages || typeof messages.values !== 'function') {
      logger.debug('coreProcessor.js: getFunctionPayloadType() - No messages or values function');
      return 'String';
    }
  
    const messageArray = Array.from(messages.values());
    logger.debug(`coreProcessor.js: getFunctionPayloadType() - Found ${messageArray.length} messages`);
    if (messageArray.length === 0) {
      return 'String';
    }
    
    // Check for multiple messages (oneOf scenarios)
    if (messageArray.length > 1) {
      logger.debug(`getFunctionPayloadType: Multiple messages detected (${messageArray.length}), using Message<?>`);
      return 'Message<?>';
    }
    
    // Single message case
    const message = messageArray[0];

    const payload = message.payload();
    logger.debug(`coreProcessor.js: getFunctionPayloadType() - Single message payload:`, payload ? 'exists' : 'null');
    
    if (!payload) {
      return 'String';
    }
    
    // Check for Event Name (x-ep-schema-name)
    if (payload.extensions && typeof payload.extensions === 'function') {
      const extensions = payload.extensions();
      if (extensions) {
        const schemaName = extensions.get('x-ep-schema-name');
        if (schemaName && schemaName.value) {
          logger.debug(`coreProcessor.js: getFunctionPayloadType() - Schema name from x-ep-schema-name: "${schemaName.value()}"`);
          return toPascalCase(schemaName.value());
        }
      }
    }

    // Check if it's a reference to a schema
    if (payload.hasRef && payload.hasRef()) {
      const ref = payload.ref();
      logger.debug(`coreProcessor.js: getFunctionPayloadType() - Found ref: "${ref}"`);
      if (ref) {
        // Extract schema name from reference
        const schemaName = ref.split('/').pop();
        logger.debug(`coreProcessor.js: getFunctionPayloadType() - Schema name from ref: "${schemaName}"`);
        // Convert to Java class name (PascalCase)
        const result = toPascalCase(schemaName);
        logger.debug(`coreProcessor.js: getFunctionPayloadType() - toPascalCase result: "${result}"`);
        return result;
      }
    }
    
    // FIRST: Check for primitive types (following Nunjucks reference pattern)
    const schemaType = getSchemaType(payload);
    logger.debug(`coreProcessor.js: getFunctionPayloadType() - Schema type: "${schemaType}"`);
    
    // For primitive types, use Java primitive types directly
    if (schemaType && schemaType !== 'object') {
      const primitiveType = getPrimitiveJavaType(schemaType, payload);
      if (primitiveType) {
        logger.debug(`coreProcessor.js: getFunctionPayloadType() - Using primitive type: "${primitiveType}"`);
        return primitiveType;
      }
    }
    
    // Handle array types properly
    if (schemaType === 'array') {
      const items = payload.items && typeof payload.items === 'function' ? payload.items() : null;
      if (items) {
        const itemType = getSchemaType(items);
        if (itemType === 'object') {
          // Array of objects - check for schema name
          let itemSchemaName = null;
          if (items.extensions && typeof items.extensions === 'function') {
            const extensions = items.extensions();
            if (extensions) {
              const schemaId = extensions.get('x-parser-schema-id');
              if (schemaId && schemaId.value) {
                itemSchemaName = schemaId.value();
              }
            }
          }
          if (itemSchemaName && !itemSchemaName.startsWith('<anonymous')) {
            const { className } = stripPackageName(itemSchemaName);
            const result = `List<${toPascalCase(className)}>`;
            logger.debug(`coreProcessor.js: getFunctionPayloadType() - Array of objects: "${result}"`);
            return result;
          } else {
            // Anonymous schema or no schema name - use generic type
            const result = 'List<Object>';
            logger.debug(`coreProcessor.js: getFunctionPayloadType() - Array of anonymous objects: "${result}"`);
            return result;
          }
        } else {
          // Array of primitives
          const primitiveType = getPrimitiveJavaType(itemType, items);
          if (primitiveType) {
            const result = `List<${primitiveType}>`;
            logger.debug(`coreProcessor.js: getFunctionPayloadType() - Array of primitives: "${result}"`);
            return result;
          } else {
            const result = 'List<Object>';
            logger.debug(`coreProcessor.js: getFunctionPayloadType() - Array of unknown type: "${result}"`);
            return result;
          }
        }
      }
      // Fallback for array without items
      return 'List<Object>';
    }

    // THEN: Check if it's an object with schema info using AsyncAPI library functions
    if (payload.extensions && typeof payload.extensions === 'function') {
      const extensions = payload.extensions();
      if (extensions) {
        const schemaId = extensions.get('x-parser-schema-id');
        if (schemaId && schemaId.value && !schemaId.value().includes('http')) {
          const schemaName = schemaId.value().split('/').pop().replace('.schema.json', '');
          logger.debug(`coreProcessor.js: getFunctionPayloadType() - Schema name from x-parser-schema-id: "${schemaName}"`);
          
          // Check if it's an anonymous schema
          if (schemaName.startsWith('<anonymous')) {
            // For anonymous schemas, check if it has properties to generate a class
            if (payload.properties && typeof payload.properties === 'function') {
              const properties = payload.properties();
              if (properties && (typeof properties.values === 'function' || typeof properties === 'object')) {
                // This is a complex object - generate a class name based on message name
                const messageName = message.name && typeof message.name === 'function' ? message.name() : 'Message';
                const result = toPascalCase(messageName);
                logger.debug(`coreProcessor.js: getFunctionPayloadType() - Anonymous schema with properties: "${result}"`);
                return result;
              }
            }
            // Simple anonymous schema - use Object
            logger.debug(`coreProcessor.js: getFunctionPayloadType() - Simple anonymous schema: "Object"`);
            return 'Object';
          }
          
          // For Avro schemas with namespaces, strip package name to get just the class name
          const { className } = stripPackageName(schemaName);
          const result = toPascalCase(className);
          logger.debug(`coreProcessor.js: getFunctionPayloadType() - toPascalCase result: "${result}"`);
          return result;
        }
      }
    }
        
    // Check if it's an object with $id using AsyncAPI library functions
    if (payload.id && typeof payload.id === 'function') {
      const schemaId = payload.id();
      if (schemaId) {
        const schemaName = schemaId.split('/').pop().replace('.schema.json', '');
        logger.debug(`coreProcessor.js: getFunctionPayloadType() - Schema name from id: "${schemaName}"`);
        
        // Check if this is an empty object schema (no properties)
        if (payload.properties && typeof payload.properties === 'function') {
          const properties = payload.properties();
          if (!properties || (typeof properties.values === 'function' && properties.values().length === 0) || 
              (typeof properties === 'object' && Object.keys(properties).length === 0)) {
            logger.debug(`coreProcessor.js: getFunctionPayloadType() - Empty object schema "${schemaName}", using Object`);
            return 'Object';
          }
        }
        
        const result = toPascalCase(schemaName);
        logger.debug(`coreProcessor.js: getFunctionPayloadType() - toPascalCase result: "${result}"`);
        return result;
      }
    }
    
    // For object types, try to extract schema name
    // Try to extract name from schema using AsyncAPI library functions
    if (payload.title && typeof payload.title === 'function') {
      const title = payload.title();
      if (title) {
        logger.debug(`coreProcessor.js: getFunctionPayloadType() - Schema name from title: "${title}"`);
        const result = toPascalCase(title);
        logger.debug(`coreProcessor.js: getFunctionPayloadType() - toPascalCase result: "${result}"`);
        return result;
      }
    }
    if (payload.id && typeof payload.id === 'function') {
      const schemaId = payload.id();
      if (schemaId) {
        const schemaName = schemaId.split('/').pop().replace('.schema.json', '');
        logger.debug(`coreProcessor.js: getFunctionPayloadType() - Schema name from id: "${schemaName}"`);
        const result = toPascalCase(schemaName);
        logger.debug(`coreProcessor.js: getFunctionPayloadType() - toPascalCase result: "${result}"`);
        return result;
      }
    }
    
    // Check if it's a complex object with properties that should generate a class
    if (payload.properties && typeof payload.properties === 'function') {
      const properties = payload.properties();
      if (properties && (typeof properties.values === 'function' || typeof properties === 'object')) {
        // This is a complex object - generate a class name based on message name
        const messageName = message.name && typeof message.name === 'function' ? message.name() : 'Message';
        const result = toPascalCase(messageName);
        logger.debug(`coreProcessor.js: getFunctionPayloadType() - Complex object with properties: "${result}"`);
        return result;
      }
    }
    
    logger.debug(`coreProcessor.js: getFunctionPayloadType() - Final result: "Object"`);
    return 'Object';
  } catch (error) {
    logger.warn(`getFunctionPayloadType: Error getting payload type: ${error.message}`);
    return 'String';
  }
}

/**
 * Get function name from channel name and operation
 */
function getFunctionName(channelName, operation, isSubscriber) {
  logger.debug(`functionUtils.js: getFunctionName() - Getting function name for channel: ${channelName}, isSubscriber: ${isSubscriber}`);
  
  if (!channelName) {
    logger.warn('functionUtils.js: getFunctionName() - Channel name is undefined');
    return 'unknownFunction';
  }
  
  const multipleMessages = getMultipleMessageComment(operation);
  let functionName = null;
  let hasCustomName = false;
  
  // Check for x-scs-function-name extension first
  if (operation.extensions().get('x-scs-function-name')) {
    functionName = operation.extensions().get('x-scs-function-name').value();
    hasCustomName = true;
    logger.debug(`functionUtils.js: getFunctionName() - Using x-scs-function-name: ${functionName}`);
  }

  // Only use fallback logic if x-scs-function-name is not set
  if (!functionName) {
    const solaceBinding = operation.bindings().get('solace');
    if (solaceBinding && solaceBinding.queueName && solaceBinding.topicSubscriptions) {
      functionName = solaceBinding.queueName;
    } else if (operation.id()) {
      functionName = operation.id();
      if (['publish', 'subscribe', 'send', 'receive'].includes(functionName)) {
        functionName = channelName;
      }
    } else {
      functionName = channelName;
    }
  }

  functionName = (!functionName || functionName === channelName) && operation ? getMessageName(operation) : functionName;
  if (multipleMessages || functionName.includes('anonymous')) {
    functionName = channelName;
  }

  // Fallback to channel name even for complex channels
  if (!functionName || functionName === channelName) {
    const segments = channelName.split('/');
    functionName = `${toCamelCase(segments[0])}${segments.slice(1).map(segment => toPascalCase(segment)).join('')}`;
    logger.debug(`functionUtils.js: getFunctionName() - Using channel name for complex channel: ${functionName}`);
  }

  // Add suffix based on operation type (only if not using custom name)
  if (hasCustomName) {
    // Use x-scs-function-name as-is without suffix
    return toCamelCase(functionName);
  } else {
    // Add suffix for generated names
    if (isSubscriber) {
      return `${toCamelCase(functionName)}Consumer`;
    } else {
      return `${toCamelCase(functionName)}Supplier`;
    }
  }
}

/**
 * Get channel info for publisher
 */
function getChannelInfo(params, channelName, channel) {
  logger.debug(`functionUtils.js: getChannelInfo() - Getting channel info for: ${channelName}`);
  
  const channelInfo = {
    channelName: channelName,
    hasParams: false,
    parameters: [],
    publishChannel: channelName,
    subscribeChannel: channelName,
    functionArgList: '',
    functionParamList: ''
  };
  
  // Extract parameters from channel name
  const paramMatches = channelName.match(/\{([^}]+)\}/g);
  if (paramMatches) {
    channelInfo.hasParams = true;
    
    paramMatches.forEach((match, index) => {
      const paramName = match.replace(/[{}]/g, '');
      const paramType = 'String'; // Default to String for path parameters
      const sampleArg = getSampleArg({ type: paramType, name: paramName });
      
      // Calculate actual position in channel path
      const segments = channelName.split('/');
      let actualPosition = -1;
      for (let i = 0; i < segments.length; i++) {
        if (segments[i] === match) {
          actualPosition = i;
          break;
        }
      }
      
      const parameter = {
        name: paramName,
        type: paramType,
        sampleArg: sampleArg,
        position: actualPosition
      };
      
      channelInfo.parameters.push(parameter);
      
      // Build function argument and parameter lists
      if (index > 0) {
        channelInfo.functionArgList += ', ';
        channelInfo.functionParamList += ', ';
      }
      channelInfo.functionArgList += paramName;
      channelInfo.functionParamList += `${paramType} ${paramName}`;
      logger.debug(`functionUtils.js: getChannelInfo() - Added parameter: ${paramType} ${paramName}`);
      logger.debug(`functionUtils.js: getChannelInfo() - Current functionParamList: ${channelInfo.functionParamList}`);
    });
  }
  
  logger.debug(`functionUtils.js: getChannelInfo() - Channel info:`, channelInfo);
  return channelInfo;
}

/**
 * Get channel info for consumer
 */
function getChannelInfoForConsumer(params, channelName, channel) {
  logger.debug(`functionUtils.js: getChannelInfoForConsumer() - Getting consumer channel info for: ${channelName}`);
  
  const channelInfo = getChannelInfo(params, channelName, channel);
  
  // For consumers, convert path parameters to wildcards in subscribe channel
  if (channelInfo.hasParams) {
    const wildcardChannel = channelName.replace(/\{[^}]+\}/g, '*');
    channelInfo.subscribeChannel = wildcardChannel;
    logger.debug(`functionUtils.js: getChannelInfoForConsumer() - Converted subscribe channel to wildcard: ${channelInfo.subscribeChannel}`);
  }
  
  return channelInfo;
}

/**
 * Get subscribe channel name
 */
function getSubscribeChannel(channelInfo) {
  logger.debug(`functionUtils.js: getSubscribeChannel() - Getting subscribe channel`);
  
  return channelInfo.subscribeChannel || channelInfo.channelName;
}

/**
 * Get publish channel name
 */
function getPublishChannel(channelInfo) {
  logger.debug(`functionUtils.js: getPublishChannel() - Getting publish channel`);
  
  return channelInfo.publishChannel || channelInfo.channelName;
}

/**
 * Consolidate supplier functions with same payload type
 */
function consolidateSupplierFunctions(functions) {
  logger.debug(`functionUtils.js: consolidateSupplierFunctions() - Consolidating supplier functions`);
  
  const queueDestinationMap = new Map();
  const consolidatedFunctions = [];
  
  functions.forEach(func => {
    if (func.type === 'supplier' && func.publishChannel) {
      // Extract queue destination from publish channel or binding
      let queueDestination = func.publishChannel;
      
      // If it's a queue-based supplier, extract queue name from bindings
      if (func.isQueueWithSubscription && func.additionalSubscriptions && func.additionalSubscriptions.length > 0) {
        // For queue-based suppliers, use the queue name from the binding
        // This should be extracted from the AsyncAPI solace binding queue name
        if (func.queueName) {
          queueDestination = func.queueName;
        }
      }
      
      if (queueDestinationMap.has(queueDestination)) {
        // Merge with existing supplier of same queue destination
        const existing = queueDestinationMap.get(queueDestination);
        logger.debug(`functionUtils.js: consolidateSupplierFunctions() - Merging supplier ${func.name} with existing ${existing.name} for queue destination ${queueDestination}`);
        
        // Add message name to existing function's message names
        if (!existing.messageNames) {
          existing.messageNames = [existing.messageName];
        }
        if (func.messageName && !existing.messageNames.includes(func.messageName)) {
          existing.messageNames.push(func.messageName);
        }
        
        // Set multiple messages flag
        existing.multipleMessages = existing.messageNames.length > 1;
        existing.setMultipleMessages(true);
        
        // Update payload to handle multiple message types
        existing.setPublishPayload('Message<?>');
        
        // Add multiple message comment
        const comment = `// The message can be of type: ${existing.messageNames.join(', ')}`;
        existing.setMultipleMessageComment(comment);
        
        logger.debug(`functionUtils.js: consolidateSupplierFunctions() - Consolidated suppliers for ${queueDestination}: ${existing.messageNames.join(', ')}`);
        // DO NOT add the current function to consolidatedFunctions - it's already merged with existing
      } else {
        // First supplier of this queue destination
        queueDestinationMap.set(queueDestination, func);
        if (func.messageName) {
          func.messageNames = [func.messageName];
        }
        consolidatedFunctions.push(func);
      }
    } else {
      consolidatedFunctions.push(func);
    }
  });
  
  logger.debug(`functionUtils.js: consolidateSupplierFunctions() - Consolidated ${functions.length} functions to ${consolidatedFunctions.length}`);
  return consolidatedFunctions;
}

/**
 * Consolidate queue functions (for Solace)
 */
function consolidateQueueFunctions(functions) {
  logger.debug(`functionUtils.js: consolidateQueueFunctions() - Consolidating queue functions`);
  
  // First consolidate suppliers by queue destination
  let consolidatedFunctions = consolidateSupplierFunctions(functions);
  
  // Then consolidate consumers by payload type
  consolidatedFunctions = consolidateConsumerFunctions(consolidatedFunctions);
  
  const queueMap = new Map();
  const finalConsolidatedFunctions = [];
  
  consolidatedFunctions.forEach(func => {
    if (func.isQueueWithSubscription && func.additionalSubscriptions) {
      const queueKey = func.name;
      
      if (queueMap.has(queueKey)) {
        // Merge subscriptions
        const existing = queueMap.get(queueKey);
        func.additionalSubscriptions.forEach(sub => {
          if (!existing.additionalSubscriptions.includes(sub)) {
            existing.additionalSubscriptions.push(sub);
          }
        });
        existing.multipleMessages = existing.additionalSubscriptions.length > 1;
      } else {
        queueMap.set(queueKey, func);
        finalConsolidatedFunctions.push(func);
      }
    } else {
      finalConsolidatedFunctions.push(func);
    }
  });
  
  logger.debug(`functionUtils.js: consolidateQueueFunctions() - Final consolidation: ${functions.length} functions to ${finalConsolidatedFunctions.length}`);
  return finalConsolidatedFunctions;
}

/**
 * Sort parameters using channel name
 */
function sortParametersUsingChannelName(parameters, channelName) {
  logger.debug(`functionUtils.js: sortParametersUsingChannelName() - Sorting parameters for channel: ${channelName}`);
  
  if (!parameters || parameters.length === 0) {
    return parameters;
  }
  
  // Extract parameter names from channel name in order
  const paramMatches = channelName.match(/\{([^}]+)\}/g);
  if (!paramMatches) {
    return parameters;
  }
  
  const paramOrder = paramMatches.map(match => match.replace(/[{}]/g, ''));
  
  // Sort parameters based on their order in the channel name
  return parameters.sort((a, b) => {
    const aIndex = paramOrder.indexOf(a.name);
    const bIndex = paramOrder.indexOf(b.name);
    
    if (aIndex === -1 && bIndex === -1) return 0;
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    
    return aIndex - bIndex;
  });
}

/**
 * Get message name from operation
 */
function getMessageName(operation) {
  logger.debug(`functionUtils.js: getMessageName() - Getting message name from operation`);
  
  if (!operation) {
    logger.warn('getMessageName: operation is null or undefined');
    return 'Object';
  }
  
  try {
    const messages = operation.messages();
    if (!messages || typeof messages.values !== 'function') {
      return 'Object';
    }
  
    const messageArray = Array.from(messages.values());
    if (messageArray.length === 0) {
      return 'Object';
    }
    
    // For multiple messages (oneOf, anyOf, allOf), return the first schema name
    if (messageArray.length > 1) {
      logger.debug(`functionUtils.js: getMessageName() - Multiple messages found: ${messageArray.length}`);
      // Get the first message and extract its schema name
      const firstMessage = messageArray[0];
      const schemaName = extractSchemaNameFromMessage(firstMessage);
      if (schemaName) {
        logger.debug(`functionUtils.js: getMessageName() - Using first schema name: ${schemaName}`);
        return schemaName;
      }
    }
    
    // For single message, extract schema name
    const message = messageArray[0];
    const schemaName = extractSchemaNameFromMessage(message);
    if (schemaName) {
      logger.debug(`functionUtils.js: getMessageName() - Extracted schema name: ${schemaName}`);
      return schemaName;
    }
    
    logger.warn('getMessageName: Could not extract schema name, using fallback');
    return 'Object';
  } catch (error) {
    logger.warn(`getMessageName: Error getting message name: ${error.message}`);
    return 'Object';
  }
}

/**
 * Extract schema name from message
 */
function extractSchemaNameFromMessage(message) {
  logger.debug(`functionUtils.js: extractSchemaNameFromMessage() - Extracting schema name from message`);
  try {
    // Helper function to extract name from ref
    const extractNameFromRef = (ref) => {
      if (!ref) return null;
      const refParts = ref.split('/');
      return refParts.length > 0 ? refParts[refParts.length - 1] : null;
    };

    // Helper function to get message property safely
    const getMessageProperty = (message, propName) => {
      if (message[propName] && typeof message[propName] === 'function') {
        return message[propName]();
      }
      return null;
    };

    const messageName = message.extensions && message.extensions().get('x-parser-message-name')?.value();
    if (messageName) {
      logger.debug(`functionUtils.js: extractSchemaNameFromMessage() - Extracted from message extensions: ${messageName}`);
      return messageName;
    }

    // 1. Try message $ref first
    const messageRef = getMessageProperty(message, 'ref');
    if (messageRef) {
      const messageName = extractNameFromRef(messageRef);
      if (messageName && messageName.endsWith('Message')) {
        const schemaName = messageName.replace('Message', '');
        logger.debug(`functionUtils.js: extractSchemaNameFromMessage() - Extracted from message ref: ${schemaName}`);
        return schemaName;
      }
    }

    // 2. Try payload $ref
    const payload = message.payload && typeof message.payload === 'function' ? message.payload() : message.payload;
    if (payload) {
      const payloadRef = getMessageProperty(payload, 'ref');
      if (payloadRef) {
        const schemaName = extractNameFromRef(payloadRef);
        if (schemaName) {
          logger.debug(`functionUtils.js: extractSchemaNameFromMessage() - Extracted from payload ref: ${schemaName}`);
          return schemaName;
        }
      }

      // 3. Try payload extensions
      if (payload.extensions) {
        const extensions = payload.extensions();
        const schemaId = extensions.get('x-parser-schema-id')?.value();
        if (schemaId && !schemaId.includes('://')) {
          logger.debug(`functionUtils.js: extractSchemaNameFromMessage() - Extracted from extensions: ${schemaId}`);
          return schemaId;
        }
      }
    }

    // 4. Fallback to message properties
    const fallbackNames = ['name', 'id'];
    for (const propName of fallbackNames) {
      const value = getMessageProperty(message, propName);
      if (value) {
        logger.debug(`functionUtils.js: extractSchemaNameFromMessage() - Fallback to message.${propName}(): ${value}`);
        return value;
      }
    }

    logger.debug(`functionUtils.js: extractSchemaNameFromMessage() - Could not extract schema name`);
    return null;
  } catch (error) {
    logger.warn(`extractSchemaNameFromMessage: Error extracting schema name: ${error.message}`);
    return null;
  }
}

/**
 * Get send function name based on message name, schema name, or channel name
 */
function getSendFunctionName(channelName, operation) {
  logger.debug(`functionUtils.js: getSendFunctionName() - Getting send function name for channel: ${channelName}`);

  // Try to get message name/id from the operation
  let messageName = null;
  if (operation && typeof operation.messages === 'function') {
    const messages = operation.messages();
    if (messages && messages.length > 0) {
      const message = messages[0];
      if (message && message.extensions && typeof message.extensions === 'function') {
        const extensions = message.extensions();
        messageName = extensions.get('x-parser-message-name')?.value();
        logger.debug(`functionUtils.js: getSendFunctionName() - Message name from extensions: ${messageName}`);
      }
    }
  }

  if (messageName) {
    // Handle anonymous message names (e.g., <anonymous-message-1>)
    if (messageName.startsWith('<') && messageName.endsWith('>')) {
      // For anonymous messages, try to get schema name from payload instead
      logger.debug(`functionUtils.js: getSendFunctionName() - Anonymous message name detected: ${messageName}, trying payload schema`);
      // Continue to the next fallback method
    } else {
      // Convert message name to PascalCase for function name
      const functionName = messageName.replace(/(^|_|\-|\s)(\w)/g, (_, __, c) => c ? c.toUpperCase() : '')
                                      .replace(/^[a-z]/, c => c.toUpperCase());
      return `send${functionName}`;
    }
  }

  // Try to get message name using getMessageName function (fallback)
  messageName = getMessageName(operation);
  logger.debug(`functionUtils.js: getSendFunctionName() - Message name from getMessageName: ${messageName}`);

  if (messageName && messageName !== 'Object') {
    // Convert message name to PascalCase for function name
    const functionName = messageName.replace(/(^|_|\-|\s)(\w)/g, (_, __, c) => c ? c.toUpperCase() : '')
                                    .replace(/^[a-z]/, c => c.toUpperCase());
    return `send${functionName}`;
  }

  // Try to get schema name from payload
  let schemaName = null;
  if (operation && typeof operation.messages === 'function') {
    const messages = operation.messages();
    if (messages && messages.length > 0) {
      const message = messages[0];
      if (message && message.payload) {
        const payload = typeof message.payload === 'function' ? message.payload() : message.payload;
        if (payload && payload.extensions && typeof payload.extensions === 'function') {
          const extensions = payload.extensions();
          schemaName = extensions.get('x-parser-schema-id')?.value();
        }
        if (!schemaName && payload && payload.ref && typeof payload.ref === 'function') {
          const payloadRef = payload.ref();
          if (payloadRef) {
            const refParts = payloadRef.split('/');
            if (refParts.length > 0) {
              schemaName = refParts[refParts.length - 1];
            }
          }
        }
      }
    }
  }
  logger.debug(`functionUtils.js: getSendFunctionName() - Schema name: ${schemaName}`);
  if (schemaName) {
    const functionName = schemaName.replace(/(^|_|\-|\s)(\w)/g, (_, __, c) => c ? c.toUpperCase() : '')
                                  .replace(/^[a-z]/, c => c.toUpperCase());
    return `send${functionName}`;
  }

  // Fallback: use channel name
  const fallbackName = channelName.replace(/[^a-zA-Z0-9]/g, ' ')
                                  .replace(/(^|_|\-|\s)(\w)/g, (_, __, c) => c ? c.toUpperCase() : '')
                                  .replace(/^[a-z]/, c => c.toUpperCase());
  return `send${fallbackName}`;
}

/**
 * Get payload class for operation
 */
function getPayloadClass(pubOrSub, processedSchemas = []) {
  logger.debug(`functionUtils.js: getPayloadClass() - Getting payload class for operation`);
  
  let ret;

  // Check for multiple messages using both methods
  if (hasMultipleMessages(pubOrSub) || (pubOrSub.hasMultipleMessages && pubOrSub.hasMultipleMessages())) {
    ret = 'Message<?>';
  } else {
    const messages = pubOrSub.messages();
    if (messages && messages.length > 0) {
      const message = messages[0];
      if (message) {
        ret = getMessagePayloadType(message, processedSchemas);
      }
    }
  }
  
  logger.debug(`functionUtils.js: getPayloadClass() - Result: ${ret}`);
  return ret;
}

// getMessagePayloadType function moved to functionUtils.js - use that instead

/**
 * Get multiple message comment
 */
function getMultipleMessageComment(pubOrSub) {
  logger.debug(`functionUtils.js: getMultipleMessageComment() - Getting comment for operation`);
  
  let ret = '';

  // We deliberately leave out the last newline, because that makes it easier to use in the template.
  // Otherwise it's really hard to get rid of an extra unwanted newline.
  const messages = pubOrSub.messages();
  if (messages && typeof messages.values === 'function' && Array.from(messages.values()).length > 1) {
    ret = '// The message can be of type:';
    if (messages) {
      messages.forEach(m => {
        ret += '\n\t// ';
        ret += getMessagePayloadType(m);
      });
    }
  }

  logger.debug(`functionUtils.js: getMultipleMessageComment() - Generated comment: ${ret}`);
  return ret;
}

/**
 * Consolidate consumer functions with same payload type
 */
function consolidateConsumerFunctions(functions) {
  logger.debug(`functionUtils.js: consolidateConsumerFunctions() - Consolidating consumer functions`);
  
  const payloadTypeMap = new Map();
  const queueMap = new Map(); // New map for queue-based consolidation
  const consolidatedFunctions = [];
  
  functions.forEach(func => {
    if (func.type === 'consumer' && func.subscribePayload) {
      logger.debug(`functionUtils.js: consolidateConsumerFunctions() - Processing consumer: ${func.name}, isQueueWithSubscription=${func.isQueueWithSubscription}, queueName=${func.queueName}, payload=${func.subscribePayload}`);
      
      // For queue-based consumers, consolidate by queue name instead of payload type
      if (func.isQueueWithSubscription && func.queueName) {
        const queueKey = func.queueName;
        
        if (queueMap.has(queueKey)) {
          // Found existing consumer with same queue - merge them
          const existing = queueMap.get(queueKey);
          logger.debug(`functionUtils.js: consolidateConsumerFunctions() - Merging queue-based consumer ${func.name} with existing ${existing.name} for queue ${queueKey}`);
          
          // Add message name to existing function's message names
          if (!existing.messageNames) {
            existing.messageNames = [existing.messageName];
          }
          if (func.messageName && !existing.messageNames.includes(func.messageName)) {
            existing.messageNames.push(func.messageName);
          }
          
          // Set multiple messages flag and use Message<?> for queue-based consumers with multiple message types
          if (existing.messageNames.length > 1) {
            existing.multipleMessages = true;
            existing.subscribePayload = 'Message<?>';
            
            // Add multiple message comment
            const comment = `// The message can be of type: ${existing.messageNames.join(', ')}`;
            existing.multipleMessageComment = comment;
          }
          
          logger.debug(`functionUtils.js: consolidateConsumerFunctions() - Consolidated queue-based consumers for ${queueKey}: ${existing.messageNames ? existing.messageNames.join(', ') : 'unknown'}`);
        } else {
          // First consumer of this queue
          queueMap.set(queueKey, func);
          consolidatedFunctions.push(func);
        }
      } else {
        // For non-queue consumers, keep them separate (no consolidation)
        logger.debug(`functionUtils.js: consolidateConsumerFunctions() - Keeping non-queue consumer separate: ${func.name}`);
        consolidatedFunctions.push(func);
      }
    } else {
      // Non-consumer functions or consumers without payload type
      consolidatedFunctions.push(func);
    }
  });
  
  logger.debug(`functionUtils.js: consolidateConsumerFunctions() - Consolidated ${functions.length} functions to ${consolidatedFunctions.length}`);
  return consolidatedFunctions;
}


/**
 * Get sample argument for parameter (matching reference project)
 */
function getSampleArg(param) {
  logger.debug(`functionUtils.js: getSampleArg() - Getting sample for parameter: ${param.name}`);
  
  if (!param || !param.type) {
    return 'null';
  }
  
  const type = param.type;
  const format = param.format;
  
  if (type === 'string') {
    if (format === 'date') {
      return '2000-12-31';
    } else if (format === 'date-time') {
      return '2000-12-31T23:59:59+01:00';
    } else if (format === 'byte') {
      return 'U3dhZ2dlciByb2Nrcw==';
    } else if (format === 'binary') {
      return 'base64-encoded file contents';
    } else {
      return '"string"';
    }
  } else if (type === 'integer') {
    if (format === 'int64') {
      return '1L';
    } else {
      return '1';
    }
  } else if (type === 'number') {
    if (format === 'float') {
      return '1.1F';
    } else if (format === 'double') {
      return '1.1';
    } else {
      return '100.1';
    }
  } else if (type === 'boolean') {
    return 'true';
  } else if (type === 'null') {
    return 'null';
  }
  
  return 'null';
}

// getMultipleMessageComment function moved to functionUtils.js - use that instead

/**
 * Get message payload type (matching reference project)
 */
function getMessagePayloadType(message) {
  logger.debug(`functionUtils.js: getMessagePayloadType() - Getting payload type for message`);
  
  let ret;
  const payload = message.payload();
  
  if (payload) {
    const type = payload.type();
    
    if (!type || type === 'object') {
      // First try to get schema ID from extensions
      ret = payload.extensions && payload.extensions().get('x-parser-schema-id')?.value();
      
      // If not found, try to get from $ref
      if (!ret && payload.ref && typeof payload.ref === 'function') {
        const ref = payload.ref();
        if (ref) {
          // Extract schema name from $ref path like "#/components/schemas/Transaction"
          const refParts = ref.split('/');
          if (refParts.length > 0) {
            ret = refParts[refParts.length - 1];
          }
        }
      }
      
      if (ret) {
        const { className } = stripPackageName(ret);
        ret = _.upperFirst(_.camelCase(className));
      }
    } else {
      const typeInfo = getEnhancedType(type, payload.format ? payload.format() : undefined);
      ret = typeInfo.javaType;
    }
  }
  
  logger.debug(`functionUtils.js: getMessagePayloadType() - Result: ${ret}`);
  return ret || 'Object';
}



module.exports = {
  hasMultipleMessages,
  getFunctionPayloadType,
  getFunctionName,
  getChannelInfo,
  getChannelInfoForConsumer,
  getSubscribeChannel,
  getPublishChannel,
  consolidateSupplierFunctions,
  consolidateQueueFunctions,
  sortParametersUsingChannelName,
  getMessageName,
  extractSchemaNameFromMessage,
  getSendFunctionName,
  getPayloadClass,
  getMessagePayloadType,
  getMultipleMessageComment,
  consolidateConsumerFunctions,
  getSampleArg
};
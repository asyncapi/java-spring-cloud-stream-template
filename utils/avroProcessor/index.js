const { logger } = require('../logger');
const { SchemaModel } = require('./avroSchemaModel');
const { 
  getEnhancedType, 
  checkPropertyNames, 
  getIdentifierName, 
  fixType,
  stripPackageName
} = require('../typeUtils');
const {
  getSampleArg,
  getMultipleMessageComment,
  getMessagePayloadType,
  getPayloadClass
} = require('../functionUtils');

const { processAvroFieldType } = require('./avroProcessor');

// Initialize schema model instance
const schemaModel = new SchemaModel();

/**
 * Detect if AsyncAPI document contains Avro schemas
 */
function detectAvroSchemas(asyncapi) {
  logger.debug('avroProcessor.js: detectAvroSchemas() - Detecting Avro schemas');
  
  // Check for Avro schemas in components.schemas
  const componentsSchemas = asyncapi.components().schemas();
  if (componentsSchemas) {
    for (const [schemaName, schema] of componentsSchemas.entries()) {
      if (isAvroSchema(schema)) {
        logger.debug(`avroProcessor: Found Avro schema: ${schemaName}`);
        return true;
      }
    }
  }
  
  // Check for Avro schemas in messages
  const channels = asyncapi.channels();
  for (const channel of channels.values()) {
    const channelName = channel.id();
    // Get all operations for this channel
    const operations = channel.operations && typeof channel.operations === 'function'
      ? Array.from(channel.operations().values())
      : [];

    // Find publish and subscribe operations
    const publishOperation = operations.find(op => op.action && op.action() === 'publish');
    const subscribeOperation = operations.find(op => op.action && op.action() === 'subscribe');
    
    if (publishOperation) {
      const messages = publishOperation.messages();
      if (messages && messages.length > 0) {
        const message = messages[0];
        if (message && isAvroMessage(message)) {
          logger.debug(`avroProcessor: Found Avro message in publish channel: ${channelName}`);
          return true;
        }
      }
    }
    
    if (subscribeOperation) {
      const messages = subscribeOperation.messages();
      if (messages && messages.length > 0) {
        const message = messages[0];
        if (message && isAvroMessage(message)) {
          logger.debug(`avroProcessor: Found Avro message in subscribe channel: ${channelName}`);
          return true;
        }
      }
    }
  }
  
  return false;
}

/**
 * Check if a schema is an Avro schema
 */
function isAvroSchema(schema) {
  if (!schema) return false;
  
  // Check for Avro-specific extensions
  if (schema.extensions) {
    const extensions = schema.extensions();
    if (extensions.get('x-avro-schema') || extensions.get('x-avro-namespace')) {
      return true;
    }
  }
  
  // Check for Avro namespace in schema name
  const schemaName = schema.extensions && schema.extensions().get('x-parser-schema-id')?.value() || schema.id();
  if (schemaName && schemaName.includes('.')) {
    return true;
  }
  
  return false;
}

/**
 * Check if a message is an Avro message
 */
function isAvroMessage(message) {
  if (!message) return false;
  
  const payload = message.payload();
  if (!payload) return false;
  
  return isAvroSchema(payload);
}

/**
 * Extract Avro schemas from messages using new schema model
 */
function extractAvroSchemasFromMessages(asyncapi) {
  logger.debug('avroProcessor.js: extractAvroSchemasFromMessages() - Extracting Avro schemas with new schema model');
  
  // Initialize schema model with AsyncAPI document
  schemaModel.setupSuperClassMap(asyncapi);
  schemaModel.setupModelClassMap(asyncapi);
  
  const schemas = [];
  const processedSchemaNames = new Set();
  
  // Extract schemas from components.schemas
  const componentsSchemas = asyncapi.components().schemas();
  if (componentsSchemas) {
    for (const [schemaName, schema] of componentsSchemas.entries()) {
      if (isAvroSchema(schema) && !processedSchemaNames.has(schemaName)) {
        const processedSchema = processAvroSchema(schema, schemaName);
        if (processedSchema) {
          schemas.push(processedSchema);
          processedSchemaNames.add(schemaName);
        }
      }
    }
  }
  
  // Extract schemas from messages
  const channels = asyncapi.channels();
  for (const channel of channels.values()) {
    const channelName = channel.id();
    logger.debug(`avroProcessor.js: extractAvroSchemasFromMessages() - Processing channel: ${channelName}`);
    
    // Get all operations for this channel
    const operations = channel.operations && typeof channel.operations === 'function'
      ? Array.from(channel.operations().values())
      : [];

    // Find publish and subscribe operations
    const publishOperation = operations.find(op => op.action && op.action() === 'publish');
    const subscribeOperation = operations.find(op => op.action && op.action() === 'subscribe');
    
    // Check publish messages
    if (publishOperation) {
      const messages = publishOperation.messages();
      if (messages && messages.length > 0) {
        const message = messages[0];
        if (message) {
          const payload = message.payload();
          if (payload && isAvroSchema(payload)) {
            const schemaName = payload.extensions && payload.extensions().get('x-parser-schema-id')?.value() || payload.id();
            if (schemaName && !processedSchemaNames.has(schemaName)) {
              const processedSchema = processAvroSchema(payload, schemaName);
              if (processedSchema) {
                schemas.push(processedSchema);
                processedSchemaNames.add(schemaName);
              }
            }
          }
        }
      }
    }
    
    // Check subscribe messages
    if (subscribeOperation) {
      const messages = subscribeOperation.messages();
      if (messages && messages.length > 0) {
        const message = messages[0];
        if (message) {
          const payload = message.payload();
          if (payload && isAvroSchema(payload)) {
            const schemaName = payload.extensions && payload.extensions().get('x-parser-schema-id')?.value() || payload.id();
            if (schemaName && !processedSchemaNames.has(schemaName)) {
              const processedSchema = processAvroSchema(payload, schemaName);
              if (processedSchema) {
                schemas.push(processedSchema);
                processedSchemaNames.add(schemaName);
              }
            }
          }
        }
      }
    }
  }
  
  logger.debug(`avroProcessor: Extracted ${schemas.length} Avro schemas`);
  return schemas;
}

/**
 * Process an individual Avro schema using new schema model
 */
function processAvroSchema(schema, schemaName) {
  logger.debug(`avroProcessor.js: processAvroSchema() - Processing Avro schema: ${schemaName}`);
  
  // Get model class from schema model
  const modelClass = schemaModel.getModelClass({ schema, schemaName });
  if (!modelClass) {
    logger.warn(`No model class found for Avro schema: ${schemaName}`);
    return null;
  }
  
  // Get schema for reference (handles allOf inheritance)
  const schemaForRef = schemaModel.getAnonymousSchemaForRef(schemaName);
  const actualSchema = schemaForRef || schema;
  
  // Extract namespace and class name
  const { javaPackage, className } = stripPackageName(schemaName);
  const packagePath = javaPackage ? javaPackage.replace(/\./g, '/') : null;
  const namespace = javaPackage;
  
  // Process properties
  const properties = [];
  const required = actualSchema.required && typeof actualSchema.required === 'function' ? actualSchema.required() : [];
  let schemaProperties = null;
  
  // Try multiple ways to get schema properties
  if (actualSchema.properties && typeof actualSchema.properties === 'function') {
    schemaProperties = actualSchema.properties();
  }
  
  if (schemaProperties && typeof schemaProperties.values === 'function') {
    const propertyArray = Array.from(schemaProperties.values());
    propertyArray.forEach(prop => {
      const propertyName = prop.id();
      const isRequired = Array.isArray(required) ? required.includes(propertyName) : false;
      
      // Use comprehensive Avro field processing
      const processedField = processAvroFieldType({
        name: propertyName,
        type: prop.type ? prop.type() : 'object',
        doc: prop.description ? prop.description() : '',
        logicalType: prop.logicalType ? (typeof prop.logicalType === 'function' ? prop.logicalType() : prop.logicalType) : undefined,
        items: prop.items ? prop.items() : undefined,
        additionalProperties: prop.additionalProperties ? prop.additionalProperties() : undefined,
        enum: prop.enum ? prop.enum() : undefined,
        oneOf: prop.oneOf ? (typeof prop.oneOf === 'function' ? prop.oneOf() : prop.oneOf) : undefined,
        minimum: prop.minimum ? prop.minimum() : undefined,
        maximum: prop.maximum ? prop.maximum() : undefined,
        pattern: prop.pattern ? prop.pattern() : undefined,
        fields: prop.fields ? prop.fields() : undefined
      });
      
      properties.push({
        name: propertyName,
        type: processedField, // Use the processed field object with javaType
        description: prop.description ? prop.description() : '',
        required: processedField.required,
        schemaName: prop.extensions && prop.extensions().get('x-parser-schema-id')?.value(),
        format: prop.format ? prop.format() : undefined,
        enum: processedField.enum ? processedField.enum : undefined,
        items: prop.items ? prop.items() : undefined,
        defaultValue: prop.default ? prop.default() : undefined
      });
    });
  } else if (schemaProperties && typeof schemaProperties.forEach === 'function') {
    // Try forEach method
    schemaProperties.forEach((prop, propName) => {
      const isRequired = Array.isArray(required) ? required.includes(propName) : false;
      
      // Use comprehensive Avro field processing
      const processedField = processAvroFieldType({
        name: propName,
        type: prop.type ? prop.type() : 'object',
        doc: prop.description ? prop.description() : '',
        logicalType: prop.logicalType ? (typeof prop.logicalType === 'function' ? prop.logicalType() : prop.logicalType) : undefined,
        items: prop.items ? prop.items() : undefined,
        additionalProperties: prop.additionalProperties ? prop.additionalProperties() : undefined,
        enum: prop.enum ? prop.enum() : undefined,
        oneOf: prop.oneOf ? (typeof prop.oneOf === 'function' ? prop.oneOf() : prop.oneOf) : undefined,
        minimum: prop.minimum ? prop.minimum() : undefined,
        maximum: prop.maximum ? prop.maximum() : undefined,
        pattern: prop.pattern ? prop.pattern() : undefined,
        fields: prop.fields ? prop.fields() : undefined
      });
      
      properties.push({
        name: propName,
        type: processedField, // Use the processed field object with javaType
        description: prop.description ? prop.description() : '',
        required: processedField.required,
        schemaName: prop.extensions && prop.extensions().get('x-parser-schema-id')?.value(),
        format: prop.format ? prop.format() : undefined,
        enum: processedField.enum ? processedField.enum : undefined,
        items: prop.items ? prop.items() : undefined,
        defaultValue: prop.default ? prop.default() : undefined
      });
    });
  } else if (schemaProperties && typeof schemaProperties === 'object') {
    // Handle plain object with property names as keys using Object.entries
    Object.entries(schemaProperties).forEach(([propName, prop]) => {
      const isRequired = Array.isArray(required) ? required.includes(propName) : false;
      
      // Use comprehensive Avro field processing
      const processedField = processAvroFieldType({
        name: propName,
        type: prop.type ? prop.type() : 'object',
        doc: prop.description ? prop.description() : '',
        logicalType: prop.logicalType ? (typeof prop.logicalType === 'function' ? prop.logicalType() : prop.logicalType) : undefined,
        items: prop.items ? prop.items() : undefined,
        additionalProperties: prop.additionalProperties ? prop.additionalProperties() : undefined,
        enum: prop.enum ? prop.enum() : undefined,
        oneOf: prop.oneOf ? prop.oneOf() : undefined,
        minimum: prop.minimum ? prop.minimum() : undefined,
        maximum: prop.maximum ? prop.maximum() : undefined,
        pattern: prop.pattern ? prop.pattern() : undefined,
        fields: prop.fields ? prop.fields() : undefined
      });
      
      properties.push({
        name: propName,
        type: processedField, // Use the processed field object with javaType
        description: prop.description ? prop.description() : '',
        required: processedField.required,
        schemaName: prop.extensions && prop.extensions().get('x-parser-schema-id')?.value(),
        format: prop.format ? prop.format() : undefined,
        enum: processedField.enum ? processedField.enum : undefined,
        items: prop.items ? prop.items() : undefined,
        defaultValue: prop.default ? prop.default() : undefined
      });
    });
  }
  
  // Check if this schema needs JsonProperty imports
  const needsJsonPropertyInclude = checkPropertyNames(schemaName, actualSchema);
  
  // Add inheritance info
  const extendsClass = modelClass.getSuperClassName();
  
  return {
    name: schemaName, // This is the original schema name from AsyncAPI spec
    className: className, // Use the extracted class name (not the full schema name)
    packagePath: packagePath,
    namespace: namespace,
    properties: properties,
    isAvro: true,
    isAvroSchema: true,
    needsJsonPropertyInclude: needsJsonPropertyInclude,
    extendsClass: extendsClass,
    canBeInnerClass: modelClass.canBeInnerClass(),
    modelClass: modelClass
  };
}

/**
 * Get Avro schema type using enhanced type utilities
 */
function getAvroSchemaType(schema) {
  logger.debug('avroProcessor.js: getAvroSchemaType() - Getting Avro schema type');
  
  if (!schema) return 'object';
  
  const type = schema.type ? schema.type() : null;
  const format = schema.format ? schema.format() : null;
  
  if (type === 'array') {
    const items = schema.items();
    if (items) {
      const itemType = items.type ? items.type() : null;
      if (!itemType || itemType === 'object') {
        return 'array-object';
      } else {
        return `array-${itemType}`;
      }
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
 * Convert Avro schema name to Java class name
 */
function convertAvroSchemaNameToJavaClassName(schemaName) {
  logger.debug(`avroProcessor.js: convertAvroSchemaNameToJavaClassName() - Converting: ${schemaName}`);
  
  if (!schemaName) {
    return 'UnknownSchema';
  }
  
  const { className } = stripPackageName(schemaName);
  
  // Convert to PascalCase
  const pascalCase = className.replace(/[_\s]/g, ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
  
  return pascalCase;
}

/**
 * Determine extra includes for Avro schemas
 */
function determineAvroExtraIncludes(functions, schemas) {
  logger.debug('avroProcessor.js: determineAvroExtraIncludes() - Determining extra includes for Avro schemas');
  logger.debug(`avroProcessor.js: determineAvroExtraIncludes() - Functions count: ${functions.length}`);
  logger.debug(`avroProcessor.js: determineAvroExtraIncludes() - Schemas count: ${schemas.length}`);
  
  const extraIncludes = new Set();
  
  // Get the default application package (usually com.company)
  const defaultPackage = 'com.company';
  
  // For each function, check if it uses a payload type that's in a different package
  functions.forEach((func, index) => {
    logger.debug(`avroProcessor.js: determineAvroExtraIncludes() - Function ${index}: ${func.name}, payloadType: ${func.payloadType}`);
    const payloadType = func.payloadType;
    if (payloadType && payloadType !== 'Message<?>' && payloadType !== 'Object') {
      // Find the schema that corresponds to this payload type
      const schema = schemas.find(s => {
        const match1 = s.className === payloadType;
        const match2 = stripPackageName(s.name) === payloadType;
        logger.debug(`avroProcessor.js: determineAvroExtraIncludes() - Checking schema ${s.name}: className=${s.className}, match1=${match1}, match2=${match2}`);
        return match1 || match2;
      });
      if (schema) {
        logger.debug(`avroProcessor.js: determineAvroExtraIncludes() - Found matching schema: ${schema.name}`);
        // Extract namespace from schema name (e.g., "userpublisher.User" -> "userpublisher")
        const schemaName = schema.name;
        const lastDotIndex = schemaName.lastIndexOf('.');
        if (lastDotIndex > 0) {
          const namespace = schemaName.substring(0, lastDotIndex);
          const className = schemaName.substring(lastDotIndex + 1);
          
          logger.debug(`avroProcessor.js: determineAvroExtraIncludes() - Extracted namespace: ${namespace}, className: ${className}`);
          // If the namespace is different from the default package, add import
          if (namespace !== defaultPackage) {
            const importStatement = `${namespace}.${className}`;
            extraIncludes.add(importStatement);
            logger.debug(`avroProcessor.js: determineAvroExtraIncludes() - Added import: ${importStatement}`);
          } else {
            logger.debug(`avroProcessor.js: determineAvroExtraIncludes() - Namespace ${namespace} matches default package ${defaultPackage}, skipping import`);
          }
        } else {
          logger.debug(`avroProcessor.js: determineAvroExtraIncludes() - No namespace found in schema name: ${schemaName}`);
        }
      } else {
        logger.debug(`avroProcessor.js: determineAvroExtraIncludes() - No matching schema found for payloadType: ${payloadType}`);
      }
    }
  });
  
  logger.debug(`avroProcessor.js: determineAvroExtraIncludes() - Final extraIncludes: ${Array.from(extraIncludes)}`);
  return Array.from(extraIncludes);
}

/**
 * Determine imports for Avro schemas
 */
function determineAvroImports(functions, schemas) {
  logger.debug('avroProcessor.js: determineAvroImports() - Determining imports for Avro schemas');
  
  // For now, return empty array as imports are handled via extraIncludes
  return [];
}

/**
 * Main entry point for Avro processor - matches interface expected by asyncApiProcessor
 */
function processAsyncApi(asyncapi, params) {
  logger.debug('avroProcessor.js: processAsyncApi() - Starting Avro processing');
  
  // Initialize schema model with AsyncAPI document
  schemaModel.setupSuperClassMap(asyncapi);
  schemaModel.setupModelClassMap(asyncapi);
  
  const schemas = extractAvroSchemasFromMessages(asyncapi);
  
  // Import and use the core processor's function extraction
  const coreProcessor = require('../coreProcessor');
  const functions = coreProcessor.extractFunctions(asyncapi, params, schemas);
  
  const extraIncludes = determineAvroExtraIncludes(functions, schemas);
  const imports = determineAvroImports(functions, schemas);
  const appProperties = {}; // Avro processor doesn't generate app properties

  return {
    schemas,
    functions,
    extraIncludes,
    imports,
    appProperties
  };
}

module.exports = {
  detectAvroSchemas,
  extractAvroSchemasFromMessages,
  getAvroSchemaType,
  convertAvroSchemaNameToJavaClassName,
  isAvroSchema,
  isAvroMessage,
  processAsyncApi
}; 
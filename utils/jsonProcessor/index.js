const { logger } = require('../logger');
const { SchemaModel } = require('./jsonSchemaModel');
const {
  checkPropertyNames
} = require('../typeUtils');
const {
  stripPackageName
} = require('../functionUtils');
const {
  getChannelOperations,
  getSchemaType,
  createProcessorResult,
  initializeSchemaModel,
  extractFunctionsFromCore
} = require('../processorUtils');

// Initialize schema model instance
const schemaModel = new SchemaModel();

/**
 * Enhanced type mapping for Java types (matching reference project)
 */
const stringMap = new Map();
stringMap.set('date', {javaType: 'java.time.LocalDate', printFormat: '%s', sample: '2000-12-31'});
stringMap.set('date-time', {javaType: 'java.time.OffsetDateTime', printFormat: '%s', sample: '2000-12-31T23:59:59+01:00'});
stringMap.set('byte', {javaType: 'byte[]', printFormat: '%s', sample: 'U3dhZ2dlciByb2Nrcw=='});
stringMap.set('binary', {javaType: 'byte[]', printFormat: '%s', sample: 'base64-encoded file contents'});
stringMap.set(undefined, {javaType: 'String', printFormat: '%s', sample: '"string"'});

const integerMap = new Map();
integerMap.set('int32', {javaType: 'Integer', printFormat: '%d', sample: '1'});
integerMap.set('int64', {javaType: 'Long', printFormat: '%d', sample: '1L'});
integerMap.set(undefined, {javaType: 'Integer', printFormat: '%d', sample: '1'});

const numberMap = new Map();
numberMap.set('float', {javaType: 'Float', printFormat: '%f', sample: '1.1F'});
numberMap.set('double', {javaType: 'Double', printFormat: '%f', sample: '1.1'});
numberMap.set(undefined, {javaType: 'java.math.BigDecimal', printFormat: '%s', sample: '100.1'});

const booleanMap = new Map();
booleanMap.set(undefined, {javaType: 'Boolean', printFormat: '%s', sample: 'true'});

const nullMap = new Map();
nullMap.set(undefined, {javaType: 'String', printFormat: '%s', sample: 'null'});

const typeMap = new Map();
typeMap.set('boolean', booleanMap);
typeMap.set('integer', integerMap);
typeMap.set('null', nullMap);
typeMap.set('number', numberMap);
typeMap.set('string', stringMap);

/**
 * Map schema ID to component name for inline schemas
 * This handles cases like http://example.com/root.json -> RideReceipt
 */
function _mapSchemaIdToComponentName(schemaId, asyncapi) {
  logger.debug(`🔍 DEBUG: mapSchemaIdToComponentName called with schemaId: ${schemaId}`);
  
  if (!schemaId || !schemaId.startsWith('http://')) {
    logger.debug(`❌ DEBUG: schemaId ${schemaId} is not a valid URI ID`);
    return null;
  }
  
  // Check if this URI ID matches any component schema
  // The AsyncAPI library sometimes returns numeric keys instead of component names
  // So we need to access the original component names from the _json structure
  const componentsSchemas = asyncapi.components().schemas();
  logger.debug(`🔍 DEBUG: componentsSchemas type: ${typeof componentsSchemas}, forEach: ${typeof componentsSchemas?.forEach}`);
  
  if (componentsSchemas) {
    if (typeof componentsSchemas.forEach === 'function') {
      let foundComponentName = null;
      componentsSchemas.forEach((schema, componentName) => {
        // Check if this component schema has the same URI ID
        const schemaJsonId = schema._json && schema._json.$id;
        logger.debug(`🔍 DEBUG: Component ${componentName} has $id: ${schemaJsonId}`);
        if (schemaJsonId === schemaId) {
          foundComponentName = componentName;
          logger.debug(`✅ DEBUG: Found match! ${schemaId} -> ${componentName}`);
        }
      });
      if (foundComponentName) {
        logger.debug(`jsonProcessor: Mapped schema ID ${schemaId} to component name ${foundComponentName}`);
        return foundComponentName;
      }
    }
  }
  
  // If the library returned numeric keys, try to get the actual component names from _json
  if (asyncapi._json && asyncapi._json.components && asyncapi._json.components.schemas) {
    logger.debug('🔍 DEBUG: Trying to find component name from _json structure');
    let foundComponentName = null;
    Object.keys(asyncapi._json.components.schemas).forEach(componentName => {
      const schema = asyncapi._json.components.schemas[componentName];
      const schemaJsonId = schema.$id;
      logger.debug(`🔍 DEBUG: Component ${componentName} has $id: ${schemaJsonId}`);
      if (schemaJsonId === schemaId) {
        logger.debug(`✅ DEBUG: Found match in _json! ${schemaId} -> ${componentName}`);
        foundComponentName = componentName;
      }
    });
    if (foundComponentName) {
      logger.debug(`jsonProcessor: Mapped schema ID ${schemaId} to component name ${foundComponentName}`);
      return foundComponentName;
    }
  }
  
  logger.debug(`❌ DEBUG: No mapping found for schema ID ${schemaId}`);
  return null;
}

function isBasicTypeSchema(schema, schemaName) {
  // Check if schema is a basic primitive type
  const schemaType = schema.type ? schema.type() : null;
  const schemaJson = schema._json || {};
  
  // 0. Check for inheritance schemas (allOf, anyOf, oneOf) - these are NOT basic types
  if (schemaJson.allOf || schemaJson.anyOf || schemaJson.oneOf) {
    logger.debug(`[isBasicTypeSchema] ${schemaName}: Inheritance schema (allOf/anyOf/oneOf) - NOT basic type`);
    return false;
  }
  
  // 0.5. ENHANCED: Filter out anonymous schemas that are not referenced
  const schemaId = schema.id && typeof schema.id === 'function' ? schema.id() : null;
  const isAnonymousSchema = schemaId && schemaId.startsWith('<anonymous-schema-');
  if (isAnonymousSchema) {
    // For anonymous schemas, be more aggressive in filtering
    // Only keep if they are complex types (object/array) AND not basic
    const isComplexType = schemaType === 'object' || schemaType === 'array';
    if (!isComplexType) {
      logger.debug(`[isBasicTypeSchema] ${schemaName}: Anonymous schema (${schemaId}) - basic type, filtering out`);
      return true;
    }
  }
  
  // 1. Check for primitive types
  if (schemaType && ['string', 'number', 'integer', 'boolean'].includes(schemaType)) {
    // Additional check: if it has no complex properties, it's definitely basic
    const hasProperties = schema.properties && schema.properties();
    const hasComplexProperties = hasProperties && Object.keys(hasProperties).length > 0;
    
    if (!hasComplexProperties) {
      logger.debug(`[isBasicTypeSchema] ${schemaName}: Basic primitive type (${schemaType})`);
      return true;
    }
  }
  
  // 2. Check for simple string types with only basic attributes
  if (schemaType === 'string') {
    const hasOnlyBasicAttributes = !schemaJson.properties || Object.keys(schemaJson.properties).length === 0;
    const hasOnlyStringAttributes = schemaJson.properties && 
      Object.values(schemaJson.properties).every(prop => 
        prop.type === 'string' || prop.type === 'number' || prop.type === 'integer' || prop.type === 'boolean'
      );
    
    if (hasOnlyBasicAttributes || hasOnlyStringAttributes) {
      logger.debug(`[isBasicTypeSchema] ${schemaName}: Simple string type with basic attributes`);
      return true;
    }
  }
  
  // 3. Check for schemas that are just aliases or simple types
  const hasComplexStructure = schemaJson.properties && Object.keys(schemaJson.properties).length > 0;
  const hasRequiredFields = schemaJson.required && schemaJson.required.length > 0;
  const hasComplexNestedTypes = schemaJson.properties && 
    Object.values(schemaJson.properties).some(prop => 
      prop.type === 'object' || prop.type === 'array' || (prop.$ref && prop.$ref.includes('#'))
    );
  
  // If it's a simple type with no complex structure, it's basic
  if (!hasComplexStructure && !hasRequiredFields && !hasComplexNestedTypes) {
    logger.debug(`[isBasicTypeSchema] ${schemaName}: Simple type with no complex structure`);
    return true;
  }
  
  return false;
}

/**
 * Enhanced schema collection that includes inline schemas from channel operations
 */
function collectAllSchemas(asyncapi) {
  logger.debug('jsonProcessor: collectAllSchemas() - Starting schema collection');
  // --- BEGIN: schema-extractor.js methodology ---
  const allSchemas = new Map();
  const schemaMetadata = new Map(); // Track metadata for filtering

  // 1. Collect from components.schemas (prefer these names)
  const componentsSchemas = asyncapi.components().schemas();
  logger.debug(`jsonProcessor: collectAllSchemas() - components.schemas() returned ${componentsSchemas ? 'object' : 'null'}`);
  if (componentsSchemas && typeof componentsSchemas.forEach === 'function') {
    componentsSchemas.forEach((schema, componentName) => {
      logger.debug(`jsonProcessor: collectAllSchemas() - Processing component schema: ${componentName}`);
      // The AsyncAPI library sometimes returns numeric keys instead of original component names
      // We need to map them back to the original names using the _json structure
      let originalComponentName = componentName;
      const schemaId = schema.id && typeof schema.id === 'function' ? schema.id() : null;
      
      if (asyncapi._json && asyncapi._json.components && asyncapi._json.components.schemas) {
        // FIXED: Prioritize x-ep-schema-name first, then fall back to ID-based mapping
        const schemaNameFromExtensions = schema.extensions().get('x-ep-schema-name')?.value();
        
        if (schemaNameFromExtensions) {
          // If we have x-ep-schema-name, use it directly
          originalComponentName = schemaNameFromExtensions;
          logger.debug(`jsonProcessor: collectAllSchemas() - Using x-ep-schema-name: ${originalComponentName}`);
        } else {
          // Fall back to ID-based mapping for backward compatibility
          Object.keys(asyncapi._json.components.schemas).forEach(jsonKey => {
            const jsonSchema = asyncapi._json.components.schemas[jsonKey];
            if (jsonSchema.$id === schemaId || jsonSchema['x-parser-schema-id'] === schemaId) {
              originalComponentName = jsonKey;
              logger.debug(`jsonProcessor: collectAllSchemas() - Mapped ${componentName} to ${originalComponentName} via ID`);
            }
          });
        }
      }
      
      // Skip basic type schemas
      if (isBasicTypeSchema(schema, originalComponentName)) {
        logger.debug(`[collectAllSchemas] Skipping basic type schema: ${originalComponentName}`);
        return;
      }
      
      allSchemas.set(originalComponentName, schema);
      // Mark as standalone schema from components
      schemaMetadata.set(originalComponentName, {
        source: 'components.schemas',
        name: originalComponentName,
        isNested: false,
        isStandalone: true,
        isBasicType: false,
        pointer: null
      });
      logger.debug(`jsonProcessor: collectAllSchemas() - Added component schema: ${originalComponentName}`);
    });
  }

  // 2. Collect from allSchemas().all() (may have numeric keys, $id URIs)
  const allSchemasResult = asyncapi.allSchemas().all();
  if (allSchemasResult) {
    allSchemasResult.forEach((schema, schemaKey) => {
      let schemaName;
      const schemaId = schema.id && typeof schema.id === 'function' ? schema.id() : null;
      
      logger.debug(`[collectAllSchemas] allSchemas().all() - Processing schemaKey: ${schemaKey}, schemaId: ${schemaId}`);
      
      if (typeof schemaKey === 'string') {
        schemaName = schemaKey;
      } else {
        // FIXED: Prioritize x-ep-schema-name first for numeric keys
        const schemaNameFromExtensions = schema.extensions().get('x-ep-schema-name')?.value();
        
        if (schemaNameFromExtensions) {
          // If we have x-ep-schema-name, use it directly
          schemaName = schemaNameFromExtensions;
          logger.debug(`[collectAllSchemas] Using x-ep-schema-name for numeric key ${schemaKey}: ${schemaName}`);
        } else {
          // Fall back to ID-based mapping for backward compatibility
          if (asyncapi._json && asyncapi._json.components && asyncapi._json.components.schemas) {
            Object.keys(asyncapi._json.components.schemas).forEach(jsonKey => {
              const jsonSchema = asyncapi._json.components.schemas[jsonKey];
              if (jsonSchema.$id === schemaId) {
                schemaName = jsonKey;
                logger.debug(`[collectAllSchemas] Mapped numeric key ${schemaKey} to component name: ${schemaName} via $id`);
              }
            });
          }
          
          // Final fallback to extensions or ID if no mapping found
          if (!schemaName) {
            schemaName = schema.extensions().get('x-parser-schema-id')?.value() || schemaId;
            logger.debug(`[collectAllSchemas] Using final fallback for numeric key ${schemaKey}: ${schemaName}`);
          }
        }
      }
      
      // Map $id URI to component name if possible
      const schemaJsonId = schema._json && schema._json.$id;
      if (schemaJsonId && schemaJsonId.startsWith('http://')) {
        // Try to map to a component name
        if (asyncapi._json && asyncapi._json.components && asyncapi._json.components.schemas) {
          for (const [compName, compSchema] of Object.entries(asyncapi._json.components.schemas)) {
            if (compSchema.$id === schemaJsonId) {
              schemaName = compName;
              break;
            }
          }
        }
      }
      
      if (schemaName && !allSchemas.has(schemaName)) {
        // Skip basic type schemas
        if (isBasicTypeSchema(schema, schemaName)) {
          logger.debug(`[collectAllSchemas] Skipping basic type schema: ${schemaName}`);
          return;
        }
        
        // Skip schemas with numeric names (0, 1) as they are duplicates of component schemas
        if (typeof schemaName === 'string' && (/^\d+$/).test(schemaName)) {
          logger.debug(`[collectAllSchemas] Skipping numeric schema name: ${schemaName} (duplicate of component schema)`);
          return;
        }
      
        // ENHANCED: Skip anonymous schemas that are not referenced in message payloads
        const isAnonymousSchema = schemaId && schemaId.startsWith('<anonymous-schema-');
        if (isAnonymousSchema) {
        // For anonymous schemas, be very aggressive - only keep if they are explicitly referenced
        // Most anonymous schemas are internal implementation details and should not be generated
          logger.debug(`[collectAllSchemas] Skipping anonymous schema: ${schemaName} (${schemaId}) - not explicitly referenced`);
          return;
        }
        
        // Get schema pointer to determine if nested
        const meta = schema.meta();
        const pointer = meta ? meta.pointer : null;
        const isNested = pointer && pointer.includes('/properties/');
        
        allSchemas.set(schemaName, schema);
        schemaMetadata.set(schemaName, {
          source: 'allSchemas',
          isNested,
          isStandalone: !isNested,
          isBasicType: false,
          pointer
        });
      }
    });
  }

  // 3. Collect inline schemas from channel operations (if any) using shared utility
  const channels = asyncapi.channels();
  if (channels && typeof channels.forEach === 'function') {
    channels.forEach((channel) => {
      const operations = getChannelOperations(channel);
      operations.forEach(operation => {
        const messages = operation.messages && typeof operation.messages === 'function'
          ? Array.from(operation.messages().values())
          : [];
        messages.forEach(message => {
          const payload = message.payload();
          if (payload && payload._json && payload._json.$id) {
            let inlineName = null;
            // Try to map $id to component name
            if (asyncapi._json && asyncapi._json.components && asyncapi._json.components.schemas) {
              for (const [compName, compSchema] of Object.entries(asyncapi._json.components.schemas)) {
                if (compSchema.$id === payload._json.$id) {
                  inlineName = compName;
                  break;
                }
              }
            }
            if (!inlineName) {
              inlineName = payload._json.title || payload._json.$id;
            }
            if (inlineName && !allSchemas.has(inlineName)) {
              // Skip basic type schemas
              if (isBasicTypeSchema(payload, inlineName)) {
                logger.debug(`[collectAllSchemas] Skipping basic type schema: ${inlineName}`);
                return;
              }

              // Get schema pointer to determine if nested
              const meta = payload.meta();
              const pointer = meta ? meta.pointer : null;
              const isNested = pointer && pointer.includes('/properties/');

              allSchemas.set(inlineName, payload);
              schemaMetadata.set(inlineName, {
                source: 'inline',
                isNested,
                isStandalone: !isNested,
                isBasicType: false,
                pointer
              });
            }
          }
        });
      });
    });
  }

  // 4. Filter out nested schemas (but keep component schemas)
  const filteredSchemas = new Map();
  const filteredMetadata = new Map();
  
  allSchemas.forEach((schema, schemaName) => {
    const metadata = schemaMetadata.get(schemaName);
    
    // Always keep component schemas, even if they're also found as nested
    if (metadata && metadata.source === 'components.schemas') {
      filteredSchemas.set(schemaName, schema);
      filteredMetadata.set(schemaName, metadata);
      logger.debug(`[collectAllSchemas] Keeping component schema: ${schemaName} (${metadata.pointer})`);
    } else if (metadata && !metadata.isNested) {
      filteredSchemas.set(schemaName, schema);
      filteredMetadata.set(schemaName, metadata);
    } else if (metadata && metadata.isNested) {
      logger.debug(`[collectAllSchemas] Filtering out nested schema: ${schemaName} (${metadata.pointer})`);
    }
  });

  // 5. Log summary
  logger.debug('[collectAllSchemas] Schema collection summary:');
  logger.debug(`  • Total schemas found: ${allSchemas.size}`);
  logger.debug(`  • Basic type schemas filtered: ${allSchemas.size - filteredSchemas.size}`);
  logger.debug(`  • Schemas for generation: ${filteredSchemas.size}`);
  
  filteredSchemas.forEach((schema, schemaName) => {
    const metadata = filteredMetadata.get(schemaName);
    logger.debug(`  • ${schemaName} (${metadata.source})`);
  });

  return filteredSchemas;
}

/**
 * Detect if AsyncAPI document contains JSON schemas
 */
function detectJsonSchemas(asyncapi) {
  logger.debug('jsonProcessor.js: detectJsonSchemas() - Detecting JSON schemas');
  const componentsSchemas = asyncapi.components().schemas();
  return componentsSchemas && 
         ((typeof componentsSchemas.size === 'number' && componentsSchemas.size > 0) || 
          (typeof componentsSchemas === 'object' && Object.keys(componentsSchemas).length > 0));
}

/**
 * Process JSON schemas from components.schemas using new schema model
 */
function processJsonSchemas(asyncapi, avroSchemaNames = new Set(), avroClassNames = new Set()) {
  logger.debug('jsonProcessor.js: processJsonSchemas() - Processing JSON schemas with new schema model');
  
  // Initialize schema model with AsyncAPI document
  const schemaModel = new SchemaModel(asyncapi, avroSchemaNames);
  schemaModel.setupSuperClassMap(asyncapi);
  schemaModel.setupModelClassMap(asyncapi);
  
  const schemas = [];
  
  // Use enhanced schema collection
  logger.debug('🔍 DEBUG: About to call collectAllSchemas');
  let allSchemas;
  try {
    allSchemas = collectAllSchemas(asyncapi);
    logger.debug(`🔍 DEBUG: collectAllSchemas returned ${allSchemas ? allSchemas.size : 'null'} schemas`);
  } catch (error) {
    logger.debug(`🔍 DEBUG: collectAllSchemas threw error: ${error.message}`);
    logger.debug(`🔍 DEBUG: Error stack: ${error.stack}`);
    allSchemas = new Map();
  }
  if (!allSchemas || allSchemas.size === 0) {
    return schemas;
  }

  // Remove channel parameter filtering logic

  // First pass: collect all schemas and their relationships
  const schemaMap = new Map();
  const parentChildMap = new Map();
  
  allSchemas.forEach((schema, schemaName) => {
    logger.debug(`jsonProcessor: Processing schema - key: ${schemaName}, type: ${typeof schemaName}`);
    
    // Skip if this schema is already processed as an Avro schema
    if (avroSchemaNames.has(schemaName)) {
      logger.debug(`Skipping schema ${schemaName} as it's already processed as an Avro schema`);
      return;
    }
    
    // Skip if this schema's class name is already processed as an Avro schema
    const className = schemaName.split('/').pop().replace('.schema.json', '');
    if (avroClassNames.has(className)) {
      logger.debug(`Skipping schema ${schemaName} as its class name ${className} is already processed as an Avro schema`);
      return;
    }
    
    schemaMap.set(schemaName, { schema, schemaName });
    logger.debug(`jsonProcessor: Added schema to map: ${schemaName}`);
    
    // Check for inheritance relationships
    if (schema._json && schema._json.allOf && Array.isArray(schema._json.allOf) && schema._json.allOf.length >= 2) {
      const parentSchema = schema._json.allOf[0];
      const parentName = parentSchema['x-parser-schema-id'];
      if (parentName && parentName !== '<anonymous-schema-1>') {
        parentChildMap.set(schemaName, parentName);
      }
    }
  });
  
  // Second pass: process schemas ensuring parents come before children
  const processedSchemas = new Set();
  
  function processSchema(name) {
    if (processedSchemas.has(name)) {
      return;
    }
    
    const schemaInfo = schemaMap.get(name);
    if (!schemaInfo) {
      return;
    }
    
    const { schema, schemaName } = schemaInfo;
    
    // Process parent first if it exists
    const parentName = parentChildMap.get(name);
    if (parentName && !processedSchemas.has(parentName)) {
      processSchema(parentName);
    }
    
    // Get model class from schema model
    const modelClass = schemaModel.getModelClass({ schema, schemaName });
    if (!modelClass) {
      logger.warn(`No model class found for schema: ${name}`);
      processedSchemas.add(name);
      return;
    }
    
    // Handle allOf inheritance by merging properties from all schemas
    const mergedProperties = [];
    const mergedRequired = [];
    
    // Check if this schema has allOf inheritance
    // Debug: Log schema structure to understand why allOf isn't detected
    logger.debug(`jsonProcessor: Checking allOf for schema ${name}`);
    logger.debug(`jsonProcessor: schema keys: ${Object.keys(schema)}`);
    logger.debug(`jsonProcessor: schema._json exists: ${!!schema._json}`);
    if (schema._json) {
      logger.debug(`jsonProcessor: schema._json keys: ${Object.keys(schema._json)}`);
      logger.debug(`jsonProcessor: schema._json.allOf exists: ${!!schema._json.allOf}`);
    }
    
    if (schema._json && schema._json.allOf && Array.isArray(schema._json.allOf)) {
      logger.debug(`jsonProcessor: Processing allOf inheritance for schema ${name}`);
      logger.debug(`jsonProcessor: allOf array length: ${schema._json.allOf.length}`);
      logger.debug(`jsonProcessor: allOf structure: ${JSON.stringify(schema._json.allOf, null, 2)}`);
      
      // Set up inheritance relationship first
      if (schema._json.allOf.length >= 2) {
        // First schema is the parent, second schema contains additional properties
        const parentSchema = schema._json.allOf[0];
        const parentSchemaName = parentSchema['x-parser-schema-id'];
        logger.debug(`jsonProcessor: Parent schema: ${JSON.stringify(parentSchema, null, 2)}`);
        logger.debug(`jsonProcessor: Parent schema name: ${parentSchemaName}`);
        
        if (parentSchemaName && parentSchemaName !== '<anonymous-schema-1>') {
          modelClass.setSuperClassName(parentSchemaName);
          logger.debug(`jsonProcessor: ✅ Set up inheritance: ${name} extends ${parentSchemaName}`);
        } else {
          logger.debug(`jsonProcessor: ❌ Parent schema name invalid: ${parentSchemaName}`);
        }
      } else {
        logger.debug(`jsonProcessor: ❌ allOf array too short: ${schema._json.allOf.length}`);
      }
      
      // For inheritance, only include properties from additional schemas (skip the first one)
      // The first schema (index 0) is the parent, so we start from index 1
      for (let index = 1; index < schema._json.allOf.length; index++) {
        const allOfSchema = schema._json.allOf[index];
        logger.debug(`jsonProcessor: Processing additional allOf schema ${index} for ${name}`);
        logger.debug(`jsonProcessor: allOfSchema structure: ${JSON.stringify(allOfSchema, null, 2)}`);
        
        // Get properties from this additional allOf schema
        if (allOfSchema.properties) {
          logger.debug(`jsonProcessor: Found ${Object.keys(allOfSchema.properties).length} properties in allOf schema ${index}`);
          Object.entries(allOfSchema.properties).forEach(([propName, propSchema]) => {
            const propertyType = getJsonSchemaTypeFromJson(propSchema);
            const isRequired = allOfSchema.required && Array.isArray(allOfSchema.required) && allOfSchema.required.includes(propName);
            
            logger.debug(`jsonProcessor: Adding allOf property: ${propName}, type: ${propertyType}, required: ${isRequired}`);
            
            // Add validation constraints processing
            const validationConstraints = {};
            if (propSchema.minimum !== undefined) {
              validationConstraints.minimum = propSchema.minimum;
            }
            if (propSchema.maximum !== undefined) {
              validationConstraints.maximum = propSchema.maximum;
            }
            
            mergedProperties.push({
              name: propName,
              type: propertyType,
              description: propSchema.description || '',
              required: isRequired,
              schemaName: propSchema['x-parser-schema-id'],
              format: propSchema.format,
              enum: propSchema.enum,
              items: propSchema.items,
              minimum: validationConstraints.minimum,
              maximum: validationConstraints.maximum
            });
            
            if (isRequired) {
              mergedRequired.push(propName);
            }
          });
        } else {
          logger.debug(`jsonProcessor: No properties found in allOf schema ${index}`);
        }
        
        // Add required fields from this additional allOf schema
        if (allOfSchema.required && Array.isArray(allOfSchema.required)) {
          allOfSchema.required.forEach(reqField => {
            if (!mergedRequired.includes(reqField)) {
              mergedRequired.push(reqField);
            }
          });
        }
      }
    } else {
      // Regular schema without allOf - use existing logic
      const schemaForRef = schemaModel.getAnonymousSchemaForRef(name);
      const actualSchema = schemaForRef || schema;
      const required = actualSchema.required && typeof actualSchema.required === 'function' ? actualSchema.required() : [];
      let schemaProperties = null;
      
      // Use only the official AsyncAPI parser method
      if (actualSchema.properties && typeof actualSchema.properties === 'function') {
        schemaProperties = actualSchema.properties();
      }
      
      if (schemaProperties && typeof schemaProperties.values === 'function') {
        logger.debug(`jsonProcessor: Taking schemaProperties.values() path for schema ${name}`);
        const propertyArray = Array.from(schemaProperties.values());
        propertyArray.forEach(prop => {
          const propertyName = prop.id();
          const propertyType = getJsonSchemaType(prop);
          const isRequired = Array.isArray(required) ? required.includes(propertyName) : false;
          
          // Extract validation constraints from raw JSON (same approach as allOf processing)
          let minimum = undefined;
          let maximum = undefined;
          
          // Access raw JSON properties structure like allOf processing does
          if (actualSchema._json && actualSchema._json.properties && actualSchema._json.properties[propertyName]) {
            const rawPropSchema = actualSchema._json.properties[propertyName];
            logger.debug(`jsonProcessor: Raw prop schema for ${propertyName}: ${JSON.stringify(rawPropSchema, null, 2)}`);
            if (rawPropSchema.minimum !== undefined) {
              minimum = rawPropSchema.minimum;
              logger.debug(`jsonProcessor: Found minimum: ${minimum} for ${propertyName}`);
            }
            if (rawPropSchema.maximum !== undefined) {
              maximum = rawPropSchema.maximum;
              logger.debug(`jsonProcessor: Found maximum: ${maximum} for ${propertyName}`);
            }
          } else {
            logger.debug(`jsonProcessor: No raw properties found for ${propertyName} in actualSchema._json`);
            logger.debug(`jsonProcessor: actualSchema._json structure: ${JSON.stringify(actualSchema._json, null, 2)}`);
          }
          
          mergedProperties.push({
            name: propertyName,
            type: propertyType,
            description: prop.description ? prop.description() : '',
            required: isRequired,
            schemaName: prop.extensions && prop.extensions().get('x-parser-schema-id')?.value(),
            format: prop.format ? prop.format() : undefined,
            enum: prop.enum ? prop.enum() : undefined,
            items: prop.items ? prop.items() : undefined,
            minimum,
            maximum,
            // Preserve the actual schema object for nested class generation
            schema: prop,
            // Preserve items schema for array processing
            itemsSchema: prop.items ? prop.items() : undefined
          });
          
          if (isRequired) {
            mergedRequired.push(propertyName);
          }
        });
      } else if (schemaProperties && typeof schemaProperties.forEach === 'function') {
        // Try forEach method
        logger.debug(`jsonProcessor: Taking schemaProperties.forEach() path for schema ${name}`);
        schemaProperties.forEach((prop, propName) => {
          const propertyType = getJsonSchemaType(prop);
          const isRequired = Array.isArray(required) ? required.includes(propName) : false;
          mergedProperties.push({
            name: propName,
            type: propertyType,
            description: prop.description ? prop.description() : '',
            required: isRequired,
            schemaName: prop.extensions && prop.extensions().get('x-parser-schema-id')?.value(),
            format: prop.format ? prop.format() : undefined,
            enum: prop.enum ? prop.enum() : undefined,
            items: prop.items ? prop.items() : undefined,
            // Preserve the actual schema object for nested class generation
            schema: prop,
            // Preserve items schema for array processing
            itemsSchema: prop.items ? prop.items() : undefined
          });
          
          if (isRequired) {
            mergedRequired.push(propName);
          }
        });
      } else if (schemaProperties && typeof schemaProperties === 'object') {
        // Handle plain object with property names as keys using Object.entries
        logger.debug(`jsonProcessor: Taking Object.entries() path for schema ${name}`);
        Object.entries(schemaProperties).forEach(([propName, prop]) => {
          const propertyType = getJsonSchemaType(prop);
          const isRequired = Array.isArray(required) ? required.includes(propName) : false;
          
          // Extract validation constraints from raw JSON (same approach as allOf processing)
          let minimum = undefined;
          let maximum = undefined;
          
          // Access raw JSON properties structure like allOf processing does
          if (actualSchema._json && actualSchema._json.properties && actualSchema._json.properties[propName]) {
            const rawPropSchema = actualSchema._json.properties[propName];
            logger.debug(`jsonProcessor: Raw prop schema for ${propName}: ${JSON.stringify(rawPropSchema, null, 2)}`);
            if (rawPropSchema.minimum !== undefined) {
              minimum = rawPropSchema.minimum;
              logger.debug(`jsonProcessor: Found minimum: ${minimum} for ${propName}`);
            }
            if (rawPropSchema.maximum !== undefined) {
              maximum = rawPropSchema.maximum;
              logger.debug(`jsonProcessor: Found maximum: ${maximum} for ${propName}`);
            }
          } else {
            logger.debug(`jsonProcessor: No raw properties found for ${propName} in actualSchema._json`);
            logger.debug(`jsonProcessor: actualSchema._json structure: ${JSON.stringify(actualSchema._json, null, 2)}`);
          }
          
          mergedProperties.push({
            name: propName,
            type: propertyType,
            description: prop.description ? prop.description() : '',
            required: isRequired,
            schemaName: prop.extensions && prop.extensions().get('x-parser-schema-id')?.value(),
            format: prop.format ? prop.format() : undefined,
            enum: prop.enum ? prop.enum() : undefined,
            items: prop.items ? prop.items() : undefined,
            minimum,
            maximum,
            // Preserve the actual schema object for nested class generation
            schema: prop,
            // Preserve items schema for array processing
            itemsSchema: prop.items ? prop.items() : undefined
          });
          
          if (isRequired) {
            mergedRequired.push(propName);
          }
        });
      }
      
      // Handle parameter schemas with enums (schemas that have enum but no properties)
      if (mergedProperties.length === 0 && actualSchema && actualSchema.enum && typeof actualSchema.enum === 'function') {
        const enumValues = actualSchema.enum();
        if (enumValues && Array.isArray(enumValues) && enumValues.length > 0) {
          // Create a virtual property for the enum
          mergedProperties.push({
            name: 'value',
            type: 'string',
            description: 'Enum value',
            required: true,
            schemaName: actualSchema.extensions && actualSchema.extensions().get('x-parser-schema-id')?.value(),
            format: undefined,
            enum: enumValues,
            items: undefined
          });
          mergedRequired.push('value');
        }
      }
    }
    
    // Normalize className and package info
    const className = modelClass.getClassName();
    const javaPackage = modelClass.getJavaPackage();
    const packagePath = javaPackage ? javaPackage.replace(/\./g, '/') : null;
    const namespace = javaPackage;
    const properties = mergedProperties;
    const _required = mergedRequired;
    logger.debug(`jsonProcessor: Processing schema ${name} with ${properties.length} properties`);
    // Debug: Log the properties structure to see if validation constraints are included
    properties.forEach((prop, index) => {
      logger.debug(`jsonProcessor: Property ${index}: ${prop.name}, type: ${prop.type}, minimum: ${prop.minimum}, maximum: ${prop.maximum}`);
    });
    // Check if this schema needs JsonProperty imports
    const needsJsonPropertyInclude = checkPropertyNames(name, schema);
    // Add inheritance info
    const extendsClass = modelClass.getSuperClassName();
    let parentProperties = [];
    if (extendsClass) {
      // Find parent schema in schemas array
      const parentSchemaObj = schemas.find(s => s.className === extendsClass);
      if (parentSchemaObj) {
        parentProperties = parentSchemaObj.properties || [];
      }
    }
    // Get schema title if available
    const schemaTitle = schema.title && typeof schema.title === 'function' ? schema.title() : null;
    
    // Get schema ID for mapping purposes
    const schemaId = schema.extensions && schema.extensions().get('x-parser-schema-id')?.value();
    const schemaJsonId = schema._json && schema._json.$id;
    
    schemas.push({
      name, // This is the original schema name from AsyncAPI spec
      title: schemaTitle,
      className, // This is the transformed name for Java
      packagePath,
      namespace,
      properties,
      isAvro: false,
      isAvroSchema: false,
      needsJsonPropertyInclude,
      extendsClass,
      canBeInnerClass: modelClass.canBeInnerClass(),
      modelClass,
      parentProperties,
      // Add schema ID information for mapping
      id: schemaJsonId || schemaId,
      schemaId
    });
    logger.debug(`jsonProcessor: Added schema ${name} with ${properties.length} properties`);
    
    processedSchemas.add(name);
  }
  
  // Process all schemas
  for (const [name] of schemaMap) {
    processSchema(name);
  }
  
  logger.debug(`jsonProcessor: Processed ${schemas.length} JSON schemas`);
  return schemas;
}

/**
 * Get schema type from JSON object (for allOf processing)
 */
function getJsonSchemaTypeFromJson(schema) {
  logger.debug('jsonProcessor.js: getJsonSchemaTypeFromJson() - Getting schema type from JSON object');
  
  if (!schema) return 'object';
  
  const type = schema.type || null;
  const _format = schema.format || null;

  if (type === 'array') {
    const items = schema.items;
    if (items) {
      const itemType = items.type || null;
      if (!itemType || itemType === 'object') {
        return 'array';
      } 
      return `array-${itemType}`;
    }
    return 'array';
  }
  
  if (!type || type === 'object') {
    const schemaName = schema['x-parser-schema-id'];
    if (schemaName) {
      return `object-${schemaName}`;
    }
    return 'object';
  }
  
  return type;
}

/**
 * Get schema type using shared utility
 * Uses 'array' style for object arrays (JSON convention)
 */
function getJsonSchemaType(schema) {
  logger.debug('jsonProcessor.js: getJsonSchemaType() - Getting schema type using enhanced utilities');
  return getSchemaType(schema, { useArrayObject: false });
}

/**
 * Determine imports for JSON schemas
 */
function determineImports(functions, extraIncludes, processedSchemas = []) {
  logger.debug('jsonProcessor.js: determineImports() - Determining imports for JSON schemas');
  
  const imports = [];
  
  // Add imports for JSON schemas that need JsonProperty
  processedSchemas.forEach(schema => {
    if (schema.isAvro || schema.isAvroSchema) {
      return; // Skip Avro schemas
    }
    
    if (schema.needsJsonPropertyInclude) {
      imports.push('com.fasterxml.jackson.annotation.JsonProperty');
    }
  });
  
  // Remove duplicates
  return Array.from(new Set(imports));
}

/**
 * Determine schema imports
 */
function determineSchemaImports(functions) {
  logger.debug('jsonProcessor.js: determineSchemaImports() - Determining schema imports');
  
  const imports = [];
  
  functions.forEach(func => {
    if (func.publishPayload && func.publishPayload !== 'Message<?>') {
      const importName = getSchemaImport(func.publishPayload);
      if (importName) {
        imports.push(importName);
      }
    }
    
    if (func.subscribePayload && func.subscribePayload !== 'Message<?>') {
      const importName = getSchemaImport(func.subscribePayload);
      if (importName) {
        imports.push(importName);
      }
    }
  });
  
  // Remove duplicates
  return Array.from(new Set(imports));
}

/**
 * Get schema import name
 */
function getSchemaImport(schemaName) {
  logger.debug(`jsonProcessor.js: getSchemaImport() - Getting import for schema: ${schemaName}`);
  
  if (!schemaName || schemaName === 'Message<?>') {
    return null;
  }
  
  // Check if schema has a package
  const { javaPackage, className } = stripPackageName(schemaName);
  if (javaPackage) {
    return `${javaPackage}.${className}`;
  }
  
  return null;
}

/**
 * Main entry point for JSON processor - matches interface expected by asyncApiProcessor
 */
function processAsyncApi(asyncapi, params) {
  logger.debug('jsonProcessor.js: processAsyncApi() - Starting JSON processing');

  // Initialize schema model with AsyncAPI document using shared utility
  initializeSchemaModel(schemaModel, asyncapi);

  const schemas = processJsonSchemas(asyncapi);

  // Extract functions using shared utility
  const functions = extractFunctionsFromCore(asyncapi, params, schemas);

  const extraIncludes = determineImports(functions, [], schemas);
  const imports = determineSchemaImports(functions);

  // Use shared utility for consistent result structure
  return createProcessorResult(schemas, functions, extraIncludes, imports, {});
}

module.exports = {
  detectJsonSchemas,
  processJsonSchemas,
  getJsonSchemaType,
  determineImports,
  determineSchemaImports,
  getSchemaImport,
  processAsyncApi
}; 
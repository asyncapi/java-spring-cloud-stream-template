const { logger } = require('../logger');

/**
 * Extract Avro schemas from message payloads
 * Uses AsyncAPI library functions and handles both native Avro and JSON Schema representations
 */
function extractAvroSchemasFromMessages(asyncapi) {
  const schemas = [];
  
  try {
    if (!asyncapi) {
      logger.warn('extractAvroSchemasFromMessages: asyncapi parameter is null or undefined');
      return schemas;
    }
    
    const messages = asyncapi.components().messages();
    if (!messages) {
      return schemas;
    }
  
    // Simple iteration over messages
    if (typeof messages.forEach === 'function') {
      messages.forEach((message, messageName) => {
        try {
          if (!message) {
            logger.warn(`extractAvroSchemasFromMessages: message ${messageName} is null or undefined`);
            return;
          }
        
          const payload = message.payload && message.payload();
          const schemaFormat = message.schemaFormat && message.schemaFormat();
        
          // Check if this is an Avro schema
          if (payload && schemaFormat && schemaFormat.includes('avro')) {
            logger.debug(`Found Avro schema in message ${messageName}`);
            
            // Get the actual Avro schema data from the payload
            const avroData = payload._json;
            
            // Extract namespace and class name from x-parser-schema-id
            const schemaId = avroData && avroData['x-parser-schema-id'];
            if (!schemaId) {
              logger.warn(`extractAvroSchemasFromMessages: no x-parser-schema-id found in Avro schema for message ${messageName}`);
              return;
            }
            
            if (!schemaId.includes('.')) {
              logger.warn(`extractAvroSchemasFromMessages: schema ID ${schemaId} does not contain namespace separator for message ${messageName}`);
              return;
            }
            
            const lastDotIndex = schemaId.lastIndexOf('.');
            const namespace = schemaId.substring(0, lastDotIndex);
            const className = schemaId.substring(lastDotIndex + 1);
            
            if (!namespace || !className) {
              logger.warn(`extractAvroSchemasFromMessages: invalid namespace or className extracted from ${schemaId} for message ${messageName}`);
              return;
            }
            
            // Get properties from the Avro fields using robust Avro schema processing
            const properties = [];
            const required = [];
            
            // For Avro schemas, properties are in the 'fields' array (Avro style) or 'properties' (JSON Schema style)
            // Try to use AsyncAPI library functions first, then fall back to direct access
            let avroFields = null;
            let avroProperties = null;
            let avroRequired = null;
            
            // Try to get fields using AsyncAPI library functions
            if (payload.fields && typeof payload.fields === 'function') {
              avroFields = payload.fields();
            } else if (avroData && avroData.fields) {
              avroFields = avroData.fields;
            }
            
            // Try to get properties using AsyncAPI library functions
            if (payload.properties && typeof payload.properties === 'function') {
              const props = payload.properties();
              if (props && typeof props.values === 'function') {
                avroProperties = Array.from(props.values());
              }
            } else if (avroData && avroData.properties) {
              avroProperties = avroData.properties;
            }
            
            // Try to get required fields using AsyncAPI library functions
            if (payload.required && typeof payload.required === 'function') {
              avroRequired = payload.required();
            } else if (avroData && avroData.required) {
              avroRequired = avroData.required;
            }

            if (Array.isArray(avroFields)) {
              avroFields.forEach(field => {
                try {
                  if (!field || !field.name) {
                    logger.warn(`extractAvroSchemasFromMessages: field is missing or has no name in schema ${namespace}.${className}`);
                    return;
                  }
                  
                  const fieldInfo = processAvroFieldType(field);
                  
                  properties.push({
                    name: field.name,
                    type: fieldInfo.javaType,
                    description: field.doc || '',
                    required: fieldInfo.required,
                    schema: fieldInfo.schema,
                    enumClassName: fieldInfo.enumClassName,
                    enumSymbols: fieldInfo.enumSymbols
                  });
                  
                  if (fieldInfo.required) {
                    required.push(field.name);
                  }
                } catch (error) {
                  logger.debug(`Error processing field ${field?.name || 'unknown'} in schema ${namespace}.${className}:`, error.message);
                }
              });
            } else if (avroProperties && typeof avroProperties === 'object') {
              // Fallback: treat JSON Schema properties as Avro fields, recursively process
              Object.entries(avroProperties).forEach(([propName, propSchema]) => {
                try {
                  // Compose a pseudo-field for Avro logic
                  const pseudoField = {
                    name: propName,
                    ...propSchema,
                    type: propSchema.type,
                    doc: propSchema.description || '',
                  };
                  
                  // Mark as required if in required array
                  const isRequired = Array.isArray(avroRequired) ? avroRequired.includes(propName) : true;
                  
                  // Recursively process the property schema for Avro features
                  const fieldInfo = processAvroFieldType({ ...pseudoField, required: isRequired });
                  
                  properties.push({
                    name: propName,
                    type: fieldInfo.javaType,
                    description: pseudoField.doc,
                    required: isRequired,
                    schema: fieldInfo.schema,
                    enumClassName: fieldInfo.enumClassName,
                    enumSymbols: fieldInfo.enumSymbols
                  });
                  
                  if (isRequired) {
                    required.push(propName);
                  }
                } catch (error) {
                  logger.debug(`Error processing property ${propName} in schema ${namespace}.${className}:`, error.message);
                }
              });
            } else {
              logger.warn(`extractAvroSchemasFromMessages: no fields or properties found in Avro schema for message ${messageName}`);
            }
            
            // Create schema object
            const avroSchema = {
              id: () => `${namespace}.${className}`,
              extensions: () => ({
                get: (key) => {
                  if (key === 'x-ep-schema-name') {
                    return { value: () => className };
                  }
                  if (key === 'x-parser-schema-id') {
                    return { value: () => `${namespace}.${className}` };
                  }
                  return null;
                }
              }),
              _json: { 
                name: className, 
                namespace, 
                type: 'record',
                // Include processed fields with correct type information
                fields: properties.map(prop => ({
                  name: prop.name,
                  type: prop.type, // Use the processed Java type instead of simplified type
                  doc: prop.description
                }))
              },
              properties: () => {
                const propMap = new Map();
                properties.forEach(prop => {
                  propMap.set(prop.name, {
                    id: () => prop.name,
                    type: () => prop.type, // Use the processed Java type
                    description: () => prop.description,
                    required: () => prop.required,
                    _json: {
                      type: prop.type, // Use the processed Java type
                      description: prop.description
                    }
                  });
                });
                return propMap;
              },
              // Add properties array directly to schema object for template detection
              propertiesArray: properties,
              required: () => required,
              description: () => payload.description ? payload.description() : ''
            };
            
            // Process the Avro schema
            const avroInfo = extractAvroNamespaceInfo(avroSchema, `${namespace}.${className}`);
            
            // Check if a schema with this name already exists (avoid duplicates)
            const existingSchemaIndex = schemas.findIndex(s => s.name === `${namespace}.${className}`);
            if (existingSchemaIndex >= 0) {
              logger.debug(`Replacing existing schema with Avro schema: ${namespace}.${className}`);
              schemas[existingSchemaIndex] = {
                name: `${namespace}.${className}`,
                properties,
                required,
                description: payload.description ? payload.description() : '',
                extendsClass: null,
                schema: avroSchema,
                isAvro: true,
                namespace: avroInfo.namespace,
                packagePath: avroInfo.packagePath,
                className: avroInfo.className
              };
            } else {
              schemas.push({
                name: `${namespace}.${className}`,
                properties,
                required,
                description: payload.description ? payload.description() : '',
                extendsClass: null,
                schema: avroSchema,
                isAvro: true,
                namespace: avroInfo.namespace,
                packagePath: avroInfo.packagePath,
                className: avroInfo.className
              });
            }
          }
        } catch (error) {
          logger.warn(`Error processing message ${messageName}:`, error.message);
        }
      });
    }
  } catch (error) {
    logger.warn('Error extracting Avro schemas from messages:', error.message);
  }
  
  return schemas;
}

/**
 * Process Avro field type and convert to Java type with schema information
 * Handles unions, arrays, maps, enums, logical types, and nested records
 */
function processAvroFieldType(field) {
  const fieldType = field.type;
  const fieldName = field.name;

  // Handle union types (e.g., ["null", "string"] for optional fields)
  if (Array.isArray(fieldType)) {
    return processAvroUnionType(fieldType, fieldName, field);
  }
  
  // Handle oneOf structures (JSON Schema representation of Avro unions)
  // Simplify: just return Object for union types
  if (field.oneOf && Array.isArray(field.oneOf)) {
    return {
      javaType: 'Object',
      required: false, // Union types are typically optional
      schema: {
        _json: { type: 'object', description: field.doc || '' },
        type: () => 'object',
        description: () => field.doc || '',
        required: () => false
      }
    };
  }
  
  // Handle logical types (must check before other types)
  if (field.logicalType) {
    switch (field.logicalType) {
    case 'timestamp-millis':
    case 'timestamp-micros':
      return {
        javaType: 'java.time.Instant',
        required: true,
        schema: { _json: field, type: () => 'long', description: () => field.doc || '', required: () => true }
      };
    case 'decimal':
      return {
        javaType: 'java.math.BigDecimal',
        required: true,
        schema: { _json: field, type: () => 'bytes', description: () => field.doc || '', required: () => true }
      };
      // Add more logical types as needed
    }
  }
  
  // Handle arrays
  if (fieldType === 'array' && field.items) {
    const itemResult = processAvroFieldType(typeof field.items === 'object' ? { ...field.items, name: `${fieldName  }Item` } : { name: `${fieldName  }Item`, type: field.items });
    return {
      javaType: `${itemResult.javaType  }[]`,
      required: true,
      schema: { _json: field, type: () => 'array', description: () => field.doc || '', required: () => true }
    };
  }
  
  // Handle maps (JSON Schema format: type=object with additionalProperties)
  if (fieldType === 'object' && field.additionalProperties) {
    const valueType = field.additionalProperties.type || 'Object';
    const valueResult = processAvroFieldType({ name: `${fieldName  }Value`, type: valueType });
    return {
      javaType: `Map<String, ${valueResult.javaType}>`,
      required: true,
      schema: { _json: field, type: () => 'map', description: () => field.doc || '', required: () => true }
    };
  }
  
  // Handle enums (JSON Schema format: type=string with enum array)
  if (fieldType === 'string' && field && field.enum && Array.isArray(field.enum)) {
    const enumClassName = fieldName.charAt(0).toUpperCase() + fieldName.slice(1);
    return {
      javaType: enumClassName,
      required: true,
      enumClassName,
      enumSymbols: field && field.enum ? field.enum : [],
      schema: { _json: field, type: () => 'enum', description: () => field.doc || '', required: () => true, enum: () => field && field.enum ? field.enum : [] }
    };
  }
  
  // Handle Avro enum types (type object with type: "enum")
  if (typeof fieldType === 'object' && fieldType !== null && fieldType.type === 'enum') {
    const enumClassName = fieldType.name || (fieldName.charAt(0).toUpperCase() + fieldName.slice(1));
    return {
      javaType: enumClassName,
      required: true,
      enumClassName,
      enumSymbols: fieldType.symbols || [],
      schema: { _json: field, type: () => 'enum', description: () => field.doc || '', required: () => true, enum: () => fieldType.symbols }
    };
  }
  
  // Handle logical types (check for pattern or other indicators)
  if (fieldType === 'string' && field.pattern && field.pattern.includes('[\u0000-ÿ]*')) {
    return {
      javaType: 'java.math.BigDecimal',
      required: true,
      schema: { _json: field, type: () => 'bytes', description: () => field.doc || '', required: () => true }
    };
  }
  
  // Handle records (nested objects)
  if (fieldType === 'record' && field.fields) {
    const nestedClassName = field.name || (fieldName.charAt(0).toUpperCase() + fieldName.slice(1));
    return {
      javaType: nestedClassName,
      required: true,
      schema: { _json: field, type: () => 'record', description: () => field.doc || '', required: () => true }
    };
  }
  
  // Handle object types (legacy, type: {type: ...})
  if (typeof fieldType === 'object' && fieldType !== null && fieldType.type) {
    // Recursively process as a full field
    return processAvroFieldType({ ...fieldType, name: fieldName });
  }
  
  // Handle primitive types with logical types
  if (typeof fieldType === 'string') {
    // Check for logical types on the field itself
    if (field.logicalType) {
      switch (field.logicalType) {
      case 'timestamp-millis':
      case 'timestamp-micros':
        return {
          javaType: 'java.time.Instant',
          required: true,
          schema: { _json: field, type: () => 'long', description: () => field.doc || '', required: () => true }
        };
      case 'decimal':
        return {
          javaType: 'java.math.BigDecimal',
          required: true,
          schema: { _json: field, type: () => 'bytes', description: () => field.doc || '', required: () => true }
        };
        // Add more logical types as needed
      }
    }
  }
  
  // Handle primitive types
  // Check if this is a 'long' type that got normalized to 'integer'
  // Long types have minimum/maximum values that exceed 32-bit integer bounds
  let actualType = fieldType;
  if (fieldType === 'integer' && field.minimum !== undefined && field.maximum !== undefined) {
    // Check if the bounds exceed 32-bit integer limits
    const int32Min = -2147483648; // -2^31
    const int32Max = 2147483647;  // 2^31 - 1
    if (field.minimum < int32Min || field.maximum > int32Max) {
      logger.debug(`Found 'long' type (bounds: ${field.minimum} to ${field.maximum}) normalized to 'integer' for field ${fieldName}, correcting to 'long'`);
      actualType = 'long';
    }
  }
  
  const javaType = convertAvroTypeToJavaTypeInline(actualType);
  const required = true; // Primitive types are required unless in union with null
  
  // Create schema object for the field
  const fieldSchema = {
    _json: {
      type: fieldType,
      description: field.doc || ''
    },
    type: () => fieldType,
    description: () => field.doc || '',
    required: () => required
  };
  
  return {
    javaType,
    required,
    schema: fieldSchema
  };
}

/**
 * Process Avro union types (e.g., ["null", "string"] for optional fields)
 */
function processAvroUnionType(unionTypes, fieldName, field) {
  // Check if this is an optional field (union with "null")
  const hasNull = unionTypes.includes('null');
  const nonNullTypes = unionTypes.filter(t => t !== 'null');
  
  if (hasNull && nonNullTypes.length === 1) {
    // Optional field: ["null", "string"] -> String (nullable)
    const nonNullType = nonNullTypes[0];
    const javaType = convertAvroTypeToJavaTypeInline(nonNullType);
    
    const fieldSchema = {
      _json: {
        type: nonNullType,
        description: field.doc || ''
      },
      type: () => nonNullType,
      description: () => field.doc || '',
      required: () => false
    };
    
    return {
      javaType,
      required: false,
      schema: fieldSchema
    };
  } 
  // Complex union: use Object for now
  const fieldSchema = {
    _json: {
      type: 'object',
      description: field.doc || ''
    },
    type: () => 'object',
    description: () => field.doc || '',
    required: () => true
  };
    
  return {
    javaType: 'Object',
    required: true,
    schema: fieldSchema
  };
}

/**
 * Process Avro object types (nested records, enums, arrays, maps)
 */
function processAvroObjectType(objType, fieldName, field) {
  const avroType = objType.type;
  
  // Handle arrays
  if (avroType === 'array') {
    return processAvroArrayType(objType, fieldName, field);
  }
  
  // Handle maps
  if (avroType === 'map') {
    return processAvroMapType(objType, fieldName, field);
  }
  
  // Handle enums
  if (avroType === 'enum') {
    return processAvroEnumType(objType, fieldName, field);
  }
  
  // Handle nested records
  if (avroType === 'record') {
    return processAvroRecordType(objType, fieldName, field);
  }
  
  // Handle fixed types
  if (avroType === 'fixed') {
    return {
      javaType: 'byte[]',
      required: true,
      schema: {
        _json: { type: 'fixed', description: field.doc || '' },
        type: () => 'fixed',
        description: () => field.doc || '',
        required: () => true
      }
    };
  }
  
  // Default to Object for unknown object types
  return {
    javaType: 'Object',
    required: true,
    schema: {
      _json: { type: 'object', description: field.doc || '' },
      type: () => 'object',
      description: () => field.doc || '',
      required: () => true
    }
  };
}

/**
 * Process Avro array types
 */
function processAvroArrayType(arrayType, fieldName, field) {
  const itemsType = arrayType.items;
  let itemJavaType = 'Object';
  
  if (typeof itemsType === 'string') {
    itemJavaType = convertAvroTypeToJavaTypeInline(itemsType);
  } else if (Array.isArray(itemsType)) {
    // Union type in array
    const nonNullTypes = itemsType.filter(t => t !== 'null');
    if (nonNullTypes.length > 0) {
      itemJavaType = convertAvroTypeToJavaTypeInline(nonNullTypes[0]);
    }
  } else if (typeof itemsType === 'object' && itemsType !== null) {
    // Complex type in array
    if (itemsType.type === 'record') {
      itemJavaType = processAvroRecordType(itemsType, fieldName, field).javaType;
    } else {
      itemJavaType = convertAvroTypeToJavaTypeInline(itemsType.type || 'object');
    }
  }
  
  const fieldSchema = {
    _json: {
      type: 'array',
      items: itemsType,
      description: field.doc || ''
    },
    type: () => 'array',
    description: () => field.doc || '',
    required: () => true
  };
  
  return {
    javaType: `${itemJavaType}[]`,
    required: true,
    schema: fieldSchema
  };
}

/**
 * Process Avro map types
 */
function processAvroMapType(mapType, fieldName, field) {
  const valuesType = mapType.values || field.additionalProperties;
  let valueJavaType = 'Object';
  
  if (typeof valuesType === 'string') {
    valueJavaType = convertAvroTypeToJavaTypeInline(valuesType);
  } else if (Array.isArray(valuesType)) {
    // Union type in map values
    const nonNullTypes = valuesType.filter(t => t !== 'null');
    if (nonNullTypes.length > 0) {
      valueJavaType = convertAvroTypeToJavaTypeInline(nonNullTypes[0]);
    }
  } else if (typeof valuesType === 'object' && valuesType !== null) {
    // Recursively process value type for Avro features
    valueJavaType = processAvroFieldType({ ...valuesType, name: `${fieldName  }Value` }).javaType;
  }
  
  const fieldSchema = {
    _json: {
      type: 'map',
      values: valuesType,
      description: field.doc || ''
    },
    type: () => 'map',
    description: () => field.doc || '',
    required: () => true
  };
  
  return {
    javaType: `Map<String, ${valueJavaType}>`,
    required: true,
    schema: fieldSchema
  };
}

/**
 * Process Avro enum types
 */
function processAvroEnumType(enumType, fieldName, field) {
  // Generate enum class name from field name
  const enumClassName = fieldName.charAt(0).toUpperCase() + fieldName.slice(1).replace(/_([a-z])/g, (match, letter) => letter.toUpperCase());
  
  const fieldSchema = {
    _json: {
      type: 'enum',
      symbols: enumType.symbols || [],
      description: field.doc || ''
    },
    type: () => 'enum',
    description: () => field.doc || '',
    required: () => true,
    enum: () => enumType.symbols || []
  };
  
  return {
    javaType: enumClassName,
    required: true,
    schema: fieldSchema
  };
}

/**
 * Process Avro record types (nested records)
 */
function processAvroRecordType(recordType, fieldName, field) {
  // Generate nested class name from field name
  const nestedClassName = fieldName.charAt(0).toUpperCase() + fieldName.slice(1).replace(/_([a-z])/g, (match, letter) => letter.toUpperCase());
  
  const fieldSchema = {
    _json: {
      type: 'record',
      name: nestedClassName,
      fields: recordType.fields || [],
      description: field.doc || ''
    },
    type: () => 'record',
    description: () => field.doc || '',
    required: () => true
  };
  
  return {
    javaType: nestedClassName,
    required: true,
    schema: fieldSchema
  };
}

/**
 * Convert Avro type to Java type (inline helper function)
 * Enhanced to handle logical types and improve Java compatibility
 */
function convertAvroTypeToJavaTypeInline(avroType) {
  if (typeof avroType === 'string') {
    switch (avroType.toLowerCase()) {
    case 'string':
      return 'String';
    case 'int':
    case 'integer':
      return 'Integer';
    case 'long':
      return 'Long';
    case 'float':
      return 'Float';
    case 'double':
      return 'Double';
    case 'boolean':
      return 'Boolean';
    case 'bytes':
      return 'byte[]';
    case 'null':
      return 'Object';
    case 'enum':
      return 'String';
    case 'record':
      return 'Object';
    case 'array':
      return 'Object[]';
    case 'map':
      return 'Map<String, Object>';
    case 'fixed':
      return 'byte[]';
    default:
      return 'String';
    }
  } else if (Array.isArray(avroType)) {
    const nonNullTypes = avroType.filter(t => t !== 'null');
    if (nonNullTypes.length > 0) {
      return convertAvroTypeToJavaTypeInline(nonNullTypes[0]);
    }
    return 'Object';
  } else if (typeof avroType === 'object' && avroType !== null) {
    const baseType = avroType.type;
    const logicalType = avroType.logicalType;
    if (logicalType) {
      switch (logicalType) {
      case 'date':
        return 'java.time.LocalDate';
      case 'time-millis':
        return 'java.time.LocalTime';
      case 'time-micros':
        return 'java.time.LocalTime';
      case 'timestamp-millis':
        return 'java.time.Instant';
      case 'timestamp-micros':
        return 'java.time.Instant';
      case 'local-timestamp-millis':
        return 'java.time.LocalDateTime';
      case 'local-timestamp-micros':
        return 'java.time.LocalDateTime';
      case 'uuid':
        return 'java.util.UUID';
      case 'decimal':
        return 'java.math.BigDecimal';
      default:
        return convertAvroTypeToJavaTypeInline(baseType);
      }
    }
    return convertAvroTypeToJavaTypeInline(baseType);
  }
  return 'String';
}

/**
 * Extract Avro namespace information from schema
 */
function extractAvroNamespaceInfo(schema, schemaName) {
  try {
    let namespace = null;
    let className = null;
    
    // First, try to get namespace from schema data
    const schemaData = schema._json;
    if (schemaData && schemaData.namespace) {
      namespace = schemaData.namespace;
      className = schemaData.name || schemaName;
    }
    
    // Fallback: extract from schema ID if it contains dots
    if (!namespace) {
      const schemaId = schema.id();
      if (schemaId && schemaId.includes('.')) {
        const lastDotIndex = schemaId.lastIndexOf('.');
        namespace = schemaId.substring(0, lastDotIndex);
        className = schemaId.substring(lastDotIndex + 1);
      }
    }
    
    // Fallback: extract from schema name if it contains dots
    if (!namespace && schemaName && schemaName.includes('.')) {
      const lastDotIndex = schemaName.lastIndexOf('.');
      namespace = schemaName.substring(0, lastDotIndex);
      className = schemaName.substring(lastDotIndex + 1);
    }
    
    // Ensure we have valid values
    if (!namespace || !className) {
      logger.warn('Could not extract Avro namespace info for schema:', schemaName);
      return {
        namespace: null,
        packagePath: null,
        className: schemaName
      };
    }
    
    // Convert namespace to package path
    const packagePath = namespace.replace(/\./g, '/');
    
    // Ensure className is a valid Java class name (preserve camel case for Avro)
    className = convertAvroSchemaNameToJavaClassName(className);
    
    logger.debug(`Extracted Avro namespace info: ${namespace}.${className}`);
    
    return {
      namespace,
      packagePath,
      className
    };
  } catch (error) {
    logger.warn('Error extracting Avro namespace info:', error.message);
    return {
      namespace: null,
      packagePath: null,
      className: schemaName
    };
  }
}

/**
 * Convert Avro schema name to Java class name (preserve camel case, handle underscores)
 */
function convertAvroSchemaNameToJavaClassName(schemaName) {
  if (!schemaName) {
    return 'UnknownSchema';
  }
  // Split by underscores, capitalize each part, and join
  return schemaName
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

/**
 * Create Avro schema map for function generation
 */
function createAvroSchemaMap(schemas) {
  const avroSchemaMap = new Map();
  
  schemas.forEach(schema => {
    if (schema.isAvro) {
      avroSchemaMap.set(schema.name, schema);
    }
  });
  
  return avroSchemaMap;
}

/**
 * Get message payload type for Avro schemas
 */
function getAvroMessagePayload(operation, avroSchemaMap = new Map()) {
  const messages = operation.messages();
  if (!messages || messages.length === 0) {
    return 'String';
  }
  
  // For now, return the first message's payload type
  const firstMessage = messages[0];
  if (firstMessage && firstMessage.payload) {
    const payload = firstMessage.payload();
    if (payload) {
      // Check if this is an Avro schema
      const schemaFormat = firstMessage.schemaFormat ? firstMessage.schemaFormat() : null;
      if (schemaFormat && schemaFormat.includes('avro')) {
        // For Avro schemas, try to get the class name from the schema
        const schemaId = payload._json && payload._json['x-parser-schema-id'];
        if (schemaId && avroSchemaMap.has(schemaId)) {
          const avroSchema = avroSchemaMap.get(schemaId);
          return avroSchema.className || 'Object';
        }
      }
      // For non-Avro schemas, delegate to the main processor
      return null; // Signal to use default processing
    }
  }
  
  return 'String';
}

/**
 * Get Avro schema import
 */
function getAvroSchemaImport(schemaName, avroSchemaMap = new Map()) {
  if (!schemaName) {
    return null;
  }
  
  // Check if this is an Avro schema
  if (avroSchemaMap.has(schemaName)) {
    const avroSchema = avroSchemaMap.get(schemaName);
    if (avroSchema.namespace) {
      return `${avroSchema.namespace}.${avroSchema.className}`;
    }
  }
  
  // For non-Avro schemas, return null to use default processing
  return null;
}

/**
 * Get Avro simple class name
 */
function getAvroSimpleClassName(schemaName, avroSchemaMap = new Map()) {
  if (!schemaName) {
    return 'Unknown';
  }
  
  // Check if this is an Avro schema
  if (avroSchemaMap.has(schemaName)) {
    const avroSchema = avroSchemaMap.get(schemaName);
    return avroSchema.className || schemaName;
  }
  
  // For non-Avro schemas, return null to use default processing
  return null;
}

module.exports = {
  extractAvroSchemasFromMessages,
  processAvroFieldType,
  processAvroUnionType,
  processAvroObjectType,
  processAvroArrayType,
  processAvroMapType,
  processAvroEnumType,
  processAvroRecordType,
  convertAvroTypeToJavaTypeInline,
  extractAvroNamespaceInfo,
  convertAvroSchemaNameToJavaClassName,
  createAvroSchemaMap,
  getAvroMessagePayload,
  getAvroSchemaImport,
  getAvroSimpleClassName
}; 
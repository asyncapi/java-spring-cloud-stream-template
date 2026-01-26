const React = require('react');
const { Text } = require('@asyncapi/generator-react-sdk');
const { logger } = require('../utils/logger');
const {
  getEnhancedType,
  getIdentifierName,
  getSchemaType,
  toPascalCase
} = require('../utils/typeUtils');
const { stripPackageName } = require('../utils/typeUtils');

/**
 * Helper to get items schema, handling both function and direct value
 */
function getItemsSchema(schema) {
  if (!schema || !schema.items) return undefined;
  if (typeof schema.items === 'function') return schema.items();
  return schema.items;
}

/**
 * Get Java type for property
 */
function getJavaType(property) {
  logger.debug(`ModelClass.js: getJavaType() - Getting Java type for property: ${property.name}, type: ${property.type}, hasSchema: ${!!property.schema}`);

  if (!property) return 'Object';

  // Handle case where type might be an enhanced type object instead of string
  let type = property.type;
  if (type && typeof type === 'object') {
    logger.debug('ModelClass.js: getJavaType() - Type is enhanced type object:', JSON.stringify(type, null, 2));
    // Check if it's an enhanced type object with javaType property (from Avro processing)
    if (type.javaType) {
      logger.debug(`ModelClass.js: getJavaType() - Found enhanced type object, using javaType: ${type.javaType}`);
      return type.javaType; // Return directly, it's already the correct Java type
    } else if (typeof type.type === 'function') {
      logger.debug('ModelClass.js: getJavaType() - Found AsyncAPI type() method, calling it');
      type = type.type();
    } else {
      logger.debug('ModelClass.js: getJavaType() - Type object has no recognized format, defaulting to \'string\'');
      type = 'string'; // Default assumption for simple properties
    }
  }
  const format = property.format;
  const schema = property.schema;
  const itemsSchema = property.itemsSchema;

  if (type === 'array') {
    if (itemsSchema) {
      // itemsSchema is an AsyncAPI schema object, not a property object
      const itemType = itemsSchema.type ? itemsSchema.type() : null;
      const itemFormat = itemsSchema.format ? itemsSchema.format() : null;

      if (!itemType || itemType === 'object') {
        // Array of objects - need to generate inner class
        // For inner classes, prioritize property name over schema name
        let itemSchemaName = itemsSchema.extensions && itemsSchema.extensions().get('x-parser-schema-id')?.value();
        // Try other extension names if not found
        if (!itemSchemaName) {
          itemSchemaName = itemsSchema.extensions && itemsSchema.extensions().get('x-ep-schema-name')?.value();
        }
        // Try schema id if still not found
        if (!itemSchemaName && itemsSchema.id) {
          itemSchemaName = itemsSchema.id();
        }
        
        // For array properties that will generate inner classes, use property name
        // This ensures consistent naming (e.g., chargeAdjustments -> ChargeAdjustments)
        if (itemSchemaName && !itemSchemaName.startsWith('<anonymous')) {
          // Check if this is a generic schema name like "Items" - if so, use property name
          if (itemSchemaName === 'Items' || itemSchemaName === 'Item' || itemSchemaName === 'Element') {
            const javaType = `${toPascalCase(property.name)}[]`;
            logger.debug(`ModelClass.js: getJavaType() - Array of objects with generic schema name, using property name: ${javaType}`);
            return javaType;
          }
          const { className } = stripPackageName(itemSchemaName);
          const javaType = `${toPascalCase(className)}[]`;
          logger.debug(`ModelClass.js: getJavaType() - Array of objects with schema: ${javaType}`);
          return javaType;
        } 
        // Use property name for anonymous schemas
        const javaType = `${toPascalCase(property.name)}[]`;
        logger.debug(`ModelClass.js: getJavaType() - Array of anonymous objects using property name: ${javaType}`);
        return javaType;
      } 
      // Array of primitives
      const typeInfo = getEnhancedType(itemType, itemFormat);
      const javaType = `${typeInfo.javaType}[]`;
      logger.debug(`ModelClass.js: getJavaType() - Array of primitives: ${javaType}`);
      return javaType;
    }
    return 'Object[]';
  }

  if (!type || type === 'object' || (type && typeof type === 'string' && type.startsWith('object-'))) {
    logger.debug(`ModelClass.js: getJavaType() - Processing object type for property: ${property.name}`);
    // Object type - use schema name
    if (schema) {
      let schemaName = schema.extensions && typeof schema.extensions === 'function' ? schema.extensions().get('x-parser-schema-id')?.value() : undefined;
      if (!schemaName) {
        schemaName = schema.extensions && typeof schema.extensions === 'function' ? schema.extensions().get('x-ep-schema-name')?.value() : undefined;
      }
      if (!schemaName && schema.id && typeof schema.id === 'function') {
        schemaName = schema.id();
      }
      if (schemaName && !schemaName.startsWith('<anonymous')) {
        const { className } = stripPackageName(schemaName);
        const javaType = toPascalCase(className);
        logger.debug(`ModelClass.js: getJavaType() - Object type with schema: ${javaType}`);
        return javaType;
      } 
      // Check if this is a nested object with properties that should generate a class
      if (schema.properties && typeof schema.properties === 'function') {
        const schemaProperties = schema.properties();
        if (schemaProperties && (typeof schemaProperties.values === 'function' || typeof schemaProperties === 'object')) {
          // This is a nested object with properties - generate a class using property name
          const javaType = toPascalCase(property.name);
          logger.debug(`ModelClass.js: getJavaType() - Nested object type with properties using property name: ${javaType}`);
          return javaType;
        }
      }
      // Use property name for anonymous schemas
      const javaType = toPascalCase(property.name);
      logger.debug(`ModelClass.js: getJavaType() - Anonymous object type using property name: ${javaType}`);
      return javaType;
    }
    return 'Object';
  }

  // Primitive type
  const typeInfo = getEnhancedType(type, format);
  logger.debug(`ModelClass.js: getJavaType() - Primitive type: ${typeInfo.javaType}`);
  return typeInfo.javaType;
}

/**
 * Get sample value for property
 */
function _getSampleValue(property) {
  logger.debug('ModelClass.js: getSampleValue() - Getting sample value for property');
  
  if (!property) return 'null';
  
  const type = property.type;
  const format = property.format;
  
  if (type === 'string') {
    if (format === 'date') {
      return '2000-12-31';
    } else if (format === 'date-time') {
      return '2000-12-31T23:59:59+01:00';
    } else if (format === 'byte') {
      return 'U3dhZ2dlciByb2Nrcw==';
    } else if (format === 'binary') {
      return 'base64-encoded file contents';
    } 
    return '"string"';
  } else if (type === 'integer') {
    if (format === 'int64') {
      return '1L';
    } 
    return '1';
  } else if (type === 'number') {
    if (format === 'float') {
      return '1.1F';
    } else if (format === 'double') {
      return '1.1';
    } 
    return '100.1';
  } else if (type === 'boolean') {
    return 'true';
  } else if (type === 'null') {
    return 'null';
  } else if (type === 'array') {
    return 'new ArrayList<>()';
  } else if (!type || type === 'object') {
    const schemaName = property.schemaName || property.name;
    if (schemaName) {
      const { className } = stripPackageName(schemaName);
      return `new ${toPascalCase(className)}()`;
    }
    return 'new Object()';
  }
  
  return 'null';
}

/**
 * Generate all-args constructor
 */
function generateAllArgsConstructor(className, properties, indentLevel = 0, extendsClass = null, parentProperties = []) {
  logger.debug(`ModelClass.js: generateAllArgsConstructor() - Generating constructor for ${className}${extendsClass ? ` extends ${extendsClass}` : ''}`);
  
  const indent = '    '.repeat(indentLevel);
  const elements = [];
  
  // If no properties and no parent, skip
  if ((!properties || properties.length === 0) && (!parentProperties || parentProperties.length === 0)) {
    return elements;
  }

  // For inherited classes, constructor should include parent and child fields
  let allProperties = [];
  if (extendsClass && parentProperties && parentProperties.length > 0) {
    allProperties = [...parentProperties, ...properties];
  } else {
    allProperties = properties;
  }

  // Constructor signature: parent fields first, then child fields
  const paramList = allProperties.map(prop => {
    const javaType = getJavaType(prop);
    const paramName = getIdentifierName(prop.name); // Use safe identifier for parameter
    return `${javaType} ${paramName}`;
  }).join(', ');

  elements.push(React.createElement(Text, null, `${indent}public ${className}(${paramList}) {`));

  // If extending a class, call super() with parent parameters
  if (extendsClass && parentProperties && parentProperties.length > 0) {
    const superParamList = parentProperties.map(prop => getIdentifierName(prop.name)).join(', ');
    elements.push(React.createElement(Text, null, `${indent}  super(${superParamList});`));
  } else if (extendsClass) {
    elements.push(React.createElement(Text, null, `${indent}  super();`));
  }

  // Assign only child fields (not parent fields)
  (properties || []).forEach(prop => {
    const fieldName = getIdentifierName(prop.name);
    const paramName = getIdentifierName(prop.name); // Use safe identifier for parameter
    elements.push(React.createElement(Text, null, `${indent}  this.${fieldName} = ${paramName};`));
  });

  elements.push(React.createElement(Text, null, `${indent}}`));
  elements.push(React.createElement(Text, null, ''));

  return elements;
}

/**
 * Generate field declarations
 */
function generateFields(properties, indentLevel = 0) {
  logger.debug('ModelClass.js: generateFields() - Generating field declarations');
  
  const indent = '    '.repeat(indentLevel);
  const elements = [];
  
  if (!properties || properties.length === 0) {
    return elements;
  }
  
  properties.forEach(prop => {
    const javaType = getJavaType(prop);
    const fieldName = getIdentifierName(prop.name);
    const originalName = prop.name;
    
    // Always add JsonProperty annotation (matching backup behavior)
    elements.push(React.createElement(Text, null, `${indent}@JsonProperty("${originalName}")`));
    
    // Add validation annotations for required fields
    if (prop.required) {
      elements.push(React.createElement(Text, null, `${indent}@NotNull`));
    }
    
    // Add Min/Max validation annotations for numeric constraints
    if (prop.minimum !== undefined) {
      elements.push(React.createElement(Text, null, `${indent}@Min(${prop.minimum})`));
    }
    if (prop.maximum !== undefined) {
      elements.push(React.createElement(Text, null, `${indent}@Max(${prop.maximum})`));
    }
    
    elements.push(React.createElement(Text, null, `${indent}private ${javaType} ${fieldName};`));
    elements.push(React.createElement(Text, null, ''));
  });
  
  return elements;
}

/**
 * Generate getters and setters
 */
function generateAccessors(className, properties, indentLevel = 0) {
  logger.debug(`ModelClass.js: generateAccessors() - Generating accessors for ${className}`);
  
  const indent = '    '.repeat(indentLevel);
  const elements = [];
  
  if (!properties || properties.length === 0) {
    return elements;
  }
  
  properties.forEach(prop => {
    const javaType = getJavaType(prop);
    const fieldName = getIdentifierName(prop.name);
    const methodName = toPascalCase(prop.name);
    
    // Getter
    elements.push(React.createElement(Text, null, `${indent}public ${javaType} get${methodName}() {`));
    elements.push(React.createElement(Text, null, `${indent}  return ${fieldName};`));
    elements.push(React.createElement(Text, null, `${indent}}`));
    elements.push(React.createElement(Text, null, ''));
    
    // Setter
    const paramName = getIdentifierName(prop.name); // Use safe identifier for parameter
    elements.push(React.createElement(Text, null, `${indent}public ${className} set${methodName}(${javaType} ${paramName}) {`));
    elements.push(React.createElement(Text, null, `${indent}  this.${fieldName} = ${paramName};`));
    elements.push(React.createElement(Text, null, `${indent}  return this;`));
    elements.push(React.createElement(Text, null, `${indent}}`));
    elements.push(React.createElement(Text, null, ''));
  });
  
  return elements;
}

/**
 * Generate toString method
 */
function generateToString(className, properties, indentLevel = 0, extendsClass = null) {
  logger.debug(`ModelClass.js: generateToString() - Generating toString for ${className}${extendsClass ? ` extends ${extendsClass}` : ''}`);
  
  const indent = '    '.repeat(indentLevel);
  const elements = [];
  
  elements.push(React.createElement(Text, null, `${indent}@Override`));
  elements.push(React.createElement(Text, null, `${indent}public String toString() {`));
  
  if (extendsClass && properties && properties.length > 0) {
    // For inherited classes, use parent's toString and add child fields
    elements.push(React.createElement(Text, null, `${indent}  String parentString = super.toString();`));
    let returnLine = `${indent}  return parentString.substring(0, parentString.length() - 1)`;
    properties.forEach((prop, index) => {
      const fieldName = getIdentifierName(prop.name);
      const javaType = getJavaType(prop);
      const isLast = index === properties.length - 1;
      returnLine += `\n${indent}    + ", ${fieldName}: " + ${fieldName}`;
      if (javaType === 'Object') {
        returnLine += '.toString()';
      } else if (javaType.endsWith('[]')) {
        returnLine += ` != null ? java.util.Arrays.toString(${  fieldName  }) : "null"`;
      }
      if (isLast) {
        returnLine += ' + " ]"';
      }
    });
    returnLine += ';';
    elements.push(React.createElement(Text, null, returnLine));
  } else {
    // For non-inherited classes, use the original logic
    let returnLine = `${indent}  return "${className} ["`;
    if (properties && properties.length > 0) {
      properties.forEach((prop, index) => {
        const fieldName = getIdentifierName(prop.name);
        const javaType = getJavaType(prop);
        const _isLast = index === properties.length - 1;
        const separator = index === 0 ? ' ' : ', ';
        returnLine += `\n${indent}    + "${separator}${fieldName}: " + ${fieldName}`;
        if (javaType === 'Object') {
          returnLine += '.toString()';
        } else if (javaType.endsWith('[]')) {
          returnLine += ` != null ? java.util.Arrays.toString(${  fieldName  }) : "null"`;
        }
      });
    }
    returnLine += `\n${indent}    + " ]";`;
    elements.push(React.createElement(Text, null, returnLine));
  }
  elements.push(React.createElement(Text, null, `${indent}}`));
  return elements;
}

/**
 * Generate enum if property has enum values
 */
function generateEnum(property, indentLevel = 0) {
  logger.debug('ModelClass.js: generateEnum() - Generating enum for property');
  
  const indent = '    '.repeat(indentLevel);
  const elements = [];
  
  // Defensive check for property
  if (!property) {
    logger.warn('ModelClass.js: generateEnum() - Property is undefined or null');
    return elements;
  }
  
  // Handle both direct enum arrays and enum functions (from Avro processing)
  let enumValues = null;
  if (property.enum) {
    if (Array.isArray(property.enum)) {
      enumValues = property.enum;
    } else if (typeof property.enum === 'function') {
      try {
        enumValues = property.enum();
        // Additional check in case the function returns undefined
        if (!enumValues) {
          logger.warn('ModelClass.js: generateEnum() - Enum function returned undefined');
          return elements;
        }
      } catch (error) {
        logger.warn(`ModelClass.js: generateEnum() - Error calling enum function: ${error.message}`);
        return elements;
      }
    }
  }
  
  if (!enumValues || !Array.isArray(enumValues) || enumValues.length === 0) {
    return elements;
  }
  
  // Defensive check for property name
  if (!property.name) {
    logger.warn('ModelClass.js: generateEnum() - Property name is undefined or null');
    return elements;
  }
  
  const enumName = toPascalCase(property.name);
  
  // Convert enum values to valid Java identifiers
  const validEnumValues = enumValues.map(value => {
    if (typeof value === 'string') {
      // Handle values with hyphens (e.g., "in-app" -> "IN_APP")
      if (value.includes('-')) {
        return value.replace(/-/g, '_').toUpperCase();
      }
      // Handle values with spaces (e.g., "low priority" -> "LOW_PRIORITY")
      if (value.includes(' ')) {
        return value.replace(/\s+/g, '_').toUpperCase();
      }
      // Handle numeric values (e.g., "123" -> "V_123")
      if ((/^\d+$/).test(value)) {
        return `V_${value}`;
      }
      // Convert to uppercase for Java enum convention
      return value.toUpperCase();
    }
    // For non-string values, convert to string and make uppercase
    return String(value).toUpperCase();
  });
  
  const enumValuesString = validEnumValues.join(', ');
  
  // Generate as a static enum inside the class (matching reference project behavior)
  elements.push(React.createElement(Text, null, `${indent}public static enum ${enumName} { ${enumValuesString} }`));
  elements.push(React.createElement(Text, null, ''));
  
  return elements;
}

/**
 * Generate inner classes for object properties
 */
function generateInnerClasses(properties, indentLevel = 0, processedData = null) {
  logger.debug('ModelClass.js: generateInnerClasses() - Generating inner classes');
  logger.debug(`ModelClass.js: generateInnerClasses() - Properties count: ${properties ? properties.length : 0}`);
  
  const elements = [];
  const nestedInnerClasses = []; // Collect nested inner classes to process at the same level
  
  if (!properties || properties.length === 0) {
    logger.debug('ModelClass.js: generateInnerClasses() - No properties to process');
    return elements;
  }
  
  // Get list of schemas being processed as standalone classes
  const standaloneSchemaNames = new Set();
  if (processedData && processedData.schemas) {
    processedData.schemas.forEach(schema => {
      if (schema.name) {
        standaloneSchemaNames.add(schema.name);
      }
    });
  }
  logger.debug(`ModelClass.js: generateInnerClasses() - Standalone schema names: ${Array.from(standaloneSchemaNames).join(', ')}`);
  
  properties.forEach((prop, index) => {
    logger.debug(`ModelClass.js: generateInnerClasses() - Processing property ${index}: ${prop.name}, type: ${prop.type}`);
    const type = prop.type;
    const schema = prop.schema;
    const itemsSchema = prop.itemsSchema;
    
    logger.debug(`ModelClass.js: generateInnerClasses() - Property ${prop.name}: schema=${!!schema}, itemsSchema=${!!itemsSchema}`);
    if (type && typeof type === 'string' && (type === 'object' || type.startsWith('object-'))) {
      // Check if this object property schema is already being processed as a standalone class
      let schemaName = null;
      if (schema && schema.extensions) {
        try {
          const schemaId = schema.extensions().get('x-parser-schema-id')?.value();
          if (schemaId) {
            // Extract schema name from schema ID (e.g., "sentAt" from "sentAt.json")
            schemaName = schemaId.split('/').pop().replace('.json', '');
          }
        } catch (error) {
          logger.debug(`ModelClass.js: generateInnerClasses() - Error getting schema name: ${error.message}`);
        }
      }
      
      // If schema name is found and it's in the standalone list, skip generating inner class
      if (schemaName && standaloneSchemaNames.has(schemaName)) {
        logger.debug(`ModelClass.js: generateInnerClasses() - Skipping inner class for ${prop.name} because ${schemaName} is already a standalone class`);
        return;
      }
      
      logger.debug(`ModelClass.js: generateInnerClasses() - Generating inner class for object property: ${prop.name}`);
      // Generate inner class for object property
      const innerClassName = toPascalCase(prop.name);
      const innerProperties = [];
      
      // Process properties of the nested object
      if (!schema || typeof schema.properties !== 'function') {
        logger.debug(`ModelClass.js: generateInnerClasses() - Schema is null or properties is not a function: schema=${!!schema}, properties=${schema ? typeof schema.properties : 'N/A'}`);
        return elements;
      }
      
      const schemaProperties = schema.properties();
      logger.debug(`ModelClass.js: generateInnerClasses() - Schema properties type: ${typeof schemaProperties}`);
      
      if (schemaProperties) {
        let propertyArray = [];
        
        // Handle different property collection types
        if (typeof schemaProperties.values === 'function') {
          // Map-like object with values() method
          propertyArray = Array.from(schemaProperties.values());
        } else if (typeof schemaProperties === 'object') {
          // Plain object - convert to array of properties
          propertyArray = Object.entries(schemaProperties).map(([propName, propSchema]) => {
            // Debug: Log the propSchema to understand the structure
            logger.debug(`ModelClass.js: generateInnerClasses() - propSchema for ${propName}:`, {
              type: propSchema.type,
              format: propSchema.format,
              typeType: typeof propSchema.type,
              formatType: typeof propSchema.format
            });
            
            // Create a property-like object that matches the expected structure
            return {
              id: () => propName,
              type: typeof propSchema.type === 'function' ? (() => {
                const rawType = propSchema.type();
                logger.debug(`ModelClass.js: generateInnerClasses() - propSchema.type() returned: ${rawType}`);
                return rawType.toLowerCase();
              })() : propSchema.type, // Ensure lowercase
              format: typeof propSchema.format === 'function' ? propSchema.format() : propSchema.format, // Call function if it's a function
              description: () => propSchema.description,
              extensions: () => ({
                get: (key) => ({ value: () => propSchema[key] })
              }),
              enum: () => propSchema.enum,
              items: () => propSchema.items
            };
          });
        }
        
        logger.debug(`ModelClass.js: generateInnerClasses() - Found ${propertyArray.length} inner properties`);
        propertyArray.forEach(innerProp => {
          const propertyName = innerProp.id();
          // Fix: Extract type and format values (now direct values, not functions)
          const innerPropType = innerProp.type;
          const innerPropFormat = innerProp.format;
          const isRequired = schema.required && Array.isArray(schema.required()) && schema.required().includes(propertyName);
          
          // Create a property object that getJavaType can understand
          const _propertyObj = {
            name: propertyName,
            type: innerPropType, // Always schema type, not Java type
            format: innerPropFormat,
            schema: innerProp,
            itemsSchema: innerProp.items ? innerProp.items() : undefined
          };
          
          innerProperties.push({
            name: propertyName,
            type: innerPropType, // Always schema type, not Java type
            description: innerProp.description ? innerProp.description() : '',
            required: isRequired,
            schemaName: innerProp.extensions && innerProp.extensions().get('x-parser-schema-id')?.value(),
            format: innerPropFormat,
            enum: innerProp.enum ? innerProp.enum() : undefined,
            items: innerProp.items ? innerProp.items() : undefined,
            schema: innerProp,
            itemsSchema: innerProp.items ? innerProp.items() : undefined
          });
        });
      }
      
      logger.debug(`ModelClass.js: generateInnerClasses() - Generated ${innerProperties.length} inner properties for ${innerClassName}`);
      elements.push(...generateClass(innerClassName, innerProperties, indentLevel + 1, true));
    } else if (type === 'array' && itemsSchema && itemsSchema.properties && typeof itemsSchema.properties === 'function') {
      // Check if this is actually a primitive array before generating inner class
      const itemType = itemsSchema.type ? itemsSchema.type() : null;
      const _itemFormat = itemsSchema.format ? itemsSchema.format() : null;
      
      // If it's a primitive type (not object), don't generate inner class
      if (itemType && itemType !== 'object' && !itemType.startsWith('object-')) {
        logger.debug(`ModelClass.js: generateInnerClasses() - Skipping inner class for array property ${prop.name}: itemType=${itemType} (primitive array)`);
        return;
      }
      
      logger.debug(`ModelClass.js: generateInnerClasses() - Generating inner class for array property: ${prop.name}`);
      // Generate inner class for array items
      // Use the property name for the inner class name (e.g., chargeAdjustments -> ChargeAdjustments)
      const innerClassName = toPascalCase(prop.name);
      const innerProperties = [];
      
      // Process properties of the array items
      const schemaProperties = itemsSchema.properties();
      logger.debug(`ModelClass.js: generateInnerClasses() - Items schema properties type: ${typeof schemaProperties}`);
      
      if (schemaProperties) {
        let propertyArray = [];
        
        // Handle different property collection types
        if (typeof schemaProperties.values === 'function') {
          // Map-like object with values() method
          propertyArray = Array.from(schemaProperties.values());
        } else if (typeof schemaProperties === 'object') {
          // Plain object - convert to array of properties
          propertyArray = Object.entries(schemaProperties).map(([propName, propSchema]) => {
            // Debug: Log the propSchema to understand the structure
            logger.debug(`ModelClass.js: generateInnerClasses() - array propSchema for ${propName}:`, {
              type: propSchema.type,
              format: propSchema.format,
              typeType: typeof propSchema.type,
              formatType: typeof propSchema.format
            });
            
            const ast = {
              id: propName,
              type: typeof propSchema.type === 'function' ? propSchema.type() : propSchema.type,
              format: typeof propSchema.format === 'function' ? propSchema.format() : propSchema.format,
              description: typeof propSchema.description === 'function' ? propSchema.description() : propSchema.description,
              extensions: typeof propSchema.extensions === 'function' ? propSchema.extensions() : propSchema.extensions,
              enum: typeof propSchema.enum === 'function' ? propSchema.enum() : propSchema.enum,
              items: typeof propSchema.items === 'function' ? propSchema.items() : propSchema.items
            }; 

            // logger.debug(`ModelClass.js: generateInnerClasses() - propName: ${propName}`, ast);

            if (ast.type === 'object') {
              // Create a clean AST object without extensions for debugging
              const cleanAst = { ...ast };
              delete cleanAst.extensions;
              logger.debug(`ModelClass.js: generateInnerClasses() - Found nested inner class propName: ${propName}`, cleanAst);
              // Collect nested inner class for later processing at the same level
              const nestedClassName = toPascalCase(propName);
              const nestedProperties = [];
              
              // Process the nested object's properties
              if (propSchema.properties && typeof propSchema.properties === 'function') {
                const nestedSchemaProperties = propSchema.properties();
                if (nestedSchemaProperties && typeof nestedSchemaProperties === 'object') {
                  Object.entries(nestedSchemaProperties).forEach(([nestedPropName, nestedPropSchema]) => {
                    nestedProperties.push({
                      name: nestedPropName,
                      type: typeof nestedPropSchema.type === 'function' ? nestedPropSchema.type() : nestedPropSchema.type,
                      format: typeof nestedPropSchema.format === 'function' ? nestedPropSchema.format() : nestedPropSchema.format,
                      description: typeof nestedPropSchema.description === 'function' ? nestedPropSchema.description() : nestedPropSchema.description,
                      required: propSchema.required && Array.isArray(propSchema.required()) && propSchema.required().includes(nestedPropName),
                      schema: nestedPropSchema,
                      itemsSchema: getItemsSchema(nestedPropSchema)
                    });
                  });
                }
              }
              
              nestedInnerClasses.push({
                className: nestedClassName,
                properties: nestedProperties
              });
            }
            if (propName === 'options') { 
              logger.debug('I am here');
            }
              
            return ast;
          });
        }
        
        logger.debug(`ModelClass.js: generateInnerClasses() - Found ${propertyArray.length} array item properties`);
        propertyArray.forEach(innerProp => {
          const propertyName = innerProp.id;
          // Fix: Extract type and format values (now direct values, not functions)
          const innerPropType = innerProp.type;
          const innerPropFormat = innerProp.format;
          const isRequired = itemsSchema.required && Array.isArray(itemsSchema.required()) && itemsSchema.required().includes(propertyName);
          
          // Create a property object that getJavaType can understand
          const _propertyObj2 = {
            name: propertyName,
            type: innerPropType, // Always schema type, not Java type
            format: innerPropFormat,
            schema: innerProp,
            itemsSchema: innerProp.items
          };
          
          innerProperties.push({
            name: propertyName,
            type: innerPropType, // Always schema type, not Java type
            description: innerProp.description,
            required: isRequired,
            schemaName: innerProp.extensions && typeof innerProp.extensions.get === 'function' ? innerProp.extensions.get('x-parser-schema-id')?.value() : undefined,
            format: innerPropFormat,
            enum: innerProp.enum,
            items: innerProp.items,
            schema: innerProp,
            itemsSchema: innerProp.items,
          });
        });
      }
      
      logger.debug(`ModelClass.js: generateInnerClasses() - Generated ${innerProperties.length} array item properties for ${innerClassName}`);
      elements.push(...generateClass(innerClassName, innerProperties, indentLevel + 1, true));
    } else {
      logger.debug(`ModelClass.js: generateInnerClasses() - Skipping property ${prop.name}: type=${type}, hasSchema=${!!schema}, hasItemsSchema=${!!itemsSchema}`);
    }
  });
  
  logger.debug(`ModelClass.js: generateInnerClasses() - Generated ${elements.length} inner class elements`);

  // Process all collected nested inner classes at the same level
  if (nestedInnerClasses.length > 0) {
    logger.debug(`ModelClass.js: generateInnerClasses() - Processing ${nestedInnerClasses.length} nested inner classes`);
    nestedInnerClasses.forEach(nestedClass => {
      logger.debug(`ModelClass.js: generateInnerClasses() - Generating nested inner class: ${nestedClass.className}`);
      elements.push(...generateClass(
        nestedClass.className, 
        nestedClass.properties, 
        indentLevel + 1, // Same level as other inner classes
        true // isStatic
      ));
    });
  }

  return elements;
}

/**
 * Generate Java class (matching reference project structure)
 */
function generateClass(className, properties, indentLevel = 0, isStatic = false, extendsClass = null, parentProperties = [], processedData = null) {
  logger.debug(`ModelClass.js: generateClass() - Generating class ${className}${extendsClass ? ` extends ${extendsClass}` : ''}`);
  
  const indent = '    '.repeat(indentLevel);
  const elements = [];
  
  // Class declaration
  const staticKeyword = isStatic ? 'static ' : '';
  const extendsClause = extendsClass ? ` extends ${extendsClass}` : '';
  elements.push(React.createElement(Text, null, `${indent}@JsonInclude(JsonInclude.Include.NON_NULL)`));
  elements.push(React.createElement(Text, null, `${indent}public ${staticKeyword}class ${className}${extendsClause} {`));
  
  // Default constructor
  const bodyIndent = `${indent  }    `;
  elements.push(React.createElement(Text, null, `${bodyIndent}public ${className}() {`));
  if (extendsClass) {
    elements.push(React.createElement(Text, null, `${bodyIndent}  super();`));
  }
  elements.push(React.createElement(Text, null, `${bodyIndent}}`));
  elements.push(React.createElement(Text, null, ''));
  
  // All-args constructor
  elements.push(...generateAllArgsConstructor(className, properties, indentLevel + 1, extendsClass, parentProperties));
  
  // Fields with smart JsonProperty annotations
  elements.push(...generateFields(properties, indentLevel + 1));
  elements.push(React.createElement(Text, null, ''));
  
  // Getters and setters
  elements.push(...generateAccessors(className, properties, indentLevel + 1));
  
  // Inner classes (enhanced with processedData context)
  elements.push(...generateInnerClasses(properties, indentLevel + 1, processedData));
  
  // Enums
  properties.forEach(prop => {
    elements.push(...generateEnum(prop, indentLevel + 1));
  });
  
  // Generate enums for Avro processed fields that have enum information
  properties.forEach(prop => {
    if (prop.type && typeof prop.type === 'object' && prop.type.enumSymbols) {
      const enumElements = generateEnum({
        name: prop.name,
        enum: prop.type.enumSymbols
      }, indentLevel + 1);
      elements.push(...enumElements);
    }
  });
  
  // toString method
  elements.push(...generateToString(className, properties, indentLevel + 1, extendsClass));
  
  elements.push(React.createElement(Text, null, `${indent}}`));
  
  return elements;
}

/**
 * ModelClass component for generating Java model classes
 * Enhanced with full context awareness and smart generation capabilities
 * 
 * @param {Object} schema - Processed schema object with properties array
 * @param {Object} params - User parameters (javaPackage, etc.) 
 * @param {Object} asyncapi - Full AsyncAPI document
 * @param {Object} processedData - All processed data (schemas, functions, imports, etc.)
 * @param {string} extendsClass - Parent class name if inheriting
 * @param {Array} parentProperties - Properties from parent class
 * @param {string} namespace - Schema namespace
 * @param {string} className - Override class name
 */
function ModelClass({ schema, params, asyncapi, processedData, extendsClass, parentProperties, namespace, className }) {
  logger.debug('ModelClass.js: ModelClass() - Generating model class component');
  logger.debug('ModelClass.js: Input validation:', {
    hasSchema: !!schema,
    hasParams: !!params,
    hasAsyncapi: !!asyncapi,
    hasProcessedData: !!processedData,
    schemaPropertiesLength: schema?.properties?.length,
    schemaClassName: schema?.className,
    schemaName: schema?.name
  });
  
  if (!schema) {
    logger.warn('ModelClass.js: ModelClass() - No schema provided');
    return [];
  }
  
  const elements = [];
  
  // 1. SMART PACKAGE NAME RESOLUTION (restored from backup)
  const packageName = getSmartPackageName(params, asyncapi, schema);
  if (packageName) {
    elements.push(React.createElement(Text, null, `package ${packageName};`));
    elements.push(React.createElement(Text, null, ''));
  }
  
  // 2. SMART IMPORT ANALYSIS (restored from backup + enhanced)
  const importAnalysis = analyzeRequiredImports(schema, processedData);
  
  // Add base imports
  elements.push(React.createElement(Text, null, 'import com.fasterxml.jackson.annotation.JsonInclude;'));
  
  // Conditional JsonProperty import (only when needed)
  if (importAnalysis.needsJsonProperty) {
    elements.push(React.createElement(Text, null, 'import com.fasterxml.jackson.annotation.JsonProperty;'));
  }
  
  // Add cross-schema imports (using processedData)
  importAnalysis.crossSchemaImports.forEach(importStatement => {
    elements.push(React.createElement(Text, null, importStatement));
  });
  
  // Add validation imports if needed
  importAnalysis.validationImports.forEach(importStatement => {
    elements.push(React.createElement(Text, null, importStatement));
  });
  
  // Add utility imports if needed
  importAnalysis.utilityImports.forEach(importStatement => {
    elements.push(React.createElement(Text, null, importStatement));
  });
  
  elements.push(React.createElement(Text, null, ''));
  
  // 3. DETERMINE CLASS NAME (with multiple fallback strategies)
  const finalClassName = className || 
                        schema.className || 
                        toPascalCase(schema.name) ||
                        'UnknownSchema';
  
  // 4. PREPARE PROPERTIES (handle both processed arrays and AsyncAPI functions)
  const schemaProperties = prepareSchemaProperties(schema);
  
  // 5. GENERATE THE MAIN CLASS
  elements.push(...generateClass(
    finalClassName, 
    schemaProperties, 
    0, 
    false, 
    extendsClass, 
    parentProperties,
    processedData  // Pass context for enhanced generation
  ));
  
  return elements;
}

/**
 * Smart package name resolution using all available sources
 */
function getSmartPackageName(params, asyncapi, schema) {
  logger.debug('ModelClass.js: getSmartPackageName() - Resolving package name');
  
  // Priority 1: User-provided package in params
  if (params && params.javaPackage) {
    logger.debug('ModelClass.js: Using params.javaPackage:', params.javaPackage);
    return params.javaPackage;
  }
  
  // Priority 2: AsyncAPI document extension
  if (asyncapi && asyncapi.info && asyncapi.info().extensions) {
    try {
      const javaPackageExt = asyncapi.info().extensions().get('x-java-package');
      if (javaPackageExt) {
        const packageName = javaPackageExt.value();
        logger.debug('ModelClass.js: Using AsyncAPI x-java-package:', packageName);
        return packageName;
      }
    } catch (error) {
      logger.debug('ModelClass.js: Error reading AsyncAPI extensions:', error.message);
    }
  }
  
  // Priority 3: Schema namespace (Avro schemas)
  if (schema && schema.namespace) {
    logger.debug('ModelClass.js: Using schema.namespace:', schema.namespace);
    return schema.namespace;
  }
  
  // Priority 4: Extract from schema name if it contains dots
  if (schema && schema.name && String(schema.name).includes('.')) {
    const { javaPackage } = stripPackageName(schema.name);
    if (javaPackage) {
      logger.debug('ModelClass.js: Extracted from schema name:', javaPackage);
      return javaPackage;
    }
  }
  
  // Priority 5: Schema package path
  if (schema && schema.packagePath) {
    const packageName = schema.packagePath.replace(/\//g, '.');
    logger.debug('ModelClass.js: Using schema.packagePath:', packageName);
    return packageName;
  }
  
  // Fallback
  logger.debug('ModelClass.js: Using fallback package name');
  return 'com.company';
}

/**
 * Analyze what imports are actually needed for this schema
 */
function analyzeRequiredImports(schema, processedData) {
  logger.debug('ModelClass.js: analyzeRequiredImports() - Analyzing import requirements');
  
  const analysis = {
    needsJsonProperty: false,
    crossSchemaImports: [],
    validationImports: [],
    utilityImports: []
  };
  
  const properties = schema.properties || [];
  
  // Always add JsonProperty for all properties (matching backup behavior)
  analysis.needsJsonProperty = properties.length > 0;
  
  // Analyze cross-schema references using processedData
  if (processedData && processedData.schemas) {
    const currentPackage = getSmartPackageName(null, null, schema);
    
    properties.forEach(prop => {
      const propType = getJavaType(prop);
      
      // Check if this type references another schema
      const referencedSchema = processedData.schemas.find(s => 
        s.className === propType || 
        propType.includes(s.className)
      );
      
      if (referencedSchema && referencedSchema.namespace && 
          referencedSchema.namespace !== currentPackage) {
        const importStatement = `import ${referencedSchema.namespace}.${referencedSchema.className};`;
        if (!analysis.crossSchemaImports.includes(importStatement)) {
          analysis.crossSchemaImports.push(importStatement);
        }
      }
    });
  }
  
  // Check for validation imports (if schema has validation constraints)
  const hasValidation = properties.some(prop => 
    prop.required || 
    (prop.format && ['email', 'uri', 'date', 'date-time'].includes(prop.format)) ||
    prop.minimum !== undefined ||
    prop.maximum !== undefined
  );
  
  if (hasValidation) {
    analysis.validationImports.push('import jakarta.validation.constraints.NotNull;');
    
    // Add Min/Max imports if needed
    const hasMinMax = properties.some(prop => prop.minimum !== undefined || prop.maximum !== undefined);
    if (hasMinMax) {
      analysis.validationImports.push('import jakarta.validation.constraints.Min;');
      analysis.validationImports.push('import jakarta.validation.constraints.Max;');
    }
  }
  
  // Check for utility imports
  properties.forEach(prop => {
    const propType = getJavaType(prop);
    
    // Check for Map types
    if (propType.includes('Map<')) {
      analysis.utilityImports.push('import java.util.Map;');
    }
    
    // Check for array types that might need Arrays.toString()
    if (propType.endsWith('[]')) {
      analysis.utilityImports.push('import java.util.Arrays;');
    }
  });
  
  // Remove duplicates
  analysis.utilityImports = [...new Set(analysis.utilityImports)];
  
  logger.debug('ModelClass.js: Import analysis result:', analysis);
  return analysis;
}

/**
 * Prepare schema properties handling both processed arrays and AsyncAPI functions
 */
function prepareSchemaProperties(schema) {
  logger.debug('ModelClass.js: prepareSchemaProperties() - Preparing properties');
  
  if (!schema.properties) {
    logger.debug('ModelClass.js: No properties found');
    return [];
  }
  
  // If it's already a processed array (from processors), use it directly
  if (Array.isArray(schema.properties)) {
    logger.debug('ModelClass.js: Using processed properties array');
    return schema.properties;
  }
  
  // If it's an AsyncAPI function, call it and process the result
  if (typeof schema.properties === 'function') {
    logger.debug('ModelClass.js: Processing AsyncAPI properties function');
    try {
      const asyncApiProperties = schema.properties();
      if (asyncApiProperties && typeof asyncApiProperties.values === 'function') {
        const propertyArray = Array.from(asyncApiProperties.values());
        return propertyArray.map(prop => ({
          name: prop.id(),
          type: getSchemaType(prop),
          description: prop.description ? prop.description() : '',
          required: false, // TODO: Determine from schema.required()
          format: prop.format ? prop.format() : undefined,
          enum: prop.enum ? prop.enum() : undefined,
          schema: prop,
          itemsSchema: prop.items ? prop.items() : undefined
        }));
      }
    } catch (error) {
      logger.warn('ModelClass.js: Error processing AsyncAPI properties:', error.message);
    }
  }
  
  logger.debug('ModelClass.js: Using empty properties array as fallback');
  return [];
}

module.exports = ModelClass; 
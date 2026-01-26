const _ = require('lodash');
const { logger } = require('./logger');

/**
 * Enhanced type mapping for Java types (matching reference project exactly)
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
 * Get enhanced type mapping (matching reference project)
 */
function getEnhancedType(type, format) {
  logger.debug(`typeUtils.js: getEnhancedType() - Getting type for ${type}, format: ${format}`);
  
  const typeMapForType = typeMap.get(type);
  if (!typeMapForType) {
    return {javaType: 'Object', printFormat: '%s', sample: 'null'};
  }
  
  let typeObject = typeMapForType.get(format);
  if (typeObject === undefined) {
    typeObject = typeMapForType.get(undefined);
  }
  
  logger.debug(`typeUtils.js: getEnhancedType() - Returning: ${typeObject.javaType}`);
  return typeObject;
}

/**
 * Check if property names need JsonProperty annotation (matching reference project)
 */
function checkPropertyNames(name, schema) {
  logger.debug(`typeUtils.js: checkPropertyNames() - Checking property: ${name}`);
  
  if (!schema || !schema.properties) {
    return false;
  }
  
  const properties = schema.properties();
  if (!properties) {
    return false;
  }
  
  // Handle different types of properties objects
  let propertyEntries = [];
  
  if (typeof properties.forEach === 'function') {
    // Map-like object with forEach
    properties.forEach((prop, propName) => {
      propertyEntries.push([propName, prop]);
    });
  } else if (typeof properties.entries === 'function') {
    // Map-like object with entries
    propertyEntries = Array.from(properties.entries());
  } else if (typeof properties === 'object') {
    // Plain object
    propertyEntries = Object.entries(properties);
  } else {
    return false;
  }
  
  // Check if any property name differs from its Java identifier name
  for (const [propName, _prop] of propertyEntries) {
    const javaIdentifierName = getIdentifierName(propName);
    if (javaIdentifierName !== propName) {
      logger.debug(`typeUtils.js: checkPropertyNames() - Property ${propName} needs JsonProperty (Java: ${javaIdentifierName})`);
      return true;
    }
  }
  
  return false;
}

/**
 * Get valid Java identifier name (matching reference project)
 */
function getIdentifierName(name) {
  logger.debug(`typeUtils.js: getIdentifierName() - Converting: ${name}`);
  
  let ret = _.camelCase(name);
  
  // Check if it's a Java reserved word
  if (isJavaReservedWord(ret)) {
    ret = `_${ret}`;
  }
  
  logger.debug(`typeUtils.js: getIdentifierName() - Result: ${ret}`);
  return ret;
}

/**
 * Check if a word is a Java reserved word
 */
function isJavaReservedWord(word) {
  const javaKeywords = new Set([
    'abstract', 'assert', 'boolean', 'break', 'byte', 'case', 'catch', 'char', 'class', 'const',
    'continue', 'default', 'do', 'double', 'else', 'enum', 'extends', 'final', 'finally', 'float',
    'for', 'goto', 'if', 'implements', 'import', 'instanceof', 'int', 'interface', 'long', 'native',
    'new', 'package', 'private', 'protected', 'public', 'return', 'short', 'static', 'strictfp',
    'super', 'switch', 'synchronized', 'this', 'throw', 'throws', 'transient', 'try', 'void',
    'volatile', 'while', 'true', 'false', 'null'
  ]);
  
  return javaKeywords.has(word.toLowerCase());
}

/**
 * Fix type for property (matching reference project's fixType function)
 */
function fixType(name, javaName, property) {
  logger.debug(`typeUtils.js: fixType() - Fixing type for ${name}, javaName: ${javaName}`);
  
  if (!property) {
    return ['Object', false];
  }
  
  const type = property.type ? property.type() : null;
  const format = property.format ? property.format() : null;
  
  logger.debug(`typeUtils.js: fixType() - Property type: ${type}, format: ${format}`);
  
  if (type === 'array') {
    const items = property.items();
    if (items) {
      const itemType = items.type ? items.type() : null;
      const itemFormat = items.format ? items.format() : null;
      
      if (!itemType || itemType === 'object') {
        // Array of objects - need to generate inner class
        const itemSchemaName = items.extensions && items.extensions().get('x-parser-schema-id')?.value();
        if (itemSchemaName) {
          const { className } = stripPackageName(itemSchemaName);
          const javaType = `List<${_.upperFirst(_.camelCase(className))}>`;
          logger.debug(`typeUtils.js: fixType() - Array of objects: ${javaType}`);
          return [javaType, true]; // true indicates array of objects
        }
      } else {
        // Array of primitives
        const typeInfo = getEnhancedType(itemType, itemFormat);
        const javaType = `List<${typeInfo.javaType}>`;
        logger.debug(`typeUtils.js: fixType() - Array of primitives: ${javaType}`);
        return [javaType, false];
      }
    }
    return ['List<Object>', false];
  }
  
  if (!type || type === 'object') {
    // Object type - use schema name
    const schemaName = property.extensions && property.extensions().get('x-parser-schema-id')?.value();
    if (schemaName) {
      const { className } = stripPackageName(schemaName);
      const javaType = _.upperFirst(_.camelCase(className));
      logger.debug(`typeUtils.js: fixType() - Object type: ${javaType}`);
      return [javaType, false];
    }
    return ['Object', false];
  }
  
  // Primitive type
  const typeInfo = getEnhancedType(type, format);
  logger.debug(`typeUtils.js: fixType() - Primitive type: ${typeInfo.javaType}`);
  return [typeInfo.javaType, false];
}

/**
 * Get schema type for JSON schemas (from typeUtils.js)
 */
// function getSchemaType(schema) {
//   const type = schema.type();
//   const format = schema.format();
  
//   if (type === 'array') {
//     const items = schema.items();
//     if (items) {
//       const itemType = getSchemaType(items);
//       return { javaType: `List<${itemType.javaType}>`, printFormat: '%s', sample: '[]' };
//     }
//     return { javaType: 'List<Object>', printFormat: '%s', sample: '[]' };
//   }
  
//   if (type === 'object') {
//     return { javaType: 'Object', printFormat: '%s', sample: 'null' };
//   }
  
//   return getEnhancedType(type, format);
// }

/**
 * Get schema type from AsyncAPI schema object
 */
function getSchemaType(schema) {
  if (!schema) return 'object';
  
  if (schema.type && typeof schema.type === 'function') {
    return schema.type();
  }
  
  if (schema.type) {
    return schema.type;
  }
  
  return 'object';
}

/**
 * Convert string to PascalCase for class names
 * Handles various separators including slashes, dots, braces, underscores, hyphens, and whitespace
 */
function toPascalCase(str) {
  logger.debug('typeUtils.js: toPascalCase() - Converting string to PascalCase');
  if (!str) return '';
  
  // First, remove curly braces (used in path parameters like {userId})
  const cleaned = str.replace(/[{}]/g, '');
  
  // Split by any non-alphanumeric character (slashes, dots, underscores, hyphens, whitespace, etc.)
  const segments = cleaned.split(/[^a-zA-Z0-9]+/);
  
  // Convert each segment to PascalCase and join
  return segments
    .filter(segment => segment.length > 0)
    .map(segment => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join('');
}

/**
 * Convert string to camelCase for field names
 * Handles various separators including slashes, dots, braces, underscores, hyphens, and whitespace
 */
function toCamelCase(str) {
  logger.debug('typeUtils.js: toCamelCase() - Converting string to camelCase');
  if (!str) return '';
  
  // First, remove curly braces (used in path parameters like {userId})
  const cleaned = str.replace(/[{}]/g, '');
  
  // Split by any non-alphanumeric character (slashes, dots, underscores, hyphens, whitespace, etc.)
  const segments = cleaned.split(/[^a-zA-Z0-9]+/);
  
  // Convert to camelCase: first segment lowercase, rest PascalCase
  return segments
    .filter(segment => segment.length > 0)
    .map((segment, index) => {
      if (index === 0) {
        return segment.charAt(0).toLowerCase() + segment.slice(1);
      }
      return segment.charAt(0).toUpperCase() + segment.slice(1);
    })
    .join('');
}

/**
 * Convert to Java class name (from typeUtils.js)
 */
function toJavaClassName(name) {
  return name
    .split(/[^a-zA-Z0-9]/)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('');
}

/**
 * Strip package name from fully qualified schema name
 */
function stripPackageName(dotSeparatedName) {
  // Safety check for non-string input
  if (typeof dotSeparatedName !== 'string') {
    logger.warn(`typeUtils.js: stripPackageName() - Non-string input: ${typeof dotSeparatedName}, value: ${dotSeparatedName}`);
    return { className: 'UnknownSchema' };
  }
  
  // If there is a dot in the schema name, it's probably an Avro schema with a fully qualified name
  if (dotSeparatedName.includes('.')) {
    const parts = dotSeparatedName.split('.');
    const className = parts[parts.length - 1];
    const packageName = parts.slice(0, -1).join('.');
    return { className, packageName };
  }
  
  // For simple names, just return the name as the class name
  return { className: dotSeparatedName };
}

module.exports = {
  getEnhancedType,
  checkPropertyNames,
  getIdentifierName,
  isJavaReservedWord,
  fixType,
  getType: getEnhancedType, // Alias for backward compatibility
  getSchemaType,
  toJavaClassName,
  toPascalCase,
  toCamelCase,
  stripPackageName
}; 
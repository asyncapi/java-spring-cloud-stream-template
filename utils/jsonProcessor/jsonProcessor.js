const { logger } = require('../logger');
const { getSchemaType } = require('../typeUtils');

/**
 * Process JSON schemas from components.schemas
 */
function processJsonSchemas(asyncapi, avroSchemaNames = new Set()) {
  const schemas = [];
  
  const componentsSchemas = asyncapi.components().schemas();
  if (!componentsSchemas || 
      ((typeof componentsSchemas.size === 'number' && componentsSchemas.size === 0) || 
       (typeof componentsSchemas === 'object' && Object.keys(componentsSchemas).length === 0))) {
    return schemas;
  }
  
  const allSchemas = asyncapi.allSchemas();
  if (!allSchemas || typeof allSchemas.values !== 'function') {
    return schemas;
  }
  
  // First pass: collect all schemas and identify inheritance relationships
  const schemaMap = new Map();
  const inheritanceMap = new Map(); // tracks which schemas extend others
  const superClassMap = new Map(); // tracks base class relationships
  const anonymousSchemaToSubClassMap = new Map(); // tracks anonymous schema to subclass mapping

  // Helper function to check if schema name is anonymous
  const isAnonymousSchema = (schemaName) => {
    return schemaName && schemaName.startsWith('<');
  };

  // Helper function to handle allOf inheritance
  const handleAllOfSchema = (schema, schemaName, allOfArray) => {
    let anonymousSchema = null;
    let namedSchema = null;
    
    allOfArray.forEach(innerSchema => {
      const name = innerSchema['x-parser-schema-id'];
      if (isAnonymousSchema(name)) {
        anonymousSchema = name;
      } else {
        namedSchema = name;
      }
    });
    
    if (!anonymousSchema || !namedSchema) {
      logger.warn('Unable to find both an anonymous and a named schema in an allOf schema for:', { schemaName });
      return null;
    } 
    // Set up inheritance relationships
    superClassMap.set(anonymousSchema, namedSchema);
    anonymousSchemaToSubClassMap.set(anonymousSchema, schemaName);
    superClassMap.set(schemaName, namedSchema);
    anonymousSchemaToSubClassMap.set(schemaName, anonymousSchema);
      
    return {
      extendsClass: namedSchema,
      anonymousSchema
    };
  };

  Array.from(allSchemas.values()).forEach(schema => {
    // Use the same schema naming logic as the reference project
    // Prioritize: x-ep-schema-name > x-parser-schema-id > schema.id()
    const schemaName = schema.extensions().get('x-ep-schema-name')?.value() || 
                      schema.extensions().get('x-parser-schema-id')?.value() || 
                      schema.id();
    
    // Skip if this schema is already processed as an Avro schema
    if (avroSchemaNames.has(schemaName)) {
      logger.debug(`Skipping schema ${schemaName} as it's already processed as an Avro schema`);
      return;
    }
    
    // Normalize className (camel-cased from schemaName)
    const getClassName = (name) => {
      if (!name) return 'UnknownSchema';
      const dotIndex = name.lastIndexOf('.');
      let className = dotIndex > 0 ? name.substring(dotIndex + 1) : name;
      className = className.replace(/[_\s]/g, ' ');
      className = className.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join('');
      return className.charAt(0).toUpperCase() + className.slice(1);
    };
    const className = getClassName(schemaName);

    // Normalize packagePath and namespace (from extension or null)
    let packagePath = null;
    let namespace = null;
    if (schema.extensions().get('x-java-package')) {
      packagePath = schema.extensions().get('x-java-package').value().replace(/\./g, '/');
      namespace = schema.extensions().get('x-java-package').value();
    }
    
    const properties = [];
    const required = schema.required && typeof schema.required === 'function' ? schema.required() : [];
    const schemaProperties = schema.properties && typeof schema.properties === 'function'
      ? schema.properties()
      : null;
    
    if (schemaProperties && typeof schemaProperties.values === 'function') {
      const propertyArray = Array.from(schemaProperties.values());
      propertyArray.forEach(prop => {
        properties.push({
          name: prop.id(),
          type: getSchemaType(prop),
          description: prop.description ? prop.description() : '',
          required: Array.isArray(required) ? required.includes(prop.id()) : false
        });
      });
    } else if (schemaProperties && typeof schemaProperties.forEach === 'function') {
      // Try forEach method
      schemaProperties.forEach((prop, propName) => {
        properties.push({
          name: propName,
          type: getSchemaType(prop),
          description: prop.description ? prop.description() : '',
          required: Array.isArray(required) ? required.includes(propName) : false
        });
      });
    } else if (schemaProperties && typeof schemaProperties === 'object') {
      // Handle plain object with property names as keys
      Object.keys(schemaProperties).forEach(propName => {
        const prop = schemaProperties[propName];
        properties.push({
          name: propName,
          type: getSchemaType(prop),
          description: prop.description ? prop.description() : '',
          required: Array.isArray(required) ? required.includes(propName) : false
        });
      });
    }

    // Check for allOf inheritance - access through _json property
    let extendsClass = null;
    const schemaData = schema._json;
    if (schemaData && schemaData.allOf && Array.isArray(schemaData.allOf) && schemaData.allOf.length > 0) {
      // Use the improved allOf handling logic
      const inheritanceInfo = handleAllOfSchema(schema, schemaName, schemaData.allOf);
      if (inheritanceInfo) {
        extendsClass = inheritanceInfo.extendsClass;
        inheritanceMap.set(schemaName, extendsClass);
      } else {
        // Fallback to original logic for edge cases
        const firstRef = schemaData.allOf[0];
        // Check for x-parser-schema-id (resolved references)
        if (firstRef['x-parser-schema-id']) {
          extendsClass = firstRef['x-parser-schema-id'];
          inheritanceMap.set(schemaName, extendsClass);
        } else if (firstRef.$ref) {
          // Also check for $ref (unresolved references)
          const refName = firstRef.$ref.split('/').pop();
          extendsClass = refName;
          inheritanceMap.set(schemaName, extendsClass);
        }
      }
    }

    // Add description if available
    const description = schema.description ? schema.description() : '';

    schemaMap.set(schemaName, {
      name: schemaName,
      namespace,
      packagePath,
      className,
      properties: Array.isArray(properties) ? properties : [],
      required,
      extendsClass,
      isAvro: false,
      description,
      schema
    });
  });

  // Second pass: add schemas with dependencies in correct order
  const addSchemaWithDependencies = (schemaName) => {
    const schema = schemaMap.get(schemaName);
    if (!schema) {
      logger.warn(`Schema ${schemaName} not found in schema map`);
      return;
    }
    
    // If this schema extends another class, add the parent first
    if (schema.extendsClass && !schemas.find(s => s.name === schema.extendsClass)) {
      addSchemaWithDependencies(schema.extendsClass);
    }
    
    // Add this schema if not already added
    if (!schemas.find(s => s.name === schemaName)) {
      schemas.push(schema);
    }
  };

  // Add all schemas in dependency order
  Array.from(schemaMap.keys()).forEach(schemaName => {
    addSchemaWithDependencies(schemaName);
  });

  return schemas;
}

module.exports = {
  processJsonSchemas
}; 
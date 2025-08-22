const _ = require('lodash');
const { logger } = require('../logger');
const { stripPackageName } = require('../typeUtils');

class SchemaModel {
  constructor() {
    this.superClassMap = new Map();
    this.anonymousSchemaToSubClassMap = new Map();
    this.modelClassMap = new Map();
    this.nameToSchemaMap = new Map();
    this.javaKeywords = this.initReservedWords();
  }

  /**
   * Initialize Java reserved words set
   */
  initReservedWords() {
    const keywords = new Set([
      'abstract', 'assert', 'boolean', 'break', 'byte', 'case', 'catch', 'char', 'class', 'const',
      'continue', 'default', 'do', 'double', 'else', 'enum', 'extends', 'final', 'finally', 'float',
      'for', 'if', 'goto', 'implements', 'import', 'instanceof', 'int', 'interface', 'long', 'native',
      'new', 'package', 'private', 'protected', 'public', 'return', 'short', 'static', 'strictfp',
      'super', 'switch', 'synchronized', 'this', 'throw', 'throws', 'transient', 'try', 'void', 'volatile', 'while'
    ]);
    return keywords;
  }

  /**
   * Get model class for a schema
   */
  getModelClass({ schema, schemaName }) {
    logger.debug(`schemaModel.js: getModelClass() - Getting model class for ${schemaName}`);
    
    let modelClass;
    if (schema) {
      const parserSchemaName = schema.extensions && schema.extensions().get('x-parser-schema-id')?.value();
      // Try to use x-parser-schema-id as key
      modelClass = this.modelClassMap.get(parserSchemaName);
      if (modelClass && modelClass.getClassName().startsWith('Anonymous')) {
        // If we translated this schema from the map using an anonymous schema key, we have no idea what the name should be, so we use the one provided directly from the source - not the generator.
        // Otherwise, if we translated this schema from the map using a known schema (the name of the schema was picked out correctly by the generator), use that name.
        modelClass.setClassName(_.upperFirst(this.isAnonymousSchema(parserSchemaName) ? schemaName : parserSchemaName));
      }
    }
    // Using x-parser-schema-id didn't work for us, fall back to trying to get at least something using the provided name.
    if (!modelClass) {
      modelClass = this.modelClassMap.get(schemaName) || this.modelClassMap.get(_.camelCase(schemaName));
    }
    
    logger.debug(`schemaModel.js: getModelClass() - Returning model class for ${schemaName}: ${modelClass ? 'found' : 'not found'}`);
    return modelClass;
  }

  /**
   * Setup super class map for inheritance relationships
   */
  setupSuperClassMap(asyncapi) {
    if (this.superClassMap.size > 0) {
      return;
    }
    
    logger.debug('schemaModel.js: setupSuperClassMap() - Setting up inheritance relationships');
    
    const allSchemas = asyncapi.allSchemas().all();
    if (!allSchemas) return;
    
    // allSchemas is a Map, so we need to iterate over entries properly
    allSchemas.forEach((schema, schemaName) => {
      if (typeof schemaName !== 'string') {
        // logger.debug(`Skipping non-string schema key: ${schemaName}`);
        return;
      }
      logger.debug(`schemaModel.js: setupSuperClassMap() - Processing schema: ${schemaName}`);
      
      // Check for allOf inheritance
      if (schema.allOf && typeof schema.allOf === 'function') {
        const allOf = schema.allOf();
        if (allOf && allOf.length > 0) {
          this.handleAllOfSchema(schema, schemaName, allOf);
        }
      }
    });
    
    logger.debug('schemaModel.js: setupSuperClassMap() - Super class map:', this.superClassMap);
  }

  /**
   * Handle allOf schema inheritance
   */
  handleAllOfSchema(schema, schemaName, allOfArray) {
    logger.debug(`schemaModel.js: handleAllOfSchema() - Handling allOf for ${schemaName}`);
    
    let anonymousSchema = null;
    let namedSchema = null;
    
    allOfArray.forEach(innerSchema => {
      const name = innerSchema.extensions && innerSchema.extensions().get('x-parser-schema-id')?.value();
      if (this.isAnonymousSchema(name)) {
        anonymousSchema = name;
      } else {
        namedSchema = name;
      }
    });
    
    if (!anonymousSchema || !namedSchema) {
      logger.warn(`schemaModel.js: handleAllOfSchema() - Unable to find both an anonymous and a named schema in allOf for ${schemaName}`);
      return;
    }
    
    // Set up inheritance relationships
    this.superClassMap.set(anonymousSchema, namedSchema);
    this.anonymousSchemaToSubClassMap.set(anonymousSchema, schemaName);
    this.superClassMap.set(schemaName, namedSchema);
    this.anonymousSchemaToSubClassMap.set(schemaName, anonymousSchema);
    
    logger.debug(`schemaModel.js: handleAllOfSchema() - Set up inheritance: ${schemaName} extends ${namedSchema}`);
  }

  /**
   * Setup model class map
   */
  setupModelClassMap(asyncapi) {
    if (this.modelClassMap.size > 0) {
      return;
    }
    
    logger.debug('schemaModel.js: setupModelClassMap() - Setting up model class map');
    
    // Use the same logic as collectAllSchemas to ensure consistent schema names
    const allSchemas = new Map();
    
    // 1. Collect from components.schemas (prefer these names)
    const componentsSchemas = asyncapi.components().schemas();
    if (componentsSchemas && typeof componentsSchemas.forEach === 'function') {
      componentsSchemas.forEach((schema, componentName) => {
        // The AsyncAPI library sometimes returns numeric keys instead of original component names
        // We need to map them back to the original names using the _json structure
        let originalComponentName = componentName;
        const schemaId = schema.id && typeof schema.id === 'function' ? schema.id() : null;
        
        if (asyncapi._json && asyncapi._json.components && asyncapi._json.components.schemas) {
          // Find the schema with matching ID to get the original key
          // NOTE: Handle cases where multiple schemas might have the same $id (which is invalid but happens)
          let foundMatch = false;
          Object.keys(asyncapi._json.components.schemas).forEach(jsonKey => {
            const jsonSchema = asyncapi._json.components.schemas[jsonKey];
            
            // First try x-parser-schema-id (most reliable)
            if (schemaId && jsonSchema['x-parser-schema-id'] === schemaId) {
              originalComponentName = jsonKey;
              foundMatch = true;
              logger.debug(`schemaModel.js: setupModelClassMap() - Mapped ${componentName} to ${originalComponentName} via x-parser-schema-id`);
            }
          });
          
          // If no x-parser-schema-id match found, fall back to position-based mapping for numeric keys
          if (!foundMatch && (typeof componentName === 'number' || (typeof componentName === 'string' && componentName.match(/^\d+$/)))) {
            const schemaKeys = Object.keys(asyncapi._json.components.schemas);
            const index = parseInt(componentName);
            if (index < schemaKeys.length) {
              originalComponentName = schemaKeys[index];
              logger.debug(`schemaModel.js: setupModelClassMap() - Mapped numeric ${componentName} to ${originalComponentName} by position`);
            }
          }
          // If componentName is already a string name, use it as-is
          else if (!foundMatch && typeof componentName === 'string' && componentName.length > 0 && !componentName.match(/^\d+$/)) {
            logger.debug(`schemaModel.js: setupModelClassMap() - Using componentName as-is: ${componentName} (no ID match found)`);
          }
        }
        

        allSchemas.set(originalComponentName, schema);
      });
    }
    
    // Register all schemas with consistent names
    allSchemas.forEach((schema, schemaName) => {
      logger.debug(`schemaModel.js: setupModelClassMap() - Processing schema: ${schemaName}, type: ${schema.type ? schema.type() : 'unknown'}`);
      this.registerSchemaNameToModelClass(schema, schemaName, asyncapi);
      this.nameToSchemaMap.set(schemaName, schema);
    });
    
    logger.debug('schemaModel.js: setupModelClassMap() - Model class map size:', this.modelClassMap.size);
  }

  /**
   * Map schema ID to component name
   */
  mapSchemaIdToComponentName(schemaId, asyncapi) {
    logger.debug(`schemaModel.js: mapSchemaIdToComponentName() - Mapping schema ID: ${schemaId}`);
    
    // First, try to find the schema in components.schemas
    const componentsSchemas = asyncapi.components().schemas();
    if (componentsSchemas) {
      for (const [schemaName, schema] of componentsSchemas.entries()) {
        const parserSchemaId = schema.extensions && schema.extensions().get('x-parser-schema-id')?.value();
        if (parserSchemaId === schemaId) {
          logger.debug(`schemaModel.js: mapSchemaIdToComponentName() - Found schema: ${schemaName}`);
          return schemaName;
        }
      }
    }
    
    // If not found in components, return the schemaId as is
    logger.debug(`schemaModel.js: mapSchemaIdToComponentName() - Not found, returning schemaId: ${schemaId}`);
    return schemaId;
  }

  /**
   * Check if schema name is anonymous
   */
  isAnonymousSchema(schemaName) {
    return schemaName && schemaName.startsWith('<');
  }

  /**
   * Register schema name to model class
   */
  registerSchemaNameToModelClass(schema, schemaName, asyncapi) {
    let modelClass = this.modelClassMap.get(schemaName);
    if (!modelClass) {
      modelClass = new ModelClass();
    }

    if (this.isAnonymousSchema(schemaName)) {
      this.handleAnonymousSchemaForAllOf(modelClass, schemaName);
    }
    
    // Check if this is a top-level schema (not an inner class)
    let nonInnerClassSchemas = [];
    if (asyncapi.components && typeof asyncapi.components === 'function') {
      const schemasObj = asyncapi.components().schemas();
      if (schemasObj && typeof schemasObj === 'object') {
        nonInnerClassSchemas = Array.from(schemasObj.values()).map(schema => schema._meta.id)
      }
    }
    if (nonInnerClassSchemas.includes(schemaName)) {
      modelClass.setCanBeInnerClass(false);
    }

    const classNameAndLocation = stripPackageName(schemaName);
    let className = classNameAndLocation.className;
    const javaPackage = classNameAndLocation.javaPackage;
    
    if (schema.extensions && schema.extensions().get('x-ep-schema-name')) {
      className = schema.extensions().get('x-ep-schema-name').value();
    }
    
    modelClass.setJavaPackage(javaPackage);
    modelClass.setClassName(className);
    
    logger.debug(`schemaModel.js: registerSchemaNameToModelClass() - Schema: ${schemaName}, Class: ${modelClass.getClassName()}, Super: ${modelClass.getSuperClassName()}, Package: ${javaPackage}`);
    
    this.modelClassMap.set(schemaName, modelClass);
  }

  /**
   * Get anonymous schema for reference
   */
  getAnonymousSchemaForRef(realSchemaName) {
    // During our allOf parsing, we found this real schema to anon-schema association
    const anonSchema = this.anonymousSchemaToSubClassMap.get(realSchemaName);
    return anonSchema ? this.nameToSchemaMap.get(anonSchema) : undefined;
  }

  /**
   * Handle anonymous schema for allOf
   */
  handleAnonymousSchemaForAllOf(modelClass, schemaName) {
    const subclassName = this.anonymousSchemaToSubClassMap.get(schemaName);
    if (subclassName) {
      modelClass.setSuperClassName(this.superClassMap.get(schemaName));
      // Be sure the anonymous modelClass and the named modelClass are updated with the superclass information
      // We dont want the anonymous schema because the class name won't be correct if it's a $ref, so if the modelClass exists, update that one, if it doesn't we'll make it
      const existingModelClass = this.modelClassMap.get(subclassName);
      if (existingModelClass) {
        existingModelClass.setSuperClassName(this.superClassMap.get(schemaName));
      }
      return subclassName;
    }
    return schemaName;
  }

  /**
   * Reset all maps (for testing)
   */
  reset() {
    this.superClassMap.clear();
    this.anonymousSchemaToSubClassMap.clear();
    this.modelClassMap.clear();
    this.nameToSchemaMap.clear();
  }
}

/**
 * ModelClass for representing Java class information
 */
class ModelClass {
  constructor() {
    this.innerClass = true;
    this.className = null;
    this.originalName = null; // NEW: store original schema name
    this.superClassName = null;
    this.javaPackage = null;
  }

  getClassName() {
    return this.className;
  }

  setClassName(originalName) {
    this.className = this.fixClassName(originalName);
  }

  getOriginalName() { // NEW: getter for original name
    return this.originalName;
  }

  setOriginalName(originalName) { // NEW: setter for original name
    this.originalName = originalName;
  }

  getSuperClassName() {
    return this.superClassName;
  }

  setSuperClassName(originalName) {
    this.superClassName = this.fixClassName(originalName);
  }

  getJavaPackage() {
    return this.javaPackage;
  }

  setJavaPackage(javaPackage) {
    this.javaPackage = javaPackage;
  }

  isSubClass() {
    return this.superClassName !== undefined;
  }

  fixClassName(originalName) {
    return _.upperFirst(_.camelCase(originalName));
  }

  setCanBeInnerClass(innerClass) {
    this.innerClass = innerClass;
  }

  canBeInnerClass() {
    return this.innerClass;
  }
}

module.exports = { SchemaModel, ModelClass }; 
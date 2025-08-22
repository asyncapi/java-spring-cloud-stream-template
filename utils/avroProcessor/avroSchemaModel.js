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
    
    logger.debug(`schemaModel.js: getModelClass() - Returning model class for ${schemaName}`);
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
    
    const allSchemas = asyncapi.allSchemas().all()
    if (!allSchemas || allSchemas.length === 0) return;
    
    // Register all schemas recursively as a flat map of name -> ModelClass
    // allSchemas is a Map, so we need to iterate over entries properly
    allSchemas.forEach((schema, schemaName) => {
      // Handle both string and numeric schema keys
      let name;
      if (typeof schemaName === 'string') {
        name = schema.extensions().get('x-ep-schema-name')?.value() || schema.id();
      } else {
        // For numeric keys, try to get name from schema extensions or id
        name = schema.extensions().get('x-ep-schema-name')?.value() || schema.id();
        
        if (!name) {
          logger.debug(`Skipping schema with numeric key ${schemaName} and no identifiable name`);
          return;
        }
      }
      logger.debug(`schemaModel.js: setupModelClassMap() - Processing schema: ${name}, type: ${schema.type ? schema.type() : 'unknown'}`);
      this.registerSchemaNameToModelClass(schema, name, asyncapi);
      this.nameToSchemaMap.set(name, schema);
    });
    
    logger.debug('schemaModel.js: setupModelClassMap() - Model class map size:', this.modelClassMap.size);
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
        nonInnerClassSchemas = Array.from(schemasObj.keys());
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
    modelClass.setOriginalName(schemaName); // NEW: store original schema name
    
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
    // For AVRO schemas, the originalName should already be the class name part (e.g., "JobOrder" from "com.example.api.jobOrder.JobOrder")
    if (!originalName) return 'UnknownSchema';
    
    // If the name contains dots, it's a full schema name, so we need to extract the class name
    if (originalName.includes('.')) {
      const lastDotIndex = originalName.lastIndexOf('.');
      originalName = originalName.substring(lastDotIndex + 1);
    }
    
    // Remove special characters and convert to PascalCase
    let className = originalName.replace(/[^a-zA-Z0-9]/g, '');
    className = className.charAt(0).toUpperCase() + className.slice(1);
    
    return className;
  }

  setCanBeInnerClass(innerClass) {
    this.innerClass = innerClass;
  }

  canBeInnerClass() {
    return this.innerClass;
  }
}

module.exports = { SchemaModel, ModelClass }; 
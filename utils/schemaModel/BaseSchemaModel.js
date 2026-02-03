const _ = require('lodash');
const { logger } = require('../logger');
const { stripPackageName } = require('../typeUtils');

/**
 * Base ModelClass for representing Java class information
 * Subclasses should override fixClassName() for format-specific behavior
 */
class BaseModelClass {
  constructor() {
    this.innerClass = true;
    this.className = null;
    this.originalName = null;
    this.superClassName = null;
    this.javaPackage = null;
  }

  getClassName() {
    return this.className;
  }

  setClassName(originalName) {
    this.className = this.fixClassName(originalName);
  }

  getOriginalName() {
    return this.originalName;
  }

  setOriginalName(originalName) {
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

  /**
   * Convert original name to Java class name format
   * Subclasses should override this for format-specific behavior
   */
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

/**
 * Base SchemaModel for managing schema-to-class mappings
 * Subclasses should override setupModelClassMap() and registerSchemaNameToModelClass()
 */
class BaseSchemaModel {
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
    logger.debug(`BaseSchemaModel: getModelClass() - Getting model class for ${schemaName}`);

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

    logger.debug(`BaseSchemaModel: getModelClass() - Returning model class for ${schemaName}: ${modelClass ? 'found' : 'not found'}`);
    return modelClass;
  }

  /**
   * Setup super class map for inheritance relationships
   */
  setupSuperClassMap(asyncapi) {
    if (this.superClassMap.size > 0) {
      return;
    }

    logger.debug('BaseSchemaModel: setupSuperClassMap() - Setting up inheritance relationships');

    const allSchemas = asyncapi.allSchemas().all();
    if (!allSchemas) return;

    // allSchemas is a Map, so we need to iterate over entries properly
    allSchemas.forEach((schema, schemaName) => {
      if (typeof schemaName !== 'string') {
        return;
      }
      logger.debug(`BaseSchemaModel: setupSuperClassMap() - Processing schema: ${schemaName}`);

      // Check for allOf inheritance
      if (schema.allOf && typeof schema.allOf === 'function') {
        const allOf = schema.allOf();
        if (allOf && allOf.length > 0) {
          this.handleAllOfSchema(schema, schemaName, allOf);
        }
      }
    });

    logger.debug('BaseSchemaModel: setupSuperClassMap() - Super class map:', this.superClassMap);
  }

  /**
   * Handle allOf schema inheritance
   */
  handleAllOfSchema(schema, schemaName, allOfArray) {
    logger.debug(`BaseSchemaModel: handleAllOfSchema() - Handling allOf for ${schemaName}`);

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
      logger.warn(`BaseSchemaModel: handleAllOfSchema() - Unable to find both an anonymous and a named schema in allOf for ${schemaName}`);
      return;
    }

    // Set up inheritance relationships
    this.superClassMap.set(anonymousSchema, namedSchema);
    this.anonymousSchemaToSubClassMap.set(anonymousSchema, schemaName);
    this.superClassMap.set(schemaName, namedSchema);
    this.anonymousSchemaToSubClassMap.set(schemaName, anonymousSchema);

    logger.debug(`BaseSchemaModel: handleAllOfSchema() - Set up inheritance: ${schemaName} extends ${namedSchema}`);
  }

  /**
   * Setup model class map - subclasses must override this
   */
  setupModelClassMap(_asyncapi) {
    throw new Error('setupModelClassMap() must be implemented by subclass');
  }

  /**
   * Check if schema name is anonymous
   */
  isAnonymousSchema(schemaName) {
    return schemaName && schemaName.startsWith('<');
  }

  /**
   * Register schema name to model class - subclasses must override this
   */
  registerSchemaNameToModelClass(_schema, _schemaName, _asyncapi) {
    throw new Error('registerSchemaNameToModelClass() must be implemented by subclass');
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

module.exports = { BaseSchemaModel, BaseModelClass, stripPackageName, logger, _ };

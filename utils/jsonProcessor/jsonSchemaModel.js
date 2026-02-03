const { BaseSchemaModel, BaseModelClass, stripPackageName, logger, _ } = require('../schemaModel/BaseSchemaModel');

/**
 * ModelClass for representing Java class information (JSON-specific)
 * Uses default fixClassName from base class (lodash upperFirst + camelCase)
 */
class ModelClass extends BaseModelClass {
  // Uses default fixClassName from BaseModelClass:
  // return _.upperFirst(_.camelCase(originalName));
}

/**
 * SchemaModel for JSON schema processing
 * Extends BaseSchemaModel with JSON-specific schema registration
 */
class SchemaModel extends BaseSchemaModel {
  /**
   * Setup model class map (JSON-specific implementation)
   */
  setupModelClassMap(asyncapi) {
    if (this.modelClassMap.size > 0) {
      return;
    }

    logger.debug('JsonSchemaModel: setupModelClassMap() - Setting up model class map');

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
              logger.debug(`JsonSchemaModel: setupModelClassMap() - Mapped ${componentName} to ${originalComponentName} via x-parser-schema-id`);
            }
          });

          // If no x-parser-schema-id match found, fall back to position-based mapping for numeric keys
          if (!foundMatch && (typeof componentName === 'number' || (typeof componentName === 'string' && componentName.match(/^\d+$/)))) {
            const schemaKeys = Object.keys(asyncapi._json.components.schemas);
            const index = parseInt(componentName, 10);
            if (index < schemaKeys.length) {
              originalComponentName = schemaKeys[index];
              logger.debug(`JsonSchemaModel: setupModelClassMap() - Mapped numeric ${componentName} to ${originalComponentName} by position`);
            }
          } else if (!foundMatch && typeof componentName === 'string' && componentName.length > 0 && !componentName.match(/^\d+$/)) {
            // If componentName is already a string name, use it as-is
            logger.debug(`JsonSchemaModel: setupModelClassMap() - Using componentName as-is: ${componentName} (no ID match found)`);
          }
        }

        allSchemas.set(originalComponentName, schema);
      });
    }

    // Register all schemas with consistent names
    allSchemas.forEach((schema, schemaName) => {
      logger.debug(`JsonSchemaModel: setupModelClassMap() - Processing schema: ${schemaName}, type: ${schema.type ? schema.type() : 'unknown'}`);
      this.registerSchemaNameToModelClass(schema, schemaName, asyncapi);
      this.nameToSchemaMap.set(schemaName, schema);
    });

    logger.debug('JsonSchemaModel: setupModelClassMap() - Model class map size:', this.modelClassMap.size);
  }

  /**
   * Map schema ID to component name
   */
  mapSchemaIdToComponentName(schemaId, asyncapi) {
    logger.debug(`JsonSchemaModel: mapSchemaIdToComponentName() - Mapping schema ID: ${schemaId}`);

    // First, try to find the schema in components.schemas
    const componentsSchemas = asyncapi.components().schemas();
    if (componentsSchemas) {
      for (const [schemaName, schema] of componentsSchemas.entries()) {
        const parserSchemaId = schema.extensions && schema.extensions().get('x-parser-schema-id')?.value();
        if (parserSchemaId === schemaId) {
          logger.debug(`JsonSchemaModel: mapSchemaIdToComponentName() - Found schema: ${schemaName}`);
          return schemaName;
        }
      }
    }

    // If not found in components, return the schemaId as is
    logger.debug(`JsonSchemaModel: mapSchemaIdToComponentName() - Not found, returning schemaId: ${schemaId}`);
    return schemaId;
  }

  /**
   * Register schema name to model class (JSON-specific implementation)
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
        nonInnerClassSchemas = Array.from(schemasObj.values()).map(s => s._meta.id);
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

    logger.debug(`JsonSchemaModel: registerSchemaNameToModelClass() - Schema: ${schemaName}, Class: ${modelClass.getClassName()}, Super: ${modelClass.getSuperClassName()}, Package: ${javaPackage}`);

    this.modelClassMap.set(schemaName, modelClass);
  }
}

module.exports = { SchemaModel, ModelClass };

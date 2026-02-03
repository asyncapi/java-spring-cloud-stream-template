const { BaseSchemaModel, BaseModelClass, stripPackageName, logger, _ } = require('../schemaModel/BaseSchemaModel');

/**
 * ModelClass for representing Java class information (Avro-specific)
 * Overrides fixClassName for Avro schema naming conventions
 */
class ModelClass extends BaseModelClass {
  /**
   * Convert original name to Java class name format (Avro-specific)
   * For AVRO schemas, handles full package names like "com.example.api.jobOrder.JobOrder"
   */
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
}

/**
 * SchemaModel for Avro schema processing
 * Extends BaseSchemaModel with Avro-specific schema registration
 */
class SchemaModel extends BaseSchemaModel {
  /**
   * Setup model class map (Avro-specific implementation)
   */
  setupModelClassMap(asyncapi) {
    if (this.modelClassMap.size > 0) {
      return;
    }

    logger.debug('AvroSchemaModel: setupModelClassMap() - Setting up model class map');

    const allSchemas = asyncapi.allSchemas().all();
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
      logger.debug(`AvroSchemaModel: setupModelClassMap() - Processing schema: ${name}, type: ${schema.type ? schema.type() : 'unknown'}`);
      this.registerSchemaNameToModelClass(schema, name, asyncapi);
      this.nameToSchemaMap.set(name, schema);
    });

    logger.debug('AvroSchemaModel: setupModelClassMap() - Model class map size:', this.modelClassMap.size);
  }

  /**
   * Register schema name to model class (Avro-specific implementation)
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
    modelClass.setOriginalName(schemaName);

    logger.debug(`AvroSchemaModel: registerSchemaNameToModelClass() - Schema: ${schemaName}, Class: ${modelClass.getClassName()}, Super: ${modelClass.getSuperClassName()}, Package: ${javaPackage}`);

    this.modelClassMap.set(schemaName, modelClass);
  }
}

module.exports = { SchemaModel, ModelClass };

const ModelClass = require('./modelClass.js');
const debugApplicationModel = require('debug')('applicationModel');
const _ = require('lodash');
const instanceMap = new Map();

class ApplicationModel {
  constructor(caller) {
    this.caller = caller;
    debugApplicationModel(`constructor for ${caller} ++++++++++++++++++++++++++++++++++++++++++`);
    instanceMap.set(caller, this);
    debugApplicationModel(instanceMap);
  }

  getModelClass({schema, schemaName}) {
    debugApplicationModel(`getModelClass for caller ${this.caller} schema ${schemaName}`);
    this.setupSuperClassMap();
    this.setupModelClassMap();
    let modelClass;
    if (schema) {
      let parserSchemaName = schema.ext('x-parser-schema-id');
      // Try to use x-parser-schema-id as key
      modelClass = this.modelClassMap[parserSchemaName];
      if (modelClass && _.startsWith(modelClass.getClassName(), 'Anonymous')) {
        // If we translated this schema from the map using an anonymous schema key, we have no idea what the name should be, so we use the one provided directly from the source - not the generator.
        // If we translated this schema from the map using a known schema (the name of the schema was picked out correctly by the generator), use that name.
        modelClass.setClassName(_.upperFirst(this.isAnonymousSchema(parserSchemaName) ? schemaName : parserSchemaName));
      }
    }
    // Using x-parser-schema-id didn't work for us, fall back to trying to get at least something using the provided name.
    if (!modelClass) {
      modelClass = this.modelClassMap[schemaName];
    }
    debugApplicationModel(`returning modelClass for caller ${this.caller} ${schemaName}`);
    debugApplicationModel(modelClass);
    return modelClass;
  }

  getSchema(schemaName) {
    return ApplicationModel.asyncapi.components().schema(schemaName);
  }

  setupSuperClassMap() {
    if (!this.superClassMap) {
      this.superClassMap = new Map();
      this.anonymousSchemaToSubClassMap = new Map();
      debugApplicationModel('-------- SCHEMAS -------------');
      debugApplicationModel(ApplicationModel.asyncapi.allSchemas());
      ApplicationModel.asyncapi.allSchemas().forEach((schema, schemaName) => {
        debugApplicationModel(`${schemaName}:`);
        debugApplicationModel(schema);
        const allOf = schema.allOf();
        if (allOf) {
          this.handleAllOfSchema(schema, schemaName, allOf);
        }
      });
      debugApplicationModel('-----------------------------');
      debugApplicationModel('superclassMap:');
      debugApplicationModel(this.superClassMap);
      debugApplicationModel('anonymousSchemaToSubClassMap:');
      debugApplicationModel(this.anonymousSchemaToSubClassMap);
    }
  }

  handleAllOfSchema(schema, schemaName, allOfSchema) {
    let anonymousSchema;
    let namedSchema;
    allOfSchema.forEach(innerSchema => {
      debugApplicationModel('=== allOf inner schema: ===');
      debugApplicationModel(innerSchema);
      debugApplicationModel('===========================');
      const name = innerSchema._json['x-parser-schema-id'];
      if (this.isAnonymousSchema(name)) {
        anonymousSchema = name;
      } else {
        namedSchema = name;
      }
    });
    if (!anonymousSchema || !namedSchema) {
      console.log('Warning: Unable to find both an anonymous and a named schema in an allOf schema.');
      console.log(schema);
    } else {
      this.superClassMap[anonymousSchema] = namedSchema;
      this.anonymousSchemaToSubClassMap[anonymousSchema] = schemaName;
      this.superClassMap[schemaName] = namedSchema;
      this.anonymousSchemaToSubClassMap[schemaName] = anonymousSchema;
    }
  }  

  setupModelClassMap() {
    if (!this.modelClassMap) {
      this.modelClassMap = new Map();
      this.nameToSchemaMap = new Map();
      ApplicationModel.asyncapi.allSchemas().forEach((schema, name) => {
        this.registerSchemaNameToModelClass(schema, name);
        this.nameToSchemaMap[name] = schema;
      });

      ApplicationModel.asyncapi.allSchemas().forEach((schema, schemaName) => {
        // debugApplicationModel(`setupModelClassMap ${schemaName} type ${schema.type()}`);

        this.checkProperties(schema);

        const allOf = schema.allOf();
        debugApplicationModel('allOf:');
        debugApplicationModel(allOf);
        if (allOf) {
          allOf.forEach(innerSchema => {
            const name = innerSchema.ext('x-parser-schema-id');
            if (this.isAnonymousSchema(name) && innerSchema.type() === 'object') {
              this.registerSchemaNameToModelClass(innerSchema, schemaName);
            }
          });
        }
      });
      // debugApplicationModel('modelClassMap:');
      // debugApplicationModel(this.modelClassMap);
    }
  }

  checkProperties(schema) {
    if (!!Object.keys(schema.properties()).length) {
      // Each property name is the name of a schema. It should also have an x-parser-schema-id name. We'll be adding duplicate mappings (two mappings to the same model class) since the anon schemas do have names
      Object.keys(schema.properties()).forEach(property => {
        const innerSchema = schema.properties()[property];
        const innerSchemaParserId = innerSchema.ext("x-parser-schema-id");
        const existingModelClass = this.modelClassMap[innerSchemaParserId];
        if (existingModelClass) {
          this.modelClassMap[property] = existingModelClass;
        } else {
          this.registerSchemaNameToModelClass(innerSchema, property);
        }
      });
    }
  }

  isAnonymousSchema(schemaName) {
    return schemaName.startsWith('<');
  }

  registerSchemaNameToModelClass(schema, schemaName) {
    let modelClass = this.modelClassMap[schemaName];
    if (!this.modelClassMap[schemaName]) {
      modelClass = new ModelClass();
    }

    let tentativeClassName = schemaName;
    if (this.isAnonymousSchema(schemaName)) {
      tentativeClassName = this.handleAnonymousSchemaForAllOf(modelClass, schemaName);
    }
    tentativeClassName = this.stripPackageName(modelClass, schemaName);

    const nonInnerClassSchemas = Object.keys(ApplicationModel.asyncapi._json.components?.schemas || {});
    if (nonInnerClassSchemas.includes(schemaName)) {
      modelClass.setCanBeInnerClass(false);
    }
    modelClass.setClassName(tentativeClassName);
    // debugApplicationModel(`schemaName ${schemaName} className: ${modelClass.getClassName()} super: ${modelClass.getSuperClassName()} javaPackage: ${javaPackage}`);
    this.modelClassMap[schemaName] = modelClass;
    debugApplicationModel(`Added ${schemaName}`);
    debugApplicationModel(modelClass);
  }

  getAnonymousSchemaForRef(realSchemaName) {
    // During our allOf parsing, we found this real schema to anon-schema association
    const anonSchema = this.anonymousSchemaToSubClassMap[realSchemaName];
    if (anonSchema) {
      const foundSchema = this.nameToSchemaMap[anonSchema]    
      return foundSchema;
    }  
    return undefined;
  }

  handleAnonymousSchemaForAllOf(modelClass, schemaName) {
    const subclassName = this.anonymousSchemaToSubClassMap[schemaName];
    if (subclassName) {
      modelClass.setSuperClassName(this.superClassMap[schemaName]);
      // If we make it here, we need to be sure that the anonymous modelClass and the named modelClass is updated with the superclass information
      // We dont want the anonymous schema because the class name won't be correct if it's a $ref, so if the modelClass exists, update that one, if it doesn't we're making it now
      const existingModelClass = this.modelClassMap[subclassName];
      if (existingModelClass) {
        existingModelClass.setSuperClassName(this.superClassMap[schemaName]);
        modelClass = existingModelClass;
      }
      return subclassName;
    }
    return schemaName;
  }

  stripPackageName(modelClass, schemaName) {
    // If there is a dot in the schema name, it's probably an Avro schema with a fully qualified name (including the namespace.)
    const indexOfDot = schemaName.lastIndexOf('.');
    if (indexOfDot > 0) {
      const javaPackage = schemaName.substring(0, indexOfDot);
      modelClass.setJavaPackage(javaPackage);
      return schemaName.substring(indexOfDot + 1);
    }
    return schemaName;
  }

  reset() {
    instanceMap.forEach((val) => {
      val.superClassMap = null;
      val.anonymousSchemaToSubClassMap = null;
      val.modelClassMap = null;
      val.nameToSchemaMap = null;
    });
  }
}

module.exports = ApplicationModel;

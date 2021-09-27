const ModelClass = require('./modelClass.js');
const debugApplicationModel = require('debug')('applicationModel');
const instanceMap = new Map();

class ApplicationModel {
  constructor(caller) {
    this.caller = caller;
    debugApplicationModel(`constructor for ${caller} ++++++++++++++++++++++++++++++++++++++++++`);
    instanceMap.set(caller, this);
    debugApplicationModel(instanceMap);
  }

  getModelClass(schemaName) {
    debugApplicationModel(`getModelClass for caller ${this.caller} schema ${schemaName}`);
    this.setupSuperClassMap();
    this.setupModelClassMap();
    const modelClass = this.modelClassMap[schemaName];
    debugApplicationModel(`returning modelClass for  caller ${this.caller} ${schemaName}`);
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
    }
  }  

  setupModelClassMap() {
    if (!this.modelClassMap) {
      this.modelClassMap = new Map();
      ApplicationModel.asyncapi.allSchemas().forEach((schema, schemaName) => {
        debugApplicationModel(`setupModelClassMap ${schemaName} type ${schema.type()}`);
        const allOf = schema.allOf();
        debugApplicationModel('allOf:');
        debugApplicationModel(allOf);
        if (allOf) {
          allOf.forEach(innerSchema => {
            const name = innerSchema._json['x-parser-schema-id'];
            if (this.isAnonymousSchema(name) && innerSchema.type() === 'object') {
              this.addSchemaToMap(innerSchema, schemaName);
            }
          });
        } else {
          this.addSchemaToMap(schema, schemaName);
        }
      });
      debugApplicationModel('modelClassMap:');
      debugApplicationModel(this.modelClassMap);
    }
  }

  isAnonymousSchema(schemaName) {
    return schemaName.startsWith('<');
  }

  addSchemaToMap(schema, schemaName) {
    const modelClass = new ModelClass();
    let tentativeClassName = schemaName;
    if (this.isAnonymousSchema(schemaName)) {
      // It's an anonymous schema. It might be a subclass...
      const subclassName = this.anonymousSchemaToSubClassMap[schemaName];
      if (subclassName) {
        tentativeClassName = subclassName;
        modelClass.setSuperClassName(this.superClassMap[schemaName]);
      }
    }
    // If there is a dot in the schema name, it's probably an Avro schema with a fully qualified name (including the namespace.)
    const indexOfDot = schemaName.lastIndexOf('.');
    let javaPackage;
    if (indexOfDot > 0) {
      javaPackage = schemaName.substring(0, indexOfDot);
      tentativeClassName = schemaName.substring(indexOfDot + 1);
      modelClass.setJavaPackage(javaPackage);
    }
    modelClass.setClassName(tentativeClassName);
    debugApplicationModel(`schemaName ${schemaName} className: ${modelClass.getClassName()} super: ${modelClass.getSuperClassName()} javaPackage: ${javaPackage}`);
    this.modelClassMap[schemaName] = modelClass;
    debugApplicationModel(`Added ${schemaName}`);
    debugApplicationModel(modelClass);
  }

  reset() {
    instanceMap.forEach((val) => {
      val.superClassMap = null;
      val.anonymousSchemaToSubClassMap = null;
      val.modelClassMap = null;
    });
  }
}

module.exports = ApplicationModel;

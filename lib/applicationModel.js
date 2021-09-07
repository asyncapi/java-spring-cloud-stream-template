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
  };

  getSchema(schemaName) {
    //debugApplicationModel(ApplicationModel.asyncapi.allSchemas());
    const schema = ApplicationModel.asyncapi.components().schema(schemaName);
    //debugApplicationModel(`getSchema for ${schemaName}`);
    //debugApplicationModel(schema);
    return schema;
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
          let anonymousSchema;
          let namedSchema;
          allOf.forEach(innerSchema => {
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
      });
      debugApplicationModel('-----------------------------');
      debugApplicationModel('superclassMap:');
      debugApplicationModel(this.superClassMap);
      debugApplicationModel('anonymousSchemaToSubClassMap:');
      debugApplicationModel(this.anonymousSchemaToSubClassMap);
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
    modelClass.setClassName(tentativeClassName);
    debugApplicationModel(`schemaName ${schemaName} tentativeClassName: ${tentativeClassName} className: ${modelClass.getClassName()} super: ${modelClass.getSuperClassName()}`);
    this.modelClassMap[schemaName] = modelClass;
    debugApplicationModel(`Added ${schemaName}`);
    debugApplicationModel(modelClass);
  }

  reset() {
    instanceMap.forEach( (val, key) => {
      val.superClassMap = null;
      val.anonymousSchemaToSubClassMap = null;
      val.modelClassMap = null;
    });
  }
}

module.exports = ApplicationModel;

const ModelClass = require('./modelClass.js');
const debugApplicationModel = require('debug')('applicationModel');
const _ = require('lodash');
const ScsLib = require('./scsLib.js');
const scsLib = new ScsLib();
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
	this.setupTopLevelSchemasMap();
    this.setupSuperClassMap();
    this.setupModelClassMap();
    let modelClass;
    if (schema) {
      const parserSchemaName = schema.ext('x-parser-schema-id');
      // Try to use x-parser-schema-id as key
      modelClass = this.modelClassMap[parserSchemaName];
      if (modelClass && _.startsWith(modelClass.getClassName(), 'Anonymous')) {
        // If we translated this schema from the map using an anonymous schema key, we have no idea what the name should be, so we use the one provided directly from the source - not the generator.
        // Otherwise, if we translated this schema from the map using a known schema (the name of the schema was picked out correctly by the generator), use that name.
        modelClass.setClassName(_.upperFirst(this.isAnonymousSchema(parserSchemaName) ? schemaName : parserSchemaName));
      }
    }
    // Using x-parser-schema-id didn't work for us, fall back to trying to get at least something using the provided name.
    if (!modelClass) {
      modelClass = this.modelClassMap[schemaName] || this.modelClassMap[_.camelCase(schemaName)];
    }
    debugApplicationModel(`returning modelClass for caller ${this.caller} ${schemaName}`);
    debugApplicationModel(modelClass);
    return modelClass;
  }

  getSchema(schemaName) {
    return ApplicationModel.asyncapi.components().schema(schemaName);
  }

  setupSuperClassMap() {
    if (this.superClassMap) {
      return;
    }
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

  setupTopLevelSchemasMap() {
	if (this.topLevelSchemasByParserSchemaId) {
		return;
	}
	const components = ApplicationModel.asyncapi._json.components;
	const topLevelSchemaNames = Object.keys(components?.schemas || {});
	const topLevelSchemas = topLevelSchemaNames.map(schemaName => {
		components.schemas[schemaName].x_template_schema_name = schemaName;
		return components.schemas[schemaName];
	}) || [];
	this.topLevelSchemasByParserSchemaId = _.keyBy(topLevelSchemas, "x-parser-schema-id") || {};
  }

  setupModelClassMap() {
    if (this.modelClassMap) {
      return;
    }
    this.modelClassMap = new Map();
    this.nameToSchemaMap = new Map();
    ApplicationModel.asyncapi.allSchemas().forEach((schema, name) => {
      debugApplicationModel(`setupModelClassMap ${name} type ${schema.type()}`);
      this.registerSchemaNameToModelClass(schema, name);
      this.nameToSchemaMap[name] = schema;
    });
    debugApplicationModel('modelClassMap:');
    debugApplicationModel(this.modelClassMap);
  }

  isAnonymousSchema(schemaName) {
    return schemaName.startsWith('<');
  }

  /**
   * @param {string} fullyQualifiedClassName // my.package.className 
   */
  getClassNameAndPackage(schema, fullyQualifiedClassName) {
	const classNameAndLocation = scsLib.stripPackageName(fullyQualifiedClassName);
	let className = classNameAndLocation.className;
	const javaPackage = classNameAndLocation.javaPackage;
	if (schema._json['x-model-class-name']) {
		className = schema._json['x-model-class-name'];
	}
	return { className, javaPackage };
  }

  registerSchemaNameToModelClass(schema, schemaName) {
    let modelClass = this.modelClassMap[schemaName];
    if (!modelClass) {
      modelClass = new ModelClass();
    }

    if (this.isAnonymousSchema(schemaName)) {
      this.handleAnonymousSchemaForAllOf(modelClass, schemaName);
    }
    
	// Is this schema at the top level? Try matching the x-parser-schema-id
	const topLevelSchema = this.topLevelSchemasByParserSchemaId[schema._json["x-parser-schema-id"]];
	// if (topLevelSchemas.includes(schemaName)) {
    //   modelClass.setCanBeInnerClass(false);
    // }
	let className = "";
	let javaPackage = "";
	if (topLevelSchema) {
		// We set and flattened this earlier. { rootSchemaName: { id: 123 }} -> [{ x_template_schema_name: "rootSchemaName", id: 123 }]
		modelClass.setCanBeInnerClass(false);
		({ className, javaPackage } = this.getClassNameAndPackage(schema, topLevelSchema.x_template_schema_name));
	} else {
		({ className, javaPackage } = this.getClassNameAndPackage(schema, schemaName));
	}
	modelClass.setJavaPackage(javaPackage);
	modelClass.setClassName(className);
	debugApplicationModel(`schemaName ${schemaName} className: ${modelClass.getClassName()} super: ${modelClass.getSuperClassName()} javaPackage: ${javaPackage}`);
	this.modelClassMap[schemaName] = modelClass;
	debugApplicationModel(`Added ${schemaName}`);
	debugApplicationModel(modelClass);
  }

  getAnonymousSchemaForRef(realSchemaName) {
    // During our allOf parsing, we found this real schema to anon-schema association
    const anonSchema = this.anonymousSchemaToSubClassMap[realSchemaName];
    return anonSchema ? this.nameToSchemaMap[anonSchema] : undefined;
  }

  handleAnonymousSchemaForAllOf(modelClass, schemaName) {
    const subclassName = this.anonymousSchemaToSubClassMap[schemaName];
    if (subclassName) {
      modelClass.setSuperClassName(this.superClassMap[schemaName]);
      // Be sure the anonymous modelClass and the named modelClass are updated with the superclass information
      // We dont want the anonymous schema because the class name won't be correct if it's a $ref, so if the modelClass exists, update that one, if it doesn't we'll make it
      const existingModelClass = this.modelClassMap[subclassName];
      if (existingModelClass) {
        existingModelClass.setSuperClassName(this.superClassMap[schemaName]);
      }
      return subclassName;
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

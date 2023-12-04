const ApplicationModel = require('../lib/applicationModel.js');
const _ = require('lodash'); 

const uniqueids = new Set();

/**
 * Change the $ids of schemas that are objects to be made into classes.
 * Changing the $id means any duplicate $ids are no longer ignored by .allSchemas().
 * @param {JSONSchema} schema 
 * @param {String} name 
 */
function fixIds(schema, name) {
  const props = schema.properties;
  if (props) {
    if (schema.$id && schema.type === "object") {
      let newName = name;
      if (uniqueids.has(schema.$id)) {
        newName = _.uniqueId(name);
      }
      schema.$id = newName;
      schema["x-parser-schema-id"] = newName;
      uniqueids.add(schema.$id);
    }

    const propNames = Object.keys(props);
    propNames.forEach(propName => {
      const schemaObject = props[propName];
      if (schemaObject.type === "object" || schemaObject.type === "array") {
        fixIds(schemaObject, propName);
      }
    });
  }
  const items = schema.items;
  if (items) {
    if (items.type === "object" || items.type === "array") {
      fixIds(items, name);
    }
  }
}

function setSchemaIdsForFileNameIncludingDuplicates(asyncapi) {
  const components = asyncapi._json.components;
  const topLevelSchemaNames = Object.keys(components?.schemas || {});
  const topLevelSchemas = topLevelSchemaNames.map(schemaName => {
    components.schemas[schemaName].x_template_schema_name = schemaName;
    return components.schemas[schemaName];
  }) || [];
  topLevelSchemas.forEach(topLevelSchema => {
    fixIds(topLevelSchema, topLevelSchema.x_template_schema_name);
  });

  const all11 = asyncapi.allSchemas();
}

/**
 * allSchemas() doesnt have enough information to properly name all schemas including the top level schemas, but it does have all schemas with a unique $id. 
 * We recurse over the schemas used in components & rename all $ids. These are the only schemas we care about.
 * If it doesn't have an $id, there's no problems.
 * The goal of this was to change the $id to reveal the duplicates not returned by allSchemas, but there shouldnt be a need to do so if we recurse over the component.schemas.
 * We dont go over components.schemas in the rest of the code, so the duplicate schemas are still going to be hidden.
 * So, since all '$id's that we care about are changed, all are 'revealed'. The $id is going to affect x-parser-schema-id. 
 * We have a set of '$id's and set the schema's $id to the schema name with optional UUID if there's a duplicate.
 */

module.exports = {
  'generate:before': generator => {
    setSchemaIdsForFileNameIncludingDuplicates(generator.asyncapi);
    ApplicationModel.asyncapi = generator.asyncapi;
  }
};
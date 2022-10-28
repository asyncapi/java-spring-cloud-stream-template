const ApplicationModel = require('../lib/applicationModel.js');
const _ = require('lodash');

function setSchemaIdsForFileName(asyncapi) {
  asyncapi.allSchemas().forEach((schema, schemaName) => {
    // If we leave the $id the way it is, the generator will name the schema files what their $id is, which is always a bad idea.
    // So we leave it in, but $id is going to be changed to be the class name we want.
    // If we remove the $id and there's no x-parser-schema-id, then it wont be returned by allSchemas().
    if (schema.$id()) {
      // Assuming one of x-parser-schema-id and $id must be present.
      let classNameForGenerator;
      const parserSchemaId = schema.ext('x-parser-schema-id');
      classNameForGenerator = parserSchemaId ? parserSchemaId : _.camelCase(schema.$id().substring(schema.$id().lastIndexOf('/') + 1));
      
      if (classNameForGenerator === 'items') {
        let parentSchema;
        if (schema.options) {
          parentSchema = schema.options.parent;
        }
        let parentSchemaItems;
        if (parentSchema) {
          parentSchemaItems = parentSchema.items();
        }
        let parentSchemaItemsId;
        if (parentSchemaItems && parentSchemaItems._json) {
          parentSchemaItemsId = parentSchemaItems._json.$id;
        }
        if (parentSchemaItemsId === schema.$id()) {
          const parentParserSchemaId = parentSchema.ext('x-parser-schema-id');
          classNameForGenerator = parentParserSchemaId ? parentParserSchemaId : _.camelCase(parentSchema.$id().substring(parentSchema.$id().lastIndexOf('/') + 1));
          // If we come across this schema later in the code generator, we'll know to rename it to its parent because the proper settings will be set in the model class.
          schema._json['x-model-class-name'] = classNameForGenerator;
          classNameForGenerator += 'Items';
        }
      }
      schema._json.$id = classNameForGenerator;
    }
  });
}

function setSchemaIdsForFileNameIncludingDuplicates(asyncapi) {
  // We do this multiple times because allSchemas() returns a list of deduplicated schemas, so if we change the $id of a schema,
  //  we wont change any of the duplicates. We continue until there are no more duplicates to change.
  let numSchemas;
  let newNumSchemas;
  do {
    numSchemas = asyncapi.allSchemas().size;
    setSchemaIdsForFileName(asyncapi);
    newNumSchemas = asyncapi.allSchemas().size;
  } while (numSchemas !== newNumSchemas);
}

module.exports = {
  'generate:before': generator => {
    setSchemaIdsForFileNameIncludingDuplicates(generator.asyncapi);
    ApplicationModel.asyncapi = generator.asyncapi;
  }
};
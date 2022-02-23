const ApplicationModel = require('../lib/applicationModel.js');

module.exports = {
  'generate:before': generator => {
    generator.asyncapi.allSchemas().forEach((schema, schemaName) => {
      // The generator will create file names based on the schema's $id. Instead of guessing what the generator named the file so we can fix it in post,
      // ... it's easier to process $id here first. Since we don't use it, removing it is easiest.
      if (schema.$id()) {
        delete schema._json.$id;
      }
    });

    ApplicationModel.asyncapi = generator.asyncapi;
  }
};
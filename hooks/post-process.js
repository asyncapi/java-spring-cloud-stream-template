// vim: set ts=2 sw=2 sts=2 expandtab :
const fs = require('fs');
const path = require('path');
const _ = require('lodash');
const ScsLib = require('../lib/scsLib.js');

const sourceHead = '/src/main/java/';

module.exports = {
  'generate:after': generator => {
    const scsLib = new ScsLib();
    const asyncapi = generator.asyncapi;
    let sourcePath = generator.targetDir + sourceHead;
    const info = asyncapi.info();
    let package = generator.templateParams['javaPackage'];
    let generateMessagingClass = false;
    const gen = generator.templateParams['generateMessagingClass'];
    const extensions = info.extensions();

    if (gen === 'true') {
      generateMessagingClass = true;
    }

    if (!package && info && extensions) {
      package = extensions['x-java-package'];
    }

    if (package) {
      //console.log("package: " + package);
      const overridePath = `${generator.targetDir + sourceHead + package.replace(/\./g, '/')}/`;
      //console.log("Moving files from " + sourcePath + " to " + overridePath);
      let first = true;
      fs.readdirSync(sourcePath).forEach(file => {
        if (!fs.lstatSync(path.resolve(sourcePath, file)).isDirectory()) {
          if (first) {
            first = false;
            //console.log("Making " + overridePath);
            fs.mkdirSync(overridePath, { recursive: true });
          }

          if ((file != 'Messaging.java') || generateMessagingClass) {
            //console.log("Copying " + file)
            fs.copyFileSync(path.resolve(sourcePath, file), path.resolve(overridePath, file));
          }
          fs.unlinkSync(path.resolve(sourcePath, file));
        }
      });
      sourcePath = overridePath;
    } else if (!generateMessagingClass) {
      fs.unlinkSync(path.resolve(sourcePath, 'Messaging.java'));
    }

    // Rename the pom file if necessary, and only include Application.java when an app is requested.
    const artifactType = generator.templateParams['artifactType'];

    const mainClassName = 'Application';
    let overrideClassName = scsLib.getParamOrExtension(info, generator.templateParams, 'javaClass', 'x-java-class');

    if (artifactType === 'library') {
      fs.renameSync(path.resolve(generator.targetDir, 'pom.lib'), path.resolve(generator.targetDir, 'pom.xml'));
      fs.unlinkSync(path.resolve(generator.targetDir, 'pom.app'));
      fs.unlinkSync(path.resolve(sourcePath, 'Application.java'));
      //fs.unlinkSync(path.resolve(sourcePath, "ApplicationWithMessaging.java"));
    } else {
      fs.renameSync(path.resolve(generator.targetDir, 'pom.app'), path.resolve(generator.targetDir, 'pom.xml'));
      fs.unlinkSync(path.resolve(generator.targetDir, 'pom.lib'));

      if (overrideClassName) {
        overrideClassName += '.java';
        fs.renameSync(path.resolve(sourcePath, 'Application.java'), path.resolve(sourcePath, overrideClassName));
      }
    }

    // This renames schema objects ensuring they're proper Java class names. It also removes files that are schemas of simple types.

    const schemas = asyncapi.components().schemas();
    //console.log("schemas: " + JSON.stringify(schemas));

    for (const schema in schemas) {

      let schemaObj = schemas[schema];
      let type = schemaObj.type();
      const oldPath = path.resolve(sourcePath, `${schema}.java`);

      //console.log(`postprocess schema ${schema} ${type}`);

      if (type === 'object' || type === 'enum') {
        let javaName = _.camelCase(schema);
        javaName = _.upperFirst(javaName);

        if (javaName !== schema) {
          const newPath = path.resolve(sourcePath, `${javaName}.java`);
          fs.renameSync(oldPath, newPath);
          // console.log("Renamed class file "  + schema + " to " + javaName);
        }
      } else {
        fs.unlinkSync(oldPath);
      }
    }

    // This renames schema objects according to the title field. By default we won't do this, we might add this as an option.

    //const schemas = asyncapi.components().schemas();
    //console.log("schemas: " + JSON.stringify(schemas));

    /*
    for (let schema in schemas) {
      let schemaObject = schemas[schema];
      let title = _.upperFirst(schemaObject.title);
      console.log("schema "  + schema + " title: " + title);
      if (title && title != schema) {
        let pathBySchema = path.resolve(sourcePath, schema + ".java");
        let pathByTitle = path.resolve(sourcePath, title + ".java");

        if (fs.existsSync(pathBySchema) && !fs.existsSync(pathByTitle)) {
          fs.renameSync(pathBySchema, pathByTitle);
        }
      }
    }
    */
  }
};


// vim: set ts=2 sw=2 sts=2 expandtab :
const fs = require('fs');
const path = require('path');
const ApplicationModel = require('../lib/applicationModel.js');
const applicationModel = new ApplicationModel('post');
// To enable debug logging, set the env var DEBUG="postProcess" with whatever things you want to see.
const debugPostProcess = require('debug')('postProcess');

const sourceHead = '/src/main/java/';

module.exports = {
  'generate:after': generator => {
    const asyncapi = generator.asyncapi;
    let sourcePath = generator.targetDir + sourceHead;

    deleteNonObjectSchemas(asyncapi, sourcePath);
    renameSubclassFiles(asyncapi, sourcePath);

    const info = asyncapi.info();
    let javaPackage = generator.templateParams['javaPackage'];
    const extensions = info.extensions();
    if (!javaPackage && info && extensions) {
      javaPackage = extensions['x-java-package'];
    }

    if (javaPackage) {
      debugPostProcess(`package: ${javaPackage}`);
      const overridePath = `${generator.targetDir + sourceHead + javaPackage.replace(/\./g, '/')}/`;
      debugPostProcess(`Moving files from ${sourcePath} to ${overridePath}`);
      let first = true;
      fs.readdirSync(sourcePath).forEach(file => {
        debugPostProcess(`File: ${file}`);
        if (!fs.lstatSync(path.resolve(sourcePath, file)).isDirectory()) {
          if (first) {
            first = false;
            debugPostProcess(`Making ${overridePath}`);
            fs.mkdirSync(overridePath, { recursive: true });
          }

          debugPostProcess(`Copying ${file}`);
          fs.copyFileSync(path.resolve(sourcePath, file), path.resolve(overridePath, file));
          fs.unlinkSync(path.resolve(sourcePath, file));
        }
      });
      sourcePath = overridePath;
    }

    // Rename the pom file if necessary, and only include Application.java when an app is requested.
    const artifactType = generator.templateParams['artifactType'];

    if (artifactType === 'library') {
      fs.renameSync(path.resolve(generator.targetDir, 'pom.lib'), path.resolve(generator.targetDir, 'pom.xml'));
      fs.unlinkSync(path.resolve(generator.targetDir, 'pom.app'));
      fs.unlinkSync(path.resolve(sourcePath, 'Application.java'));
    } else {
      fs.renameSync(path.resolve(generator.targetDir, 'pom.app'), path.resolve(generator.targetDir, 'pom.xml'));
      fs.unlinkSync(path.resolve(generator.targetDir, 'pom.lib'));
    }

    applicationModel.reset();
  }
  
};

function deleteNonObjectSchemas(asyncapi, sourcePath) {
  debugPostProcess('Deleting non-object schemas.');
  asyncapi.allSchemas().forEach((schema, schemaName) => {
    if (schema.type() !== 'object') {
      const fileName = getFileName(schemaName);
      const filePath = path.resolve(sourcePath, fileName);
      debugPostProcess(`deleting ${filePath}`);
      fs.unlinkSync(filePath);
    }
  });
}

function renameSubclassFiles(asyncapi, sourcePath) {
  debugPostProcess('Renaming subclass schemas.');
  asyncapi.allSchemas().forEach((schema, schemaName) => {
    if (schema.type() === 'object') {
      const modelClass = applicationModel.getModelClass(schemaName);
      const javaName = modelClass.getClassName();
      debugPostProcess(`javaName: ${javaName} schemaName: ${schemaName}`);
      if (javaName !== schemaName) {
        const newPath = path.resolve(sourcePath, `${javaName}.java`);
        const fileName = getFileName(schemaName);
        const oldPath = path.resolve(sourcePath, fileName);
        fs.renameSync(oldPath, newPath);
        debugPostProcess(`Renamed class file ${schemaName} to ${javaName}`);
      }
    }
  });  
}

function getFileName(schemaName) {
  let trimmedSchemaName = schemaName;
  if (schemaName.startsWith('<')) {
    debugPostProcess(`found an anonymous schema ${schemaName}`);
    trimmedSchemaName = schemaName.replace('<', '');
    trimmedSchemaName = trimmedSchemaName.replace('>', '');
  }

  return `${trimmedSchemaName}.java`;
}

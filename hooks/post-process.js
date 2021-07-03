// vim: set ts=2 sw=2 sts=2 expandtab :
const fs = require('fs');
const path = require('path');
const _ = require('lodash');
const ScsLib = require('../lib/scsLib.js');
// To enable debug logging, set the env var DEBUG="postProcess" with whatever things you want to see.
const debugPostProcess = require('debug')('postProcess');

const sourceHead = '/src/main/java/';

module.exports = {
  'generate:after': generator => {
    const scsLib = new ScsLib();
    const asyncapi = generator.asyncapi;
    let sourcePath = generator.targetDir + sourceHead;
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

    let overrideClassName = scsLib.getParamOrExtension(info, generator.templateParams, 'javaClass', 'x-java-class');

    if (artifactType === 'library') {
      fs.renameSync(path.resolve(generator.targetDir, 'pom.lib'), path.resolve(generator.targetDir, 'pom.xml'));
      fs.unlinkSync(path.resolve(generator.targetDir, 'pom.app'));
      fs.unlinkSync(path.resolve(sourcePath, 'Application.java'));
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
    debugPostProcess('schemas:');
    debugPostProcess(schemas);

    for (const schemaName in asyncapi.components().schemas()) {
      const schema = schemas[schemaName];
      const type = schema.type();
      debugPostProcess(`postprocess schema ${schemaName} ${type}`);
      const oldPath = path.resolve(sourcePath, `${schemaName}.java`);

      if (type === 'object' || type === 'enum') {
        let javaName = _.camelCase(schemaName);
        javaName = _.upperFirst(javaName);

        if (javaName !== schemaName) {
          const newPath = path.resolve(sourcePath, `${javaName}.java`);
          fs.renameSync(oldPath, newPath);
          debugPostProcess(`Renamed class file ${schemaName} to ${javaName}`);
        }
      } else {
        fs.unlinkSync(oldPath);
      }
    }
  }
};


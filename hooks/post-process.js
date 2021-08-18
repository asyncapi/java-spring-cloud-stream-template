// vim: set ts=2 sw=2 sts=2 expandtab :
const fs = require('fs');
const path = require('path');
const ScsLib = require('../lib/scsLib.js');
const scsLib = new ScsLib();
// To enable debug logging, set the env var DEBUG="postProcess" with whatever things you want to see.
const debugPostProcess = require('debug')('postProcess');

const sourceHead = '/src/main/java/';

module.exports = {
  'generate:after': generator => {
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

    if (artifactType === 'library') {
      fs.renameSync(path.resolve(generator.targetDir, 'pom.lib'), path.resolve(generator.targetDir, 'pom.xml'));
      fs.unlinkSync(path.resolve(generator.targetDir, 'pom.app'));
      fs.unlinkSync(path.resolve(sourcePath, 'Application.java'));
    } else {
      fs.renameSync(path.resolve(generator.targetDir, 'pom.app'), path.resolve(generator.targetDir, 'pom.xml'));
      fs.unlinkSync(path.resolve(generator.targetDir, 'pom.lib'));
    }

    // This renames schema objects ensuring they're proper Java class names. It also removes files that are schemas of simple types.

    asyncapi.allSchemas().forEach((value, key, map) => {
      processSchema(key, value);
    });

    function processSchema(schemaName, schema) {
      if (schemaName.startsWith('<')) {
        debugPostProcess(`found an anonymous schema ${schemaName}`);
        schemaName = schemaName.replace('<', '');
        schemaName = schemaName.replace('>', '');    
      }

      const oldPath = path.resolve(sourcePath, `${schemaName}.java`);
      debugPostProcess(`old path: ${oldPath}`);

      if (fs.existsSync(oldPath)) {
        const schemaType = schema.type();
        debugPostProcess(`Old path exists. schemaType: ${schemaType}`);
        if (schemaType === 'object' || schemaType === 'enum') {
          const javaName = scsLib.getClassName(schemaName);
          debugPostProcess(`javaName: ${javaName} schemaName: ${schemaName}`);

          if (javaName !== schemaName) {
            const newPath = path.resolve(sourcePath, `${javaName}.java`);
            fs.renameSync(oldPath, newPath);
            debugPostProcess(`Renamed class file ${schemaName} to ${javaName}`);
          }
        } else {
          // In this case it's an anonymous schema for a primitive type or something.
          debugPostProcess(`deleting ${oldPath}`);
          fs.unlinkSync(oldPath);
        }
      }
    }
  }
};


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
    let overridePath;

    if (!javaPackage && info && extensions) {
      javaPackage = extensions['x-java-package'];
    }

    if (javaPackage) {
      debugPostProcess(`package: ${javaPackage}`);
      overridePath = `${generator.targetDir + sourceHead + javaPackage.replace(/\./g, '/')}/`;
    }
    
    asyncapi.allSchemas().forEach((value, key, map) => {
      processSchema(key, value);
    });

    if (javaPackage) {
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
          moveFile(sourcePath, overridePath, file);
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

    function processSchema(schemaName, schema) {
      if (schemaName.startsWith('<')) {
        debugPostProcess(`found an anonymous schema ${schemaName}`);
        schemaName = schemaName.replace('<', '');
        schemaName = schemaName.replace('>', '');    
      }

      // First see if we need to move it to a different package based on its namespace.
      // This mainly applies to Avro files which have the fully qualified name.
      let newSourceDir = sourcePath;
      const generatedFileName = `${schemaName}.java`;
      let desiredClassName = scsLib.getClassName(schemaName);

      const indexOfDot = schemaName.lastIndexOf('.');
      if (indexOfDot > 0) {
        const newPackage = schemaName.substring(0, indexOfDot);
        const className = schemaName.substring(indexOfDot + 1);
        debugPostProcess(`package: ${newPackage} className: ${className}`);
        newSourceDir = `${generator.targetDir + sourceHead + newPackage.replace(/\./g, '/')}/`;
        moveFile(sourcePath, newSourceDir, generatedFileName);
        desiredClassName = scsLib.getClassName(className);
      }

      const oldPath = path.resolve(newSourceDir, generatedFileName);
      debugPostProcess(`old path: ${oldPath}`);

      if (fs.existsSync(oldPath)) {
        const schemaType = schema.type();
        debugPostProcess(`Old path exists. schemaType: ${schemaType}`);
        if (schemaType === 'object' || schemaType === 'enum') {
          const javaName = scsLib.getClassName(schemaName);
          debugPostProcess(`desiredClassName: ${desiredClassName} schemaName: ${schemaName}`);

          if (javaName !== schemaName) {
            const newPath = path.resolve(newSourceDir, `${desiredClassName}.java`);
            fs.renameSync(oldPath, newPath);
            debugPostProcess(`Renamed class file ${schemaName} to ${desiredClassName}`);
          }
        } else {
          // In this case it's an anonymous schema for a primitive type or something.
          debugPostProcess(`deleting ${oldPath}`);
          fs.unlinkSync(oldPath);
        }
      }
    }

    function moveFile(oldDirectory, newDirectory, fileName) {
      if (!fs.existsSync(newDirectory)) {
        fs.mkdirSync(newDirectory, { recursive: true });
        debugPostProcess(`Made directory ${newDirectory}`);
      }
      const oldPath = path.resolve(oldDirectory, fileName);
      const newPath = path.resolve(newDirectory, fileName);
      fs.copyFileSync(oldPath, newPath);
      fs.unlinkSync(oldPath);
      debugPostProcess(`Moved ${fileName} from ${oldPath} to ${newPath}`);
    }
  }
};


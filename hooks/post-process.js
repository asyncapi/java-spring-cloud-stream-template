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
    const sourcePath = generator.targetDir + sourceHead;

    // NEW

    const defaultJavaPackage = getDefaultJavaPackage(generator);
    const defaultJavaPackageDir = getDefaultJavaPackageDir(generator, defaultJavaPackage);

    asyncapi.allSchemas().forEach((schema, schemaName) => {
      processSchema(generator, schemaName, schema, sourcePath, defaultJavaPackageDir);
    });

    // Rename the pom file if necessary, and only include Application.java when an app is requested.
    const artifactType = generator.templateParams['artifactType'];

    if (artifactType === 'library') {
      fs.renameSync(path.resolve(generator.targetDir, 'pom.lib'), path.resolve(generator.targetDir, 'pom.xml'));
      fs.unlinkSync(path.resolve(generator.targetDir, 'pom.app'));
      fs.unlinkSync(path.resolve(sourcePath, 'Application.java'));
    } else {
      fs.renameSync(path.resolve(generator.targetDir, 'pom.app'), path.resolve(generator.targetDir, 'pom.xml'));
      fs.unlinkSync(path.resolve(generator.targetDir, 'pom.lib'));
      if (defaultJavaPackageDir) {
        moveFile(sourcePath, defaultJavaPackageDir, 'Application.java');
      }
    }
    applicationModel.reset(); // Must clear its cache for when we run the jest tests.
  }
};

function getDefaultJavaPackage(generator) {
  const asyncapi = generator.asyncapi;
  const info = asyncapi.info();
  let javaPackage = generator.templateParams['javaPackage'];
  const extensions = info.extensions();

  if (!javaPackage && info && extensions) {
    javaPackage = extensions['x-java-package'];
  }

  debugPostProcess(`getDefaultJavaPackage: ${javaPackage}`);
  return javaPackage;
}

function getDefaultJavaPackageDir(generator, defaultJavaPackage) {
  let defaultPackageDir;

  if (defaultJavaPackage) {
    const packageDir = packageToPath(defaultJavaPackage);
    defaultPackageDir = `${generator.targetDir}${sourceHead}${packageDir}`;
  }

  debugPostProcess(`getDefaultJavaPackageDir: ${defaultPackageDir}`);
  return defaultPackageDir;
}

function packageToPath(javaPackage) {
  return javaPackage.replace(/\./g, '/');
}

function processSchema(generator, schemaName, schema, sourcePath, defaultJavaPackageDir) {
  const fileName = getFileName(schemaName);
  const filePath = path.resolve(sourcePath, fileName);
  debugPostProcess(`processSchema ${schemaName}`);
  debugPostProcess(schema);
  if (schema.type() !== 'object') {
    debugPostProcess(`deleting ${filePath}`);
    fs.unlinkSync(filePath);
  } else {
    const modelClass = applicationModel.getModelClass(schemaName);
    const javaName = modelClass.getClassName();
    const packageDir = getPackageDir(generator, defaultJavaPackageDir, modelClass);
    debugPostProcess(`packageDir: ${packageDir}`);

    if (packageDir) {
      moveFile(sourcePath, packageDir, fileName);
    }

    debugPostProcess(`javaName: ${javaName} schemaName: ${schemaName}`);
    if (javaName !== schemaName) {
      const currentPath = packageDir || sourcePath;
      const newPath = path.resolve(currentPath, `${javaName}.java`);
      const oldPath = path.resolve(currentPath, fileName);
      fs.renameSync(oldPath, newPath);
      debugPostProcess(`Renamed class file ${schemaName} to ${javaName}`);
    }
  }
}

function getFileName(schemaName) {
  const trimmedSchemaName = trimSchemaName(schemaName);
  return `${trimmedSchemaName}.java`;
}

function trimSchemaName(schemaName) {
  let trimmedSchemaName = schemaName;
  if (schemaName.startsWith('<')) {
    trimmedSchemaName = schemaName.replace('<', '');
    trimmedSchemaName = trimmedSchemaName.replace(/>$/, '');
  }
  return trimmedSchemaName;
}

function getPackageDir(generator, defaultJavaPackageDir, modelClass) {
  const fileSpecificPackage = modelClass.getJavaPackage();
  if (fileSpecificPackage) {
    const packagePath = packageToPath(fileSpecificPackage);
    return `${generator.targetDir}${sourceHead}${packagePath}`;
  }
  return defaultJavaPackageDir;
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

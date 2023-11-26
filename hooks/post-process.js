// vim: set ts=2 sw=2 sts=2 expandtab :
const fs = require('fs');
const path = require('path');
const ApplicationModel = require('../lib/applicationModel.js');
const _ = require('lodash');
const applicationModel = new ApplicationModel('post');
// To enable debug logging, set the env var DEBUG="postProcess" with whatever things you want to see.
const debugPostProcess = require('debug')('postProcess');
const sourceHead = '/src/main/java/';

module.exports = {
  'generate:after': generator => {
    const asyncapi = generator.asyncapi;
    const sourcePath = generator.targetDir + sourceHead;

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
  const modelClass = applicationModel.getModelClass({schema, schemaName});
  const javaName = modelClass.getClassName();
  // Might be easier to delete based on the file name determined by the file name hook. We should have enough info to make the name DELETEME to mark them.
  if ((schema.type() && schema.type() !== 'object') || _.startsWith(javaName, 'Anonymous')) {
    debugPostProcess(`deleting ${filePath}`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } else {
    const packageDir = getPackageDir(generator, defaultJavaPackageDir, modelClass);
    debugPostProcess(`packageDir: ${packageDir}`);

    if (packageDir) {
      moveFile(sourcePath, packageDir, fileName);
    }

    debugPostProcess(`javaName: ${javaName} schemaName: ${schemaName}`);
	// Should be no need to do this now that we use the hook for it
    // if (javaName !== schemaName) {
    //   const currentPath = packageDir || sourcePath;
    //   const newPath = path.resolve(currentPath, `${javaName}.java`);
    //   const oldPath = path.resolve(currentPath, fileName);
    //   fs.renameSync(oldPath, newPath);
    //   debugPostProcess(`Renamed class file ${schemaName} to ${javaName}`);
    // }
  }
}

function getFileName(schemaName) {
	const fileName = applicationModel.getModelClass({ schemaName }).getClassName();
//   const trimmedSchemaName = trimSchemaName(schemaName);
  // The generator will remove all characters from the file name that would make it invalid like colons and forward slash.
  // We do the same, otherwise we would have to edit the asycnapi document during preprocessing.
//   const fileName = trimmedSchemaName.replaceAll("/", "-").replaceAll(":", "");
  return `${fileName}.java`;
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

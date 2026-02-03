const { logger } = require('../utils/logger');

function Template({ asyncapi, params, targetDir }) {
  logger.debug('template/index.js: Template() - Generating template files');
  logger.debug('template/index.js: Template() - asyncapi keys:', Object.keys(asyncapi || {}));
  logger.debug('template/index.js: Template() - params:', params);
  
  const React = require('react');
  const { File } = require('@asyncapi/generator-react-sdk');
  const { Application } = require('../components/Application');
  const { ApplicationYml } = require('../components/ApplicationYml');
  const ModelClass = require('../components/ModelClass');
  const { PomXml } = require('../components/PomXml');
  const { Readme } = require('../components/Readme');
  const { processAsyncApi } = require('../utils/asyncApiProcessor');

  logger.debug('template/index.js: Template() - About to call processAsyncApi');
  try {
    const processedData = processAsyncApi(asyncapi, params);
    logger.debug('template/index.js: Template() - processAsyncApi completed successfully');
    logger.debug('Processed data:', {
      schemasCount: processedData.schemas.length,
      functionsCount: processedData.functions.length,
      hasExtraIncludes: !!processedData.extraIncludes,
      hasImports: !!processedData.imports,
      hasAppProperties: !!processedData.appProperties
    });
    
    // Debug: Log each schema that will be processed
    logger.debug('template/index.js: Schemas to process:');
    processedData.schemas.forEach((schema, index) => {
      logger.debug(`  [${index}] Schema: ${schema.name}, Properties: ${schema.properties.length}, IsAvro: ${schema.isAvro}`);
    });

    const files = [];

    // Generate pom.xml based on artifactType
    const artifactType = params.artifactType || 'application';
    logger.debug('template/index.js: Template() - About to generate pom.xml');
    if (artifactType === 'application') {
      files.push(
        React.createElement(File, { name: 'pom.xml' },
          React.createElement(PomXml, { params, asyncapi, processedData, artifactType: 'application' })
        )
      );
    } else {
      files.push(
        React.createElement(File, { name: 'pom.xml' },
          React.createElement(PomXml, { params, asyncapi, processedData, artifactType: 'library' })
        )
      );
    }

    // Generate README.md
    logger.debug('template/index.js: Template() - About to generate README.md');
    files.push(
      React.createElement(File, { name: 'README.md' },
        React.createElement(Readme, { params, asyncapi, processedData })
      )
    );

    // Generate Application.java in root (will be moved by post-hook) - only for application type
    if (artifactType === 'application') {
      const className = getMainClassName(asyncapi, params);
      logger.debug('template/index.js: Template() - About to generate Application.java');
      files.push(
        React.createElement(File, { name: `${className}.java` },
          React.createElement(Application, { params, asyncapi, processedData })
        )
      );
    } else {
      logger.debug('template/index.js: Template() - Skipping Application.java for library type');
    }

    // Generate schema classes in root (will be moved by post-hook)
    logger.debug(`template/index.js: Processing ${processedData.schemas.length} schemas for Java file generation`);
    processedData.schemas.forEach((processedSchema, index) => {
      const schemaName = processedSchema.name; // This is the original schema name from AsyncAPI spec
      
      logger.debug(`template/index.js: Processing schema [${index}]: ${schemaName}`);
      
      // Skip schemas with numeric names (0, 1) as they are duplicates of component schemas
      if ((typeof schemaName === 'number' && (/^\d+$/).test(String(schemaName))) || 
          (typeof schemaName === 'string' && (/^\d+$/).test(schemaName))) {
        logger.debug(`template/index.js: Skipping numeric schema name: ${schemaName} (duplicate of component schema)`);
        return;
      }
      
      // Skip schemas with undefined or null names
      if (!schemaName) {
        logger.warn('Skipping schema with undefined name:', processedSchema);
        return;
      }
      
      // Check if this schema should generate a separate file
      if (processedSchema.shouldGenerateSeparateFile) {
        logger.debug(`template/index.js: Generating separate file for standalone schema: ${processedSchema.name}`);
      } else {
        logger.debug(`template/index.js: Schema ${processedSchema.name} will be embedded in parent class`);
      }
      
      // Use Avro namespace info if available, otherwise use existing logic
      let className, filePath;
      
      if (processedSchema.isAvro && processedSchema.packagePath && processedSchema.className) {
        // Avro schema with namespace - generate in root, post-process will move to namespace
        className = processedSchema.className;
        filePath = `${className}.java`;
      } else {
        // Regular schema - use existing logic
        // Prioritize original schema name over title to ensure correct naming
        // Only use title if schema name is not available or is a generic name
        let nameToUse = schemaName;
        // Ensure schemaName is a string before calling startsWith
        const schemaNameStr = String(schemaName);
        if (!schemaName || schemaNameStr.startsWith('<') || schemaName === 'root' || schemaName === 'object') {
          nameToUse = schemaName || processedSchema.title;
        }
        className = getSchemaClassName(nameToUse);
        filePath = `${className}.java`;
      }
      
      logger.debug(`template/index.js: About to generate ModelClass for ${className}`);
      files.push(
        React.createElement(File, { name: filePath },
          React.createElement(ModelClass, { 
            schema: processedSchema, 
            params, 
            asyncapi,
            processedData, // <-- pass processedData to ModelClass
            extendsClass: processedSchema.extendsClass,
            namespace: processedSchema.namespace,
            className,
            parentProperties: processedSchema.parentProperties // <-- pass parentProperties
          })
        )
      );
    });

    // Generate application.yml in root (will be moved by post-hook)
    logger.debug('template/index.js: Template() - About to generate application.yml');
    files.push(
      React.createElement(File, { name: 'application.yml' },
        React.createElement(ApplicationYml, { params, asyncapi, processedData })
      )
    );

    logger.debug('template/index.js: Template() - All files generated successfully');
    return files;
  } catch (error) {
    logger.error('template/index.js: Template() - Error during template generation:', error);
    logger.error('template/index.js: Template() - Error stack:', error.stack);
    throw error;
  }
}

function getPackagePath(params, asyncapi) {
  logger.debug('template/index.js: getPackagePath() - Getting package path');
  if (params.javaPackage) {
    return params.javaPackage.replace(/\./g, '/');
  }
  if (asyncapi.info().extensions().get('x-java-package')) {
    return asyncapi.info().extensions().get('x-java-package').value().replace(/\./g, '/');
  }
  return 'com/company';
}

function getMainClassName(asyncapi, params) {
  logger.debug('template/index.js: getMainClassName() - Getting main class name');
  return 'Application';
}

function getSchemaPackagePath(schema, params, asyncapi) {
  logger.debug('template/index.js: getSchemaPackagePath() - Getting schema package path');
  // Check if schema has a namespace (for Avro schemas)
  const schemaName = schema.id();
  const dotIndex = schemaName.lastIndexOf('.');
  if (dotIndex > 0) {
    const namespace = schemaName.substring(0, dotIndex);
    return namespace.replace(/\./g, '/');
  }
  
  // Use the main package path
  return getPackagePath(params, asyncapi);
}

function getSchemaClassName(schemaName) {
  logger.debug('template/index.js: getSchemaClassName() - Getting schema class name');
  // Handle undefined or null schemaName
  if (!schemaName) {
    logger.warn('getSchemaClassName: schemaName is undefined or null, using default name "UnknownSchema"');
    return 'UnknownSchema';
  }
  
  // Ensure schemaName is a string
  const schemaNameStr = String(schemaName);
  const dotIndex = schemaNameStr.lastIndexOf('.');
  let className = dotIndex > 0 ? schemaNameStr.substring(dotIndex + 1) : schemaNameStr;
  
  // Remove special characters (matching reference project behavior)
  className = className.replace(/[^a-zA-Z0-9]/g, '');
  
  // Ensure it starts with uppercase
  className = className.charAt(0).toUpperCase() + className.slice(1);
  
  return className;
}

Template.getPackagePath = getPackagePath;
Template.getMainClassName = getMainClassName;
Template.getSchemaPackagePath = getSchemaPackagePath;
Template.getSchemaClassName = getSchemaClassName;
module.exports = Template;
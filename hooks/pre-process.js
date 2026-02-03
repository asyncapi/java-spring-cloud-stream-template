const _ = require('lodash');
const { logger, configureFromGenerator } = require('../utils/logger');
const { collectAvroPackagesFromMessages, findCommonParentPackage } = require('../utils/packageUtils');

/**
 * Pre-process hook that runs before file generation
 * Handles schema normalization and parameter setup
 */
module.exports = {
  'generate:before': generator => {
    // Configure logger based on generator's debug setting
    configureFromGenerator(generator);
    
    logger.debug('pre-process.js: generate:before() - Starting pre-process hook');
    logger.debug('Pre-process hook: Starting schema normalization...');
    
    // Normalize schema IDs for Java class names
    normalizeSchemaIds(generator.asyncapi);
    
    // Set up any additional parameters if needed
    setupTemplateParameters(generator);
    
    logger.debug('Pre-process hook: Schema normalization completed');
  }
};

/**
 * Normalize schema IDs to ensure valid Java class names
 */
function normalizeSchemaIds(asyncapi) {
  logger.debug('pre-process.js: normalizeSchemaIds() - Normalizing schema IDs');
  const schemas = asyncapi.allSchemas().all();
  if (!schemas) return;

  for (const schema of schemas) {
    const schemaName = schema.extensions().get('x-ep-schema-name')?.value() || schema.id();
    if (typeof schemaName !== 'string') {
      // logger.debug(`Skipping non-string schema key: ${schemaName}`);
      return;
    }
    if (schema.$id && typeof schema.$id === 'function') {
      const originalId = schema.$id();
      if (originalId) {
        // Check if this is a URI ID that should be mapped to a component name
        let className = originalId;
        
        if (originalId.startsWith('http://')) {
          // Try to map URI ID to component name
          const mappedComponentName = mapSchemaIdToComponentName(originalId, asyncapi);
          if (mappedComponentName) {
            className = mappedComponentName;
            logger.debug(`Pre-process: Mapped schema ID from "${originalId}" to component name "${className}"`);
          } else {
            // If no mapping found, extract just the filename
            if (originalId.includes('/')) {
              className = originalId.substring(originalId.lastIndexOf('/') + 1);
            }
            // Convert to valid Java class name (PascalCase)
            className = _.upperFirst(_.camelCase(className));
            logger.debug(`Pre-process: Normalized schema ID from "${originalId}" to "${className}"`);
          }
        } else {
          // If it's a full path, extract just the filename
          if (originalId.includes('/')) {
            className = originalId.substring(originalId.lastIndexOf('/') + 1);
          }
          
          // Convert to valid Java class name (PascalCase)
          className = _.upperFirst(_.camelCase(className));
          
          // Handle special cases
          if (className === 'Items') {
            // Handle array items - append 'Items' to parent class name
            className = 'Items';
          }
          
          logger.debug(`Pre-process: Normalized schema ID from "${originalId}" to "${className}"`);
        }
        
        // Update the schema ID for file naming
        schema._json.$id = className;
      }
    }
  }
}

/**
 * Map schema ID to component name for inline schemas
 * This handles cases like http://example.com/root.json -> RideReceipt
 */
function mapSchemaIdToComponentName(schemaId, asyncapi) {
  logger.debug(`🔍 DEBUG: mapSchemaIdToComponentName called with schemaId: ${schemaId}`);
  
  if (!schemaId || !schemaId.startsWith('http://')) {
    logger.debug(`❌ DEBUG: schemaId ${schemaId} is not a valid URI ID`);
    return null;
  }
  
  // Check if this URI ID matches any component schema
  // Try accessing components directly from JSON to get proper string keys
  const componentsJson = asyncapi._json && asyncapi._json.components;
  logger.debug(`🔍 DEBUG: componentsJson type: ${typeof componentsJson}`);
  
  if (componentsJson && componentsJson.schemas) {
    logger.debug(`🔍 DEBUG: Found components.schemas with keys: ${Object.keys(componentsJson.schemas).join(', ')}`);
    
    for (const [componentName, schema] of Object.entries(componentsJson.schemas)) {
      const schemaJsonId = schema.$id;
      logger.debug(`🔍 DEBUG: Component ${componentName} has $id: ${schemaJsonId}`);
      if (schemaJsonId === schemaId) {
        logger.debug(`✅ DEBUG: Found match! ${schemaId} -> ${componentName}`);
        logger.debug(`Pre-process: Mapped schema ID ${schemaId} to component name ${componentName}`);
        return componentName;
      }
    }
  }
  
  // Fallback to using the AsyncAPI library method
  const componentsSchemas = asyncapi.components().schemas();
  logger.debug(`🔍 DEBUG: componentsSchemas type: ${typeof componentsSchemas}, forEach: ${typeof componentsSchemas?.forEach}`);
  
  if (componentsSchemas) {
    if (typeof componentsSchemas.forEach === 'function') {
      let foundComponentName = null;
      componentsSchemas.forEach((schema, componentName) => {
        // Check if this component schema has the same URI ID
        const schemaJsonId = schema._json && schema._json.$id;
        logger.debug(`🔍 DEBUG: Component ${componentName} has $id: ${schemaJsonId}`);
        if (schemaJsonId === schemaId) {
          foundComponentName = componentName;
          logger.debug(`✅ DEBUG: Found match! ${schemaId} -> ${componentName}`);
        }
      });
      if (foundComponentName) {
        logger.debug(`Pre-process: Mapped schema ID ${schemaId} to component name ${foundComponentName}`);
        return foundComponentName;
      }
    }
  }
  
  logger.debug(`❌ DEBUG: No mapping found for schema ID ${schemaId}`);
  return null;
}

/**
 * Set up any additional template parameters
 */
function setupTemplateParameters(generator) {
  logger.debug('pre-process.js: setupTemplateParameters() - Setting up template parameters');
  const asyncapi = generator.asyncapi;
  const info = asyncapi.info();
  
  // Try to extract Java package from AVRO namespaces in messages
  // let javaPackage = extractJavaPackageFromAvroNamespaces(asyncapi);
  let javaPackage = null;
  
  // Fallback to extension or default
  if (!javaPackage) {
    if (!generator.templateParams.javaPackage) {
      const extensions = info.extensions();
      if (extensions && extensions.get('x-java-package')) {
        javaPackage = extensions.get('x-java-package').value();
      } else {
        javaPackage = 'com.company';
      }
    } else {
      javaPackage = generator.templateParams.javaPackage;
    }
  }
  
  // Set the Java package
  generator.templateParams.javaPackage = javaPackage;
  
  // Set default artifact type if not specified
  if (!generator.templateParams.artifactType) {
    generator.templateParams.artifactType = 'application';
  }
  
  logger.debug('Pre-process: Template parameters set up:', {
    javaPackage: generator.templateParams.javaPackage,
    artifactType: generator.templateParams.artifactType
  });
}

/**
 * Extract Java package from AVRO namespaces in messages
 * Uses shared utility from packageUtils.js
 */
function _extractJavaPackageFromAvroNamespaces(asyncapi) {
  logger.debug('pre-process.js: extractJavaPackageFromAvroNamespaces() - Extracting Java package from AVRO namespaces');
  try {
    // Collect all AVRO packages using shared utility
    const foundPackages = collectAvroPackagesFromMessages(asyncapi);

    if (foundPackages.size > 0) {
      const packages = Array.from(foundPackages);
      if (packages.length === 1) {
        return packages[0];
      }
      // Multiple packages found - try to find a common parent
      const commonParent = findCommonParentPackage(packages);
      if (commonParent) {
        return commonParent;
      }
      // If no common parent, use the first package
      return packages[0];
    }
  } catch (error) {
    logger.warn('Pre-process: Error extracting AVRO namespaces:', error.message);
  }

  return null;
}

// findCommonParentPackage is now imported from utils/packageUtils.js 
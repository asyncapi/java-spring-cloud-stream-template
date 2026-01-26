const fs = require('fs');
const path = require('path');
const { logger } = require('../utils/logger');

/**
 * Post-process hook that runs after file generation
 * Handles directory creation, file moving, and cleanup
 */
module.exports = {
  'generate:after': generator => {
    logger.debug('post-process.js: generate:after() - Starting post-process hook');
    logger.debug('Post-process hook: Starting file organization...');
    
    const targetDir = generator.targetDir;
    const javaPackage = generator.templateParams.javaPackage || 'com.company';
    const _packagePath = javaPackage.replace(/\./g, '/');

    // Create the main Java source directory structure
    const javaSourceDir = path.join(targetDir, 'src/main/java');
    ensureDirectoryExists(javaSourceDir);
    
    // Create resources directory
    const resourcesDir = path.join(targetDir, 'src/main/resources');
    ensureDirectoryExists(resourcesDir);
    
    // Move and organize generated files
    organizeGeneratedFiles(generator, targetDir, javaSourceDir, resourcesDir);
    
    // Copy the original AsyncAPI file to the generated root
    // Get the original file path from the generator context
    const originalAsyncApiFile = generator.originalAsyncApiFilePath;
    
    if (originalAsyncApiFile && fs.existsSync(originalAsyncApiFile)) {
      const destPath = path.join(targetDir, path.basename(originalAsyncApiFile));
      try {
        fs.copyFileSync(originalAsyncApiFile, destPath);
        logger.debug(`Copied original AsyncAPI file to generated root: ${destPath}`);
      } catch (err) {
        logger.warn(`Failed to copy AsyncAPI file to generated root: ${err.message}`);
      }
    } else {
      logger.warn(`Could not find original AsyncAPI file at: ${originalAsyncApiFile}`);
    }
    
    logger.debug('Post-process hook: File organization completed');
  }
};

/**
 * Ensure a directory exists, creating it if necessary
 */
function ensureDirectoryExists(dirPath) {
  logger.debug('post-process.js: ensureDirectoryExists() - Ensuring directory exists');
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    logger.debug(`Post-process: Created directory: ${dirPath}`);
  }
}

/**
 * Organize generated files into their correct locations
 */
function organizeGeneratedFiles(generator, targetDir, javaSourceDir, resourcesDir) {
  logger.debug('post-process.js: organizeGeneratedFiles() - Organizing generated files');
  const files = fs.readdirSync(targetDir);
  
  files.forEach(file => {
    const filePath = path.join(targetDir, file);
    const stats = fs.statSync(filePath);
    
    if (stats.isFile()) {
      // Handle Java files
      if (file.endsWith('.java')) {
        // Filter out files that shouldn't be Java classes
        if (shouldKeepJavaFile(file, generator)) {
          moveJavaFileWithPackage(filePath, javaSourceDir, file, generator);
        } else {
          logger.debug(`Post-process: Removing unwanted Java file: ${file}`);
          fs.unlinkSync(filePath);
        }
      } else if (file.endsWith('.yml') || file.endsWith('.yaml') || file.endsWith('.properties')) {
        // Handle YAML/Properties files
        moveResourceFile(filePath, resourcesDir, file);
      } else if (file === 'pom.xml' || file === 'README.md' || file === 'package.json' || file === 'package-lock.json') {
        // Keep pom.xml and README.md in root
        logger.debug(`Post-process: Keeping ${file} in root directory`);
      } else {
        // Clean up any other files that shouldn't be in root
        logger.debug(`Post-process: Removing unexpected file: ${file}`);
        fs.unlinkSync(filePath);
      }
    }
  });
}

/**
 * Move Java file to proper package directory structure
 */
function moveJavaFileWithPackage(sourcePath, targetDir, fileName, generator) {
  logger.debug('post-process.js: moveJavaFileWithPackage() - Moving Java file to package directory');
  const schemaName = fileName.replace('.java', '');
  
  // Special handling for Application.java - use javaPackage parameter
  if (schemaName === 'Application') {
    const javaPackage = generator.templateParams.javaPackage || 'com.company';
    const packagePath = javaPackage.replace(/\./g, '/');
    const packageDir = path.join(targetDir, packagePath);
    ensureDirectoryExists(packageDir);

    // Move file to package directory
    const targetPath = path.join(packageDir, fileName);
    fs.renameSync(sourcePath, targetPath);
    if (fs.existsSync(sourcePath)) {
      fs.unlinkSync(sourcePath);
    }
    logger.debug(`Post-process: Moved ${fileName} to package ${javaPackage}`);

    // Update the file content to include package declaration
    updatePackageDeclaration(targetPath, javaPackage);
    return;
  }
  
  // Check if this file is already in a namespace directory (Avro schema)
  const _sourceDir = path.dirname(sourcePath);
  const relativePath = path.relative(generator.targetDir, sourcePath);
  
  // If the file is already in src/main/java/package/path/ structure, it's an Avro schema
  if (relativePath.startsWith('src/main/java/') && relativePath.includes('/')) {
    logger.debug(`Post-process: File ${fileName} is already in correct namespace location: ${relativePath}`);
    // File is already in the right place, just ensure package declaration is correct
    const packagePath = relativePath.replace('src/main/java/', '').replace(`/${fileName}`, '');
    const javaPackage = packagePath.replace(/\//g, '.');
    updatePackageDeclaration(sourcePath, javaPackage);
    return;
  }
  
  // Get package information for this schema (existing logic for non-Avro schemas)
  const packageInfo = getPackageInfo(schemaName, generator);

  if (packageInfo && packageInfo.javaPackage) {
    // Create package directory structure
    const packagePath = packageInfo.javaPackage.replace(/\./g, '/');
    const packageDir = path.join(targetDir, packagePath);
    ensureDirectoryExists(packageDir);

    // Move file to package directory
    const targetPath = path.join(packageDir, fileName);
    fs.renameSync(sourcePath, targetPath);
    // Remove any leftover file in the original location (shouldn't exist, but just in case)
    if (fs.existsSync(sourcePath)) {
      fs.unlinkSync(sourcePath);
    }
    logger.debug(`Post-process: Moved ${fileName} to package ${packageInfo.javaPackage}`);

    // Update the file content to include package declaration
    updatePackageDeclaration(targetPath, packageInfo.javaPackage);
  } else {
    // For schema classes that don't have explicit package info, use the default package
    const defaultPackage = 'com.company';
    const packagePath = defaultPackage.replace(/\./g, '/');
    const packageDir = path.join(targetDir, packagePath);
    ensureDirectoryExists(packageDir);

    // Move file to package directory
    const targetPath = path.join(packageDir, fileName);
    fs.renameSync(sourcePath, targetPath);
    if (fs.existsSync(sourcePath)) {
      fs.unlinkSync(sourcePath);
    }
    logger.debug(`Post-process: Moved ${fileName} to default package ${defaultPackage}`);

    // Update the file content to include package declaration
    updatePackageDeclaration(targetPath, defaultPackage);
  }
}

/**
 * Get package information for a schema
 */
function getPackageInfo(schemaName, generator) {
  logger.debug('post-process.js: getPackageInfo() - Getting package information for schema');
  try {
    const asyncapi = generator.asyncapi;
    
    // First, try the existing logic for regular schemas (preserve current functionality)
    const schemas = asyncapi.allSchemas().all();
    if (schemas) {
      let foundSchema = null;
      schemas.forEach((schema, key) => {
        if (typeof key !== 'string') {
          // logger.debug(`Skipping non-string schema key: ${key}`);
          return;
        }
        const id = schema.id && typeof schema.id === 'function' ? schema.id() : null;
        if (id === schemaName) {
          foundSchema = schema;
        }
      });
      
      if (foundSchema) {
        logger.debug(`Post-process: Found schema for ${schemaName}`);
        
        // Check if schema has a namespace (for Avro schemas)
        const schemaId = foundSchema.id();
        const dotIndex = schemaId.lastIndexOf('.');
        if (dotIndex > 0) {
          const javaPackage = schemaId.substring(0, dotIndex);
          const className = schemaId.substring(dotIndex + 1);
          logger.debug(`Post-process: Found namespace in schema ID: ${javaPackage}.${className}`);
          return { javaPackage, className };
        }
        
        // Check for namespace in schema's _json property (AVRO schemas)
        const schemaData = foundSchema._json;
        if (schemaData && schemaData.namespace) {
          const javaPackage = schemaData.namespace;
          const className = schemaData.name || schemaName;
          logger.debug(`Post-process: Found namespace in _json: ${javaPackage}.${className}`);
          return { javaPackage, className };
        }
        
        logger.debug(`Post-process: No namespace found for ${schemaName}, schemaData:`, JSON.stringify(schemaData, null, 2));
      }
    }
    
    // Additional check: Look for AVRO schemas in message payloads (new functionality)
    const avroPackageInfo = getAvroPackageInfoFromMessages(schemaName, asyncapi);
    if (avroPackageInfo) {
      logger.debug(`Post-process: Found AVRO schema in message payloads: ${avroPackageInfo.javaPackage}.${avroPackageInfo.className}`);
      return avroPackageInfo;
    }
    
    // Final check: Read package information from the generated Java file (only if no AVRO info found)
    const filePackageInfo = getPackageInfoFromFile(schemaName, generator.targetDir);
    if (filePackageInfo) {
      logger.debug(`Post-process: Found package info in generated file: ${filePackageInfo.javaPackage}.${filePackageInfo.className}`);
      return filePackageInfo;
    }
    
    // Default fallback
    logger.debug(`Post-process: No package info found for ${schemaName}, using default`);
    return { javaPackage: null, className: schemaName };
  } catch (error) {
    logger.warn(`Post-process: Error getting package info for ${schemaName}:`, error.message);
    return { javaPackage: null, className: schemaName };
  }
}

/**
 * Get package information from generated Java file
 */
function getPackageInfoFromFile(schemaName, targetDir) {
  logger.debug('post-process.js: getPackageInfoFromFile() - Getting package info from generated file');
  try {
    const filePath = path.join(targetDir, `${schemaName}.java`);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      const packageMatch = content.match(/^package\s+([^;]+);/m);
      if (packageMatch) {
        const javaPackage = packageMatch[1].trim();
        return { javaPackage, className: schemaName };
      }
    }
  } catch (error) {
    logger.warn(`Post-process: Error reading package info from file for ${schemaName}:`, error.message);
  }
  return null;
}

/**
 * Get AVRO package information from message payloads
 */
function getAvroPackageInfoFromMessages(schemaName, asyncapi) {
  logger.debug('post-process.js: getAvroPackageInfoFromMessages() - Getting AVRO package info from messages');
  try {
    // Check components.messages for AVRO schemas
    const messages = asyncapi.components().messages();
    if (messages) {
      // Try different ways to iterate over messages
      if (typeof messages.forEach === 'function') {
        messages.forEach((msg, msgName) => {
          try {
            // Check the message's _json property for AVRO namespace
            if (msg._json && msg._json.payload) {
              const payloadData = msg._json.payload;
              
              // Check for AVRO namespace in x-parser-schema-id
              if (payloadData && payloadData['x-parser-schema-id']) {
                const schemaId = payloadData['x-parser-schema-id'];
                
                // Extract package and class name from schema ID (e.g., "com.example.api.jobOrder.JobOrder")
                const lastDotIndex = schemaId.lastIndexOf('.');
                if (lastDotIndex > 0) {
                  const javaPackage = schemaId.substring(0, lastDotIndex);
                  const className = schemaId.substring(lastDotIndex + 1);
                  
                  // Check if this matches our schema name
                  if (className === schemaName) {
                    logger.debug(`Post-process: Found AVRO schema match in components.messages: ${javaPackage}.${className}`);
                    return { javaPackage, className };
                  }
                }
              }
              
              // Fallback: Check for name and namespace fields (original AVRO format)
              if (payloadData && payloadData.namespace && payloadData.name) {
                const javaPackage = payloadData.namespace;
                const className = payloadData.name;
                
                // Check if this matches our schema name
                if (className === schemaName) {
                  logger.debug(`Post-process: Found AVRO schema match in components.messages: ${javaPackage}.${className}`);
                  return { javaPackage, className };
                }
              }
            }
          } catch (error) {
            logger.warn(`Post-process: Error processing message ${msgName}:`, error.message);
          }
        });
      }
    }
    
    // Also check for AVRO schemas in channel operations (inline messages)
    const channels = asyncapi.channels();
    if (channels && typeof channels.values === 'function') {
      for (const channel of channels.values()) {
        const channelName = channel.id();
        
        // Get all operations for this channel
        const operations = channel.operations && typeof channel.operations === 'function'
          ? Array.from(channel.operations().values())
          : [];

        // Check all operations for Avro messages
        for (const operation of operations) {
          try {
            const messages = operation.messages && typeof operation.messages === 'function'
              ? Array.from(operation.messages().values())
              : [];
            
            for (const message of messages) {
              const schemaFormat = message.schemaFormat && message.schemaFormat();
              if (schemaFormat && schemaFormat.includes('avro')) {
                // This is an Avro message, check for namespace
                const payload = message.payload && message.payload();
                if (payload && payload._json) {
                  const payloadData = payload._json;
                  
                  // Check for name and namespace fields (original Avro format)
                  if (payloadData.namespace && payloadData.name) {
                    const javaPackage = payloadData.namespace;
                    const className = payloadData.name;
                    
                    // Check if this matches our schema name
                    if (className === schemaName) {
                      logger.debug(`Post-process: Found AVRO schema match in channel operations: ${javaPackage}.${className}`);
                      return { javaPackage, className };
                    }
                  }
                  
                  // Check for namespace in x-parser-schema-id (transformed Avro format)
                  if (payloadData['x-parser-schema-id']) {
                    const schemaId = payloadData['x-parser-schema-id'];
                    
                    // Extract package and class name from schema ID (e.g., "userpublisher.User")
                    const lastDotIndex = schemaId.lastIndexOf('.');
                    if (lastDotIndex > 0) {
                      const javaPackage = schemaId.substring(0, lastDotIndex);
                      const className = schemaId.substring(lastDotIndex + 1);
                      
                      // Check if this matches our schema name
                      if (className === schemaName) {
                        logger.debug(`Post-process: Found AVRO schema match in channel operations via x-parser-schema-id: ${javaPackage}.${className}`);
                        return { javaPackage, className };
                      }
                    }
                  }
                }
              }
            }
          } catch (error) {
            logger.warn(`Post-process: Error checking channel ${channelName} operation for AVRO namespace:`, error.message);
          }
        }
      }
    }
  } catch (error) {
    logger.warn('Post-process: Error extracting AVRO package info from messages:', error.message);
  }
  
  return null;
}

/**
 * Update package declaration in Java file
 */
function updatePackageDeclaration(filePath, javaPackage) {
  logger.debug('post-process.js: updatePackageDeclaration() - Updating package declaration in Java file');
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Check if package declaration already exists
    const packageMatch = content.match(/^package\s+([^;]+);/m);
    if (packageMatch) {
      const currentPackage = packageMatch[1].trim();
      if (currentPackage !== javaPackage) {
        // Update existing package declaration
        content = content.replace(/^package\s+[^;]+;/m, `package ${javaPackage};`);
        fs.writeFileSync(filePath, content, 'utf8');
        logger.debug(`Post-process: Updated package declaration from ${currentPackage} to ${javaPackage}`);
      }
    } else {
      // Add package declaration at the beginning
      content = `package ${javaPackage};\n\n${content}`;
      fs.writeFileSync(filePath, content, 'utf8');
      logger.debug(`Post-process: Added package declaration: ${javaPackage}`);
    }
  } catch (error) {
    logger.warn(`Post-process: Error updating package declaration in ${filePath}:`, error.message);
  }
}

/**
 * Determine if a Java file should be kept
 * Since pre-processing now handles all schema filtering, we keep all files that reach this point
 */
function shouldKeepJavaFile(fileName, generator) {
  const schemaName = fileName.replace('.java', '');
  logger.debug(`[shouldKeepJavaFile] Keeping ${schemaName}.java (pre-filtered by schema collection)`);
  return true; // Keep all files that made it through pre-processing
}

/**
 * Move resource file to resources directory
 */
function moveResourceFile(sourcePath, targetDir, fileName) {
  logger.debug('post-process.js: moveResourceFile() - Moving resource file to resources directory');
  const targetPath = path.join(targetDir, fileName);
  fs.renameSync(sourcePath, targetPath);
  logger.debug(`Post-process: Moved ${fileName} to resources directory`);
} 
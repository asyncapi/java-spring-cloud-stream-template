const { logger } = require('./logger');

/**
 * Extract Java package and class name from a fully qualified schema ID
 * Example: "com.example.api.jobOrder.JobOrder" -> { javaPackage: "com.example.api.jobOrder", className: "JobOrder" }
 *
 * @param {string} schemaId - The fully qualified schema ID
 * @returns {Object|null} Object with javaPackage and className, or null if not extractable
 */
function extractPackageFromSchemaId(schemaId) {
  if (!schemaId || typeof schemaId !== 'string') {
    return null;
  }

  const lastDotIndex = schemaId.lastIndexOf('.');
  if (lastDotIndex > 0) {
    return {
      javaPackage: schemaId.substring(0, lastDotIndex),
      className: schemaId.substring(lastDotIndex + 1)
    };
  }

  return null;
}

/**
 * Extract AVRO package information from message payload data
 * Checks both x-parser-schema-id and namespace/name fields
 *
 * @param {Object} payloadData - The message payload _json data
 * @param {string|null} targetSchemaName - Optional: only return if className matches this name
 * @returns {Object|null} Object with javaPackage and className, or null if not found
 */
function extractAvroPackageFromPayload(payloadData, targetSchemaName = null) {
  if (!payloadData) {
    return null;
  }

  // Check for AVRO namespace in x-parser-schema-id
  if (payloadData['x-parser-schema-id']) {
    const packageInfo = extractPackageFromSchemaId(payloadData['x-parser-schema-id']);
    if (packageInfo) {
      // If targetSchemaName specified, only return if it matches
      if (targetSchemaName && packageInfo.className !== targetSchemaName) {
        return null;
      }
      return packageInfo;
    }
  }

  // Fallback: Check for name and namespace fields (original AVRO format)
  if (payloadData.namespace) {
    const className = payloadData.name || null;
    if (className) {
      // If targetSchemaName specified, only return if it matches
      if (targetSchemaName && className !== targetSchemaName) {
        return null;
      }
      return {
        javaPackage: payloadData.namespace,
        className
      };
    }
  }

  return null;
}

/**
 * Extract AVRO package information from AsyncAPI messages
 * Iterates through components.messages looking for AVRO schemas
 *
 * @param {Object} asyncapi - The AsyncAPI document
 * @param {string|null} targetSchemaName - Optional: only return if className matches this name
 * @returns {Object|null} Object with javaPackage and className, or null if not found
 */
function extractAvroPackageFromMessages(asyncapi, targetSchemaName = null) {
  try {
    const messages = asyncapi.components().messages();
    if (!messages || typeof messages.forEach !== 'function') {
      return null;
    }

    let result = null;
    messages.forEach((msg, _msgName) => {
      if (result) return; // Already found

      try {
        if (msg._json && msg._json.payload) {
          const packageInfo = extractAvroPackageFromPayload(msg._json.payload, targetSchemaName);
          if (packageInfo) {
            result = packageInfo;
          }
        }
      } catch (error) {
        logger.warn('packageUtils: Error processing message for AVRO package:', error.message);
      }
    });

    return result;
  } catch (error) {
    logger.warn('packageUtils: Error extracting AVRO package from messages:', error.message);
    return null;
  }
}

/**
 * Extract AVRO package information from AsyncAPI channel operations
 * Checks inline messages in channel operations for AVRO schemas
 *
 * @param {Object} asyncapi - The AsyncAPI document
 * @param {string|null} targetSchemaName - Optional: only return if className matches this name
 * @returns {Object|null} Object with javaPackage and className, or null if not found
 */
function extractAvroPackageFromChannels(asyncapi, targetSchemaName = null) {
  try {
    const channels = asyncapi.channels();
    if (!channels || typeof channels.values !== 'function') {
      return null;
    }

    for (const channel of channels.values()) {
      const operations = channel.operations && typeof channel.operations === 'function'
        ? Array.from(channel.operations().values())
        : [];

      for (const operation of operations) {
        try {
          const messages = operation.messages && typeof operation.messages === 'function'
            ? Array.from(operation.messages().values())
            : [];

          for (const message of messages) {
            const schemaFormat = message.schemaFormat && message.schemaFormat();
            if (schemaFormat && schemaFormat.includes('avro')) {
              const payload = message.payload && message.payload();
              if (payload && payload._json) {
                const packageInfo = extractAvroPackageFromPayload(payload._json, targetSchemaName);
                if (packageInfo) {
                  return packageInfo;
                }
              }
            }
          }
        } catch (error) {
          logger.warn('packageUtils: Error checking channel operation for AVRO namespace:', error.message);
        }
      }
    }
  } catch (error) {
    logger.warn('packageUtils: Error extracting AVRO package from channels:', error.message);
  }

  return null;
}

/**
 * Extract all unique Java packages from AVRO namespaces in AsyncAPI messages
 * Used for pre-processing to collect all packages
 *
 * @param {Object} asyncapi - The AsyncAPI document
 * @returns {Set} Set of unique Java package names
 */
function collectAvroPackagesFromMessages(asyncapi) {
  const foundPackages = new Set();

  try {
    const messages = asyncapi.components().messages();
    if (!messages || typeof messages.forEach !== 'function') {
      return foundPackages;
    }

    messages.forEach((msg, _msgName) => {
      try {
        if (msg._json && msg._json.payload) {
          const packageInfo = extractAvroPackageFromPayload(msg._json.payload);
          if (packageInfo && packageInfo.javaPackage) {
            foundPackages.add(packageInfo.javaPackage);
            logger.debug(`packageUtils: Found AVRO namespace: ${packageInfo.javaPackage}`);
          }
        }
      } catch (error) {
        logger.warn('packageUtils: Error processing message for AVRO package collection:', error.message);
      }
    });
  } catch (error) {
    logger.warn('packageUtils: Error collecting AVRO packages from messages:', error.message);
  }

  return foundPackages;
}

/**
 * Find common parent package from multiple packages
 *
 * @param {Array} packages - Array of package names
 * @returns {string|null} Common parent package or null
 */
function findCommonParentPackage(packages) {
  if (!packages || packages.length === 0) return null;
  if (packages.length === 1) return packages[0];

  // Sort packages by length (shortest first)
  const sortedPackages = [...packages].sort((a, b) => a.length - b.length);
  const shortest = sortedPackages[0];

  // Find the longest common prefix
  let commonPrefix = '';
  const parts = shortest.split('.');

  for (let i = 0; i < parts.length; i++) {
    const testPrefix = parts.slice(0, i + 1).join('.');
    const allMatch = packages.every(pkg => pkg.startsWith(`${testPrefix}.`) || pkg === testPrefix);

    if (allMatch) {
      commonPrefix = testPrefix;
    } else {
      break;
    }
  }

  return commonPrefix || null;
}

module.exports = {
  extractPackageFromSchemaId,
  extractAvroPackageFromPayload,
  extractAvroPackageFromMessages,
  extractAvroPackageFromChannels,
  collectAvroPackagesFromMessages,
  findCommonParentPackage
};

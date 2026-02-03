const React = require('react');
const { Text } = require('@asyncapi/generator-react-sdk');
const { logger } = require('../utils/logger');
const { toPascalCase } = require('../utils/typeUtils');

/**
 * Convert channel path to method name
 * Transforms channel paths to PascalCase method names
 * Example: 'company/service/operation/v1/{param1}/{param2}' 
 * to 'CompanyServiceOperationV1Param1Param2'
 */
function toMethodName(str) {
  logger.debug('Application.js: toMethodName() - Converting channel path to method name');
  if (!str) return '';
  
  // Remove curly braces first
  const cleaned = str.replace(/([{}])/g, '');
  
  // Split by slashes to handle channel path structure
  const segments = cleaned.split('/');
  
  return segments.map(segment => {
    if (!segment) return '';
    
    // Handle version numbers (v1, v2, v3, v10, v2.1, etc.)
    if (segment.toLowerCase().match(/^v\d+(\.\d+)*$/)) {
      return segment.toUpperCase();
    }
    
    // Handle camelCase parameters (e.g., 'userId' -> 'UserId')
    if (segment.match(/^[a-z]+[A-Z][A-Z]/)) {
      return segment.charAt(0).toUpperCase() + segment.slice(1).replace(/([A-Z])([A-Z])/, (match, p1, p2) => {
        return p1 + p2.toLowerCase();
      });
    }
    
    // Handle camelCase segments (e.g., 'creditCard' -> 'CreditCard')
    if (segment.match(/^[a-z]+[A-Z][a-z]+/)) {
      return segment.charAt(0).toUpperCase() + segment.slice(1);
    }
    
    // For other segments, capitalize first letter, lowercase the rest
    return segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase();
  }).join('');
}

/**
 * Convert parameter name to camelCase (e.g., 'userId' -> 'userId')
 */
function toParameterName(str) {
  logger.debug('Application.js: toParameterName() - Converting parameter name to camelCase');
  if (!str) return '';
  
  // Remove curly braces first
  const cleaned = str.replace(/([{}])/g, '');
  
  // Convert to proper camelCase (e.g., 'userId' -> 'userId', 'orderID' -> 'orderId')
  // Handle cases where we have consecutive uppercase letters anywhere in the string
  if (cleaned.match(/[A-Z][A-Z]/)) {
    // Convert consecutive uppercase letters to proper camelCase
    return cleaned.replace(/([A-Z])([A-Z])/g, (match, p1, p2) => {
      return p1 + p2.toLowerCase();
    });
  }
  
  // For simple parameters, just lowercase
  return cleaned.toLowerCase();
}

/**
 * Get proper initialization value for Java types
 */
function getInitializationValue(payloadType) {
  // Handle List types
  if (payloadType.startsWith('List<')) {
    return 'new java.util.ArrayList<>()';
  }
  
  switch (payloadType) {
  case 'String':
    return '""';
  case 'Integer':
    return '0';
  case 'Long':
    return '0L';
  case 'Float':
    return '0.0f';
  case 'Double':
    return '0.0';
  case 'Boolean':
    return 'false';
  case 'java.time.OffsetDateTime':
    return 'java.time.OffsetDateTime.now()';
  case 'java.time.LocalDate':
    return 'java.time.LocalDate.now()';
  case 'java.time.LocalTime':
    return 'java.time.LocalTime.now()';
  case 'java.time.LocalDateTime':
    return 'java.time.LocalDateTime.now()';
  case 'java.time.Instant':
    return 'java.time.Instant.now()';
  case 'java.math.BigDecimal':
    return 'java.math.BigDecimal.ZERO';
  case 'byte[]':
    return 'new byte[0]';
  case 'Object':
    return 'new Object()';
  default:
    // For complex types, use constructor
    return `new ${payloadType}()`;
  }
}

/**
 * Convert enum value to valid Java enum constant
 * Handles various data formats: numeric, hyphens, spaces, camelCase
 *
 * @param {string|number} value - The enum value to convert
 * @returns {string} Valid Java enum constant
 */
function toJavaEnumConstant(value) {
  if (typeof value === 'string') {
    // CASE 1: Numeric values - prefix with "V_" (Java constants can't start with numbers)
    if ((/^\d+$/).test(value)) {
      return `V_${value}`;
    }
    // CASE 2: Values with hyphens - convert to underscores
    if (value.includes('-')) {
      return value.replace(/-/g, '_');
    }
    // CASE 3: Values with spaces - convert to underscores
    if (value.includes(' ')) {
      return value.replace(/\s+/g, '_');
    }
    // CASE 4: camelCase or other valid values - return as-is
    return value;
  }
  // CASE 5: Non-string values - convert to string
  return String(value);
}

/**
 * Generate Java validation code for enum parameter normalization
 * Produces code that normalizes input values to match generated enum constants
 *
 * @param {string} paramName - The parameter variable name
 * @param {string} enumName - The enum class name
 * @param {Array} enumValues - Array of original enum values
 * @param {string} indent - Indentation string for generated code
 * @param {string|null} resultVar - Optional variable name for storing validated enum (null for simple valueOf call)
 * @returns {Array} Array of code lines
 */
function generateEnumValidationCode(paramName, enumName, enumValues, indent, resultVar = null) {
  const code = [];
  const hasSpaces = enumValues.some(v => typeof v === 'string' && v.includes(' '));
  const hasNumericValues = enumValues.some(v => typeof v === 'string' && (/^\d+$/).test(v));

  // Build the valueOf call based on whether we need to store the result
  const valueOfCall = resultVar
    ? `${enumName} ${resultVar} = ${enumName}.valueOf(normalizedValue);`
    : `${enumName}.valueOf(normalizedValue);`;
  const directValueOfCall = resultVar
    ? `${enumName} ${resultVar} = ${enumName}.valueOf(${paramName});`
    : `${enumName}.valueOf(${paramName});`;

  if (hasSpaces && hasNumericValues) {
    // CASE 1: Mixed enum values (both spaces and numeric values)
    code.push(`${indent}String normalizedValue;`);
    code.push(`${indent}if (${paramName}.matches("^\\\\d+$")) {`);
    code.push(`${indent}  // Numeric input: prefix with "V_" to match enum constant`);
    code.push(`${indent}  normalizedValue = "V_" + ${paramName};`);
    code.push(`${indent}} else {`);
    code.push(`${indent}  // String input with spaces: convert to underscores`);
    code.push(`${indent}  normalizedValue = ${paramName}.replace(" ", "_");`);
    code.push(`${indent}}`);
    code.push(`${indent}${valueOfCall}`);
  } else if (hasSpaces) {
    // CASE 2: Only string values with spaces
    code.push(`${indent}// Normalize string values: spaces -> underscores`);
    code.push(`${indent}String normalizedValue = ${paramName}.replace(" ", "_");`);
    code.push(`${indent}${valueOfCall}`);
  } else if (hasNumericValues) {
    // CASE 3: Only numeric values
    code.push(`${indent}// Normalize numeric values: prefix with "V_" if numeric`);
    code.push(`${indent}String normalizedValue = ${paramName}.matches("^\\\\d+$") ? "V_" + ${paramName} : ${paramName};`);
    code.push(`${indent}${valueOfCall}`);
  } else {
    // CASE 4: Simple string values (camelCase, etc.) - no normalization needed
    code.push(`${indent}// Direct validation for simple string values`);
    code.push(`${indent}${directValueOfCall}`);
  }
  return code;
}

/**
 * Application component for generating Spring Boot Application.java
 * Matches the reference project output exactly
 */
function Application({ asyncapi, params, processedData }) {
  logger.debug('Application.js: Application() - Generating Application.java component');
  const funcs = processedData.functions || [];
  const extraIncludes = processedData.extraIncludes || [];
  const imports = processedData.imports || [];
  
  logger.debug(`Application.js: extraIncludes (${extraIncludes.length}):`, extraIncludes);
  logger.debug(`Application.js: imports (${imports.length}):`, imports);

  // Get package name
  const packageName = getPackageName(params, asyncapi);

  // Filter functions by type
  const consumerFunctions = funcs.filter(func => func.type === 'consumer');
  const supplierFunctions = funcs.filter(func => func.type === 'supplier');
  const functionFunctions = funcs.filter(func => func.type === 'function');
  const sendFunctions = funcs.filter(func => func.type === 'send');

  const elements = [];

  // Package declaration
  elements.push(React.createElement(Text, null, `package ${packageName};`));
  elements.push(React.createElement(Text, null, ''));

  // Build imports dynamically based on what's actually used
  const usedImports = new Set();
  usedImports.add('org.springframework.boot.SpringApplication');
  usedImports.add('org.springframework.boot.autoconfigure.SpringBootApplication');
  usedImports.add('org.slf4j.Logger');
  usedImports.add('org.slf4j.LoggerFactory');
  if (consumerFunctions.length > 0) usedImports.add('java.util.function.Consumer');
  if (supplierFunctions.length > 0) usedImports.add('java.util.function.Supplier');
  if (functionFunctions.length > 0) usedImports.add('java.util.function.Function');
  if (consumerFunctions.length > 0 || supplierFunctions.length > 0 || functionFunctions.length > 0) {
    usedImports.add('org.springframework.context.annotation.Bean');
      
    // Only add Message import if functions actually use Message types
    const usesMessageTypes = funcs.some(f => 
      f.publishPayload === 'Message<?>' || 
        f.subscribePayload === 'Message<?>' ||
        f.publishPayload === 'Message<Object>' || 
        f.subscribePayload === 'Message<Object>' ||
        (f.publishPayload && f.publishPayload.startsWith('Message<')) ||
        (f.subscribePayload && f.subscribePayload.startsWith('Message<')) ||
        f.hasEnumParameters
    );
    if (usesMessageTypes) {
      usedImports.add('org.springframework.messaging.Message');
    }
      
    // Add MessageBuilder import if we have Message<?> payload types
    if (funcs.some(f => f.publishPayload === 'Message<?>' || f.subscribePayload === 'Message<?>')) {
      usedImports.add('org.springframework.messaging.support.MessageBuilder');
    }
  }
  if (sendFunctions.length > 0 || funcs.some(f => f.dynamic)) {
    if (params.dynamicType === 'streamBridge') {
      usedImports.add('org.springframework.beans.factory.annotation.Autowired');
      usedImports.add('org.springframework.cloud.stream.function.StreamBridge');
    } else {
      // For header mode, we still need StreamBridge and Message imports
      usedImports.add('org.springframework.beans.factory.annotation.Autowired');
      usedImports.add('org.springframework.cloud.stream.function.StreamBridge');
      usedImports.add('org.springframework.cloud.stream.binder.BinderHeaders');
      usedImports.add('org.springframework.messaging.Message');
      usedImports.add('org.springframework.messaging.support.MessageBuilder');
    }
  }
  
  // Add Arrays import if we have enum validation (in send functions or consumer functions)
  const hasEnumValidation = sendFunctions.some(func => 
    func.parameters && func.parameters.some(param => param.hasEnum)
  ) || consumerFunctions.some(func => 
    func.parameters && func.parameters.some(param => param.hasEnum)
  );
  if (hasEnumValidation) {
    usedImports.add('java.util.Arrays');
  }
  
  // Add List import if any function uses List types
  const usesListTypes = funcs.some(f => 
    (f.publishPayload && f.publishPayload.startsWith('List<')) || 
    (f.subscribePayload && f.subscribePayload.startsWith('List<'))
  );
  if (usesListTypes) {
    usedImports.add('java.util.List');
  }
  // Only add MessageBuilder import if any function actually uses it
  let needsMessageBuilder = false;
  funcs.forEach(func => {
    if ((func.type === 'supplier' || func.type === 'function') && func.dynamic) {
      needsMessageBuilder = true;
    }
  });
  // Also check sendFunctions for dynamic send logic (if any in future)
  // (Currently, send methods do not use MessageBuilder, so we skip)
  if (needsMessageBuilder) {
    usedImports.add('org.springframework.messaging.support.MessageBuilder');
  }
  if (params.reactive === true || params.reactive === 'true') {
    usedImports.add('reactor.core.publisher.Flux');
  }
  // Add imports in the correct order (matching reference)
  const importOrder = [
    'java.util.Arrays',
    'java.util.List',
    'java.util.function.Consumer',
    'java.util.function.Supplier',
    'java.util.function.Function',
    'org.slf4j.Logger',
    'org.slf4j.LoggerFactory',
    'org.springframework.beans.factory.annotation.Autowired',
    'org.springframework.boot.SpringApplication',
    'org.springframework.boot.autoconfigure.SpringBootApplication',
    'org.springframework.cloud.stream.function.StreamBridge',
    'org.springframework.cloud.stream.binder.BinderHeaders',
    'org.springframework.context.annotation.Bean',
    'org.springframework.messaging.Message',
    'org.springframework.messaging.support.MessageBuilder',
    'reactor.core.publisher.Flux'
  ];
  const addedImports = new Set();
  importOrder.forEach(importName => {
    if (usedImports.has(importName) && !addedImports.has(importName)) {
      elements.push(React.createElement(Text, null, `import ${importName};`));
      addedImports.add(importName);
    }
  });
  if (extraIncludes && extraIncludes.length > 0) {
    extraIncludes.forEach(include => {
      // Filter out JsonProperty import as it's not needed in Application.java
      if (!include.includes('JsonProperty')) {
        elements.push(React.createElement(Text, null, `import ${include};`));
      }
    });
  }
  // Add schema imports (for Avro namespaces, etc.)
  if (imports && imports.length > 0) {
    imports.forEach(importName => {
      // Filter out JsonProperty import as it's not needed in Application.java
      if (!importName.includes('JsonProperty') && !addedImports.has(importName)) {
        elements.push(React.createElement(Text, null, `import ${importName};`));
        addedImports.add(importName);
      }
    });
  }
  elements.push(React.createElement(Text, null, ''));
  elements.push(React.createElement(Text, null, '@SpringBootApplication'));
  elements.push(React.createElement(Text, null, 'public class Application {'));
  elements.push(React.createElement(Text, null, '  private static final Logger logger = LoggerFactory.getLogger(Application.class);'));
  elements.push(React.createElement(Text, null, ''));
  // Add StreamBridge field for send methods or dynamic functions
  if (sendFunctions.length > 0 || funcs.some(f => f.dynamic)) {
    // StreamBridge is needed for both streamBridge and header modes
    elements.push(React.createElement(Text, null, '  @Autowired'));
    elements.push(React.createElement(Text, null, '  private StreamBridge streamBridge;'));
    elements.push(React.createElement(Text, null, ''));
  }
  elements.push(React.createElement(Text, null, '  public static void main(String[] args) {'));
  elements.push(React.createElement(Text, null, '    SpringApplication.run(Application.class);'));
  elements.push(React.createElement(Text, null, '  }'));
  // Generate function beans
  funcs.forEach(func => {
    if (func.type === 'send') return;

    const _payloadType = func.subscribePayload || func.publishPayload || 'Object';
      
    // Add multiple message comment if present
    if (func.multipleMessageComment) {
      const commentLines = func.multipleMessageComment.split('\n');
      commentLines.forEach(line => {
        if (line.trim()) {
          elements.push(React.createElement(Text, null, `  ${line}`));
        }
      });
    }
    elements.push(React.createElement(Text, null, '  @Bean'));
      
    // Generate function signature with fallback logic
    let functionSignature = func.functionSignature;
    if (!functionSignature) {
      // Fallback: generate function signature based on type and properties
      // Use correct precedence: for consumers prioritize subscribePayload, for suppliers prioritize publishPayload
      const payloadType = func.type === 'consumer' 
        ? (func.subscribePayload || func.publishPayload || 'Object')
        : (func.publishPayload || func.subscribePayload || 'Object');

      if (func.type === 'supplier') {
        if (func.dynamic && func.reactive) {
          functionSignature = `public Supplier<Flux<Message<${payloadType}>>> ${func.name}()`;
        } else if (func.reactive) {
          functionSignature = `public Supplier<Flux<${payloadType}>> ${func.name}()`;
        } else {
          functionSignature = `public Supplier<${payloadType}> ${func.name}()`;
        }
      } else if (func.type === 'consumer') {
        if (func.reactive) {
          functionSignature = `public Consumer<Flux<${payloadType}>> ${func.name}()`;
        } else if (func.dynamic && func.parametersToHeaders) {
          // Use Consumer<Message<T>> when parametersToHeaders is true and function is dynamic
          functionSignature = `public Consumer<Message<?>> ${func.name}()`;
        } else if (func.hasEnumParameters) {
          // SAFE CHANGE: Use Consumer<Message<T>> when channel has enum parameters for better parameter access
          if (payloadType === 'Message<?>' || payloadType === 'Message<Object>') {
            // FIX: Handle the case where payloadType is already Message<?> to avoid double-wrapping
            functionSignature = `public Consumer<Message<?>> ${func.name}()`;
          } else {
            functionSignature = `public Consumer<Message<${payloadType}>> ${func.name}()`;
          }
        } else if (payloadType === 'Message<?>' || payloadType === 'Message<Object>') {
          // FIX: Handle the case where payloadType is already Message<?> to avoid double-wrapping
          functionSignature = `public Consumer<Message<?>> ${func.name}()`;
        } else {
          functionSignature = `public Consumer<${payloadType}> ${func.name}()`;
        }
      } else if (func.type === 'function') {
        const inputType = func.subscribePayload || 'Object';
        const outputType = func.publishPayload || func.messageName || 'Object';
        if (func.reactive) {
          functionSignature = `public Function<Flux<${inputType}>, Flux<${outputType}>> ${func.name}()`;
        } else {
          functionSignature = `public Function<${inputType}, ${outputType}> ${func.name}()`;
        }
      } else {
        functionSignature = `public Object ${func.name || 'unknownFunction'}()`;
      }
    }
      
    elements.push(React.createElement(Text, null, `  ${functionSignature} {`));
    // Function body
    if (func.type === 'supplier') {
      if (func.reactive) {
        // Reactive supplier returns Flux
        elements.push(React.createElement(Text, null, '    return () -> {'));
        elements.push(React.createElement(Text, null, '      // Add business logic here.'));
        elements.push(React.createElement(Text, null, '      // Return a Flux stream'));
        const payloadType = func.publishPayload || 'Object';
        if (payloadType === 'Message<?>' || payloadType === 'Message<Object>') {
          elements.push(React.createElement(Text, null, '      // Create sample payload - replace with actual business logic'));
          elements.push(React.createElement(Text, null, '      Object payload = new Object(); // TODO: Replace with actual message payload'));
          elements.push(React.createElement(Text, null, '      return Flux.just(MessageBuilder.withPayload(payload).build());'));
        } else {
          const initValue = getInitializationValue(payloadType);
          elements.push(React.createElement(Text, null, `      ${payloadType} payload = ${initValue};`));
          if (func.dynamic) {
            elements.push(React.createElement(Text, null, '      return Flux.just(MessageBuilder.withPayload(payload).build());'));
          } else {
            elements.push(React.createElement(Text, null, '      return Flux.just(payload);'));
          }
        }
        elements.push(React.createElement(Text, null, '    };'));
      } else {
        // Non-reactive supplier
        elements.push(React.createElement(Text, null, '    return () -> {'));
        elements.push(React.createElement(Text, null, '      // Add business logic here.'));
        // Create proper message with payload
        const payloadType = func.publishPayload || 'Object';
        // Handle Message<?> type specially - create a default payload object
        if (payloadType === 'Message<?>' || payloadType === 'Message<Object>') {
          elements.push(React.createElement(Text, null, '      // Create sample payload - replace with actual business logic'));
          elements.push(React.createElement(Text, null, '      Object payload = new Object(); // TODO: Replace with actual message payload'));
          // For Message<?> types, always wrap in MessageBuilder
          elements.push(React.createElement(Text, null, '      return MessageBuilder.withPayload(payload).build();'));
        } else {
          const initValue = getInitializationValue(payloadType);
          elements.push(React.createElement(Text, null, `      ${payloadType} payload = ${initValue};`));
          // For specific types, return payload directly (unless dynamic)
          if (func.dynamic) {
            elements.push(React.createElement(Text, null, '      return MessageBuilder.withPayload(payload).build();'));
          } else {
            elements.push(React.createElement(Text, null, '      return payload;'));
          }
        }
        elements.push(React.createElement(Text, null, '    };'));
      }
    } else if (func.type === 'consumer') {
      if (func.reactive) {
        // Reactive consumer handles Flux
        elements.push(React.createElement(Text, null, '    return flux -> {'));
        elements.push(React.createElement(Text, null, '      // Add business logic here.'));
        elements.push(React.createElement(Text, null, '      // Process each item in the Flux stream'));
        elements.push(React.createElement(Text, null, '      flux.doOnNext(data -> {'));
        elements.push(React.createElement(Text, null, '        logger.info(data.toString());'));
        elements.push(React.createElement(Text, null, '        // Add your processing logic here'));
        elements.push(React.createElement(Text, null, '      }).subscribe();'));
        elements.push(React.createElement(Text, null, '    };'));
      } else if (func.dynamic && func.parametersToHeaders) {
        // When using Consumer<Message<T>>, parameter is 'message' and payload is extracted
        elements.push(React.createElement(Text, null, '    return message -> {'));
        elements.push(React.createElement(Text, null, '      // Add business logic here.'));
        elements.push(React.createElement(Text, null, '      // Extract payload from message'));
        const payloadType = func.subscribePayload || 'Object';
        elements.push(React.createElement(Text, null, `      ${payloadType} data = message.getPayload();`));
        elements.push(React.createElement(Text, null, '      // Access channel parameters from message headers if needed'));
        elements.push(React.createElement(Text, null, '      // Example: String param = (String) message.getHeaders().get("paramName");'));
        elements.push(React.createElement(Text, null, '      logger.info(data.toString());'));
        elements.push(React.createElement(Text, null, '    };'));
      } else if (func.hasEnumParameters) {
        // SAFE CHANGE: Handle Message<T> for enum parameters
        elements.push(React.createElement(Text, null, '    return message -> {'));
        elements.push(React.createElement(Text, null, '      // Extract payload from message'));
        // FIX: When subscribePayload is Message<?>, extract as Object to avoid double-wrapping
        const payloadType = (func.subscribePayload === 'Message<?>' || func.subscribePayload === 'Message<Object>') 
          ? 'Object' 
          : (func.subscribePayload || 'Object');
        elements.push(React.createElement(Text, null, `      ${payloadType} data = message.getPayload();`));
            
        // Add parameter extraction and validation for enum parameters (only for Solace binder)
        if (params.binder === 'solace') {
          const consumerValidationCode = generateConsumerParameterValidation(func);
          if (consumerValidationCode.length > 0) {
            elements.push(React.createElement(Text, null, '      // Extract and validate topic parameters from solace_destination header'));
            elements.push(React.createElement(Text, null, '      // This validation ensures topic parameters match the generated enum constants'));
            elements.push(React.createElement(Text, null, '      // Note: This is specific to Solace binder - solace_destination header contains the topic path'));
            consumerValidationCode.forEach(line => {
              elements.push(React.createElement(Text, null, `      ${line}`));
            });
            elements.push(React.createElement(Text, null, ''));
          }
        }
            
        elements.push(React.createElement(Text, null, '      // Add business logic here.'));
        elements.push(React.createElement(Text, null, '      logger.info(data.toString());'));
        elements.push(React.createElement(Text, null, '    };'));
      } else if (func.subscribePayload === 'Message<?>' || func.subscribePayload === 'Message<Object>') {
        // FIX: Handle the case where subscribePayload is already Message<?> to avoid double payload extraction
        elements.push(React.createElement(Text, null, '    return message -> {'));
        elements.push(React.createElement(Text, null, '      // Extract payload from message'));
        elements.push(React.createElement(Text, null, '      Object data = message.getPayload();'));
        elements.push(React.createElement(Text, null, '      // Add business logic here.'));
        elements.push(React.createElement(Text, null, '      logger.info(data.toString());'));
        elements.push(React.createElement(Text, null, '    };'));
      } else {
        elements.push(React.createElement(Text, null, '    return data -> {'));
        elements.push(React.createElement(Text, null, '      // Add business logic here.'));
        elements.push(React.createElement(Text, null, '      logger.info(data.toString());'));
        elements.push(React.createElement(Text, null, '    };'));
      }
    } else if (func.type === 'function') {
      elements.push(React.createElement(Text, null, '    return data -> {'));
      elements.push(React.createElement(Text, null, '      // Add business logic here.'));
      elements.push(React.createElement(Text, null, '      logger.info(data.toString());'));
      const payloadType = func.publishPayload || 'Object';
      // Handle Message<?> type specially - cannot instantiate directly
      if (payloadType === 'Message<?>' || payloadType === 'Message<Object>') {
        elements.push(React.createElement(Text, null, '      // Process input data and create response'));
        elements.push(React.createElement(Text, null, '      // TODO: Replace with actual business logic to generate output data'));
        elements.push(React.createElement(Text, null, '      Object payload = data.getPayload();'));
        elements.push(React.createElement(Text, null, '      return MessageBuilder.withPayload(payload).build();'));
      } else {
        elements.push(React.createElement(Text, null, '      // Process input data and return response'));
        elements.push(React.createElement(Text, null, '      // TODO: Replace with actual business logic to generate output data'));
        elements.push(React.createElement(Text, null, `      ${payloadType} payload = new ${payloadType}();`));  
        elements.push(React.createElement(Text, null, '      return payload;'));
      }
      elements.push(React.createElement(Text, null, '    };'));
    }
    elements.push(React.createElement(Text, null, '  }'));
  });
  // Generate enum classes for channel parameters with enum definitions
  const enumClasses = generateEnumClasses(processedData, asyncapi);
  if (enumClasses.length > 0) {
    elements.push(React.createElement(Text, null, ''));
    elements.push(React.createElement(Text, null, '  // Enum classes for channel parameters'));
    elements.push(React.createElement(Text, null, '  // These enums are generated from AsyncAPI channel parameter enum definitions'));
    elements.push(React.createElement(Text, null, '  // and handle various data formats (numeric, spaces, camelCase) for valid Java constants'));
    enumClasses.forEach(enumClass => {
      elements.push(React.createElement(Text, null, `  public static enum ${enumClass.name} {`));
      elements.push(React.createElement(Text, null, `    ${enumClass.values.join(', ')}`));
      elements.push(React.createElement(Text, null, '  }'));
      elements.push(React.createElement(Text, null, ''));
    });
  }

  // Generate send methods if required
  sendFunctions.forEach(func => {
    if (func.sendMethodName) {
      elements.push(React.createElement(Text, null, ''));
      const payloadType = func.publishPayload || 'Object';
      elements.push(React.createElement(Text, null, `  public void ${func.sendMethodName}(`));
      elements.push(React.createElement(Text, null, `    ${payloadType} payload, ${func.channelInfo.functionParamList}`));
      elements.push(React.createElement(Text, null, '  ) {'));
          
      // Add parameter validation for enum parameters
      const validationCode = generateParameterValidation(func);
      if (validationCode.length > 0) {
        elements.push(React.createElement(Text, null, '    // Parameter validation for enum values'));
        elements.push(React.createElement(Text, null, '    // This validation ensures input parameters match the generated enum constants'));
        elements.push(React.createElement(Text, null, '    // and handles normalization for different data formats (numeric, spaces, etc.)'));
        validationCode.forEach(line => {
          elements.push(React.createElement(Text, null, `    ${line}`));
        });
        elements.push(React.createElement(Text, null, ''));
      }
      // Replace {param} with %s in the topic string for String.format
      logger.debug(`Application.js: Processing send function ${func.sendMethodName}, channelInfo:`, func.channelInfo);
      if (!func.channelInfo || !func.channelInfo.publishChannel) {
        logger.warn(`Application.js: Missing channelInfo or publishChannel for function ${func.sendMethodName}`);
        return;
      }
      const topicFormat = func.channelInfo.publishChannel.replace(/\{[^}]+\}/g, '%s');
      elements.push(React.createElement(Text, null, `    String topic = String.format(\"${topicFormat}\",`));
      elements.push(React.createElement(Text, null, `      ${func.channelInfo.functionArgList});`));
          
      if (params.dynamicType === 'header') {
        elements.push(React.createElement(Text, null, '    Message message = MessageBuilder'));
        elements.push(React.createElement(Text, null, '      .withPayload(payload)'));
        elements.push(React.createElement(Text, null, '      .setHeader(BinderHeaders.TARGET_DESTINATION, topic)'));
        elements.push(React.createElement(Text, null, '      .build();'));
        elements.push(React.createElement(Text, null, '    streamBridge.send(topic, message);'));
      } else {
        elements.push(React.createElement(Text, null, '    streamBridge.send(topic, payload);'));
      }
      elements.push(React.createElement(Text, null, '  }'));
    }
  });
  elements.push(React.createElement(Text, null, '}'));
  return elements;
}

/**
 * Get package name from parameters or AsyncAPI info
 */
function getPackageName(params, asyncapi) {
  logger.debug('Application.js: getPackageName() - Getting package name');
  // Check if package name is provided in parameters
  if (params && params.javaPackage) {
    return params.javaPackage;
  }
  
  // Try to get from AsyncAPI info
  if (asyncapi && asyncapi.info) {
    const info = asyncapi.info();
    if (info && info.extensions) {
      const extensions = info.extensions();
      if (extensions) {
        const packageExt = extensions.get('x-java-package');
        if (packageExt && packageExt.value) {
          return packageExt.value();
        }
      }
    }
  }
  
  // Default package name
  return 'com.company';
}

/**
 * Check if Jackson configuration is needed for JSR310 types
 */
function needsJacksonConfiguration(processedData) {
  logger.debug('Application.js: needsJacksonConfiguration() - Checking if Jackson config is needed');
  const functions = processedData.functions || [];
  
  // Check if any function uses JSR310 types
  const jsr310Types = [
    'java.time.LocalDate',
    'java.time.LocalTime', 
    'java.time.LocalDateTime',
    'java.time.Instant',
    'java.time.OffsetDateTime',
    'java.time.Duration'
  ];
  
  return functions.some(func => {
    const subscribePayload = func.subscribePayload;
    const publishPayload = func.publishPayload;
    
    return jsr310Types.some(type => 
      subscribePayload === type || publishPayload === type
    );
  });
}

/**
 * Generate enum classes for channel parameters
 * 
 * This function processes AsyncAPI channel parameters that have enum definitions
 * and generates corresponding Java enum classes. It handles various data types
 * and formats to ensure valid Java enum constants.
 * 
 * @param {Object} processedData - The processed AsyncAPI data containing functions and parameters
 * @param {Object} asyncapi - The original AsyncAPI document
 * @returns {Array} Array of enum class definitions with name and values
 */
function generateEnumClasses(processedData, asyncapi) {
  const enumClasses = [];
  const processedEnums = new Set(); // Track processed enums to avoid duplicates
  
  // Process enums from generated functions (existing logic)
  const functions = processedData.functions || [];
  
  functions.forEach(func => {
    if (func.parameters && func.parameters.length > 0) {
      func.parameters.forEach(param => {
        if (param.hasEnum && param.enumValues && param.enumValues.length > 0) {
          const enumName = toPascalCase(param.name);
          
          // Avoid generating duplicate enum classes for the same parameter name
          if (!processedEnums.has(enumName)) {
            processedEnums.add(enumName);

            // Convert enum values to valid Java identifiers using helper
            const validEnumValues = param.enumValues.map(toJavaEnumConstant);

            enumClasses.push({
              name: enumName,
              values: validEnumValues
            });
          }
        }
      });
    }
  });
  
  // NEW: Process enums from all channels in the original AsyncAPI document
  // This ensures enums from channels that get consolidated into consumer functions are still generated
  if (asyncapi && asyncapi.channels) {
    const channels = asyncapi.channels();
    if (channels && typeof channels.values === 'function') {
      const channelArray = Array.from(channels.values());
      
      channelArray.forEach(channel => {
        const channelParameters = channel.parameters();
        if (channelParameters && typeof channelParameters.values === 'function') {
          const paramArray = Array.from(channelParameters.values());
          
          paramArray.forEach(param => {
            try {
              // Check if parameter has enum values
              const enumValues = getParameterEnumValues(param);
              if (enumValues && enumValues.length > 0) {
                const paramName = toParameterName(param.id());
                const enumName = toPascalCase(paramName);
                
                // Avoid generating duplicate enum classes for the same parameter name
                if (!processedEnums.has(enumName)) {
                  processedEnums.add(enumName);

                  // Convert enum values to valid Java identifiers using helper
                  const validEnumValues = enumValues.map(toJavaEnumConstant);

                  enumClasses.push({
                    name: enumName,
                    values: validEnumValues
                  });
                }
              }
            } catch (error) {
              logger.warn(`Error processing channel parameter ${param?.id() || 'unknown'} for enum generation:`, error.message);
            }
          });
        }
      });
    }
  }
  
  return enumClasses;
}

/**
 * Get parameter enum values from AsyncAPI parameter object
 * 
 * @param {Object} param - The AsyncAPI parameter object
 * @returns {Array|null} Array of enum values or null if no enum
 */
function getParameterEnumValues(param) {
  try {
    const schema = param.schema();
    
    if (schema) {
      // Check if schema has enum property
      if (schema.enum && typeof schema.enum === 'function') {
        const enumValues = schema.enum();
        if (Array.isArray(enumValues) && enumValues.length > 0) {
          return enumValues;
        }
      }
      
      // Also check _json for enum values
      if (schema._json && schema._json.enum && Array.isArray(schema._json.enum)) {
        return schema._json.enum;
      }
    }
    return null;
  } catch (error) {
    logger.warn(`Error getting parameter enum values for ${param?.id() || 'unknown'}:`, error.message);
    return null;
  }
}

/**
 * Generate parameter validation code for send methods
 * 
 * This function generates Java validation code for enum parameters in send methods.
 * It handles the normalization of input values to match the generated enum constants,
 * ensuring proper validation regardless of the original enum value format.
 * 
 * @param {Object} func - The function object containing parameters with enum definitions
 * @returns {Array} Array of validation code lines to be inserted into the send method
 */
function generateParameterValidation(func) {
  const validationCode = [];

  if (func.parameters && func.parameters.length > 0) {
    func.parameters.forEach(param => {
      if (param.hasEnum && param.enumValues && param.enumValues.length > 0) {
        const enumName = toPascalCase(param.name);
        const paramName = param.name;

        // STEP 1: Null check validation
        validationCode.push(`if (${paramName} == null) {`);
        validationCode.push(`  throw new IllegalArgumentException("${paramName} cannot be null");`);
        validationCode.push('}');

        // STEP 2: Enum value validation with normalization (using helper)
        validationCode.push('try {');
        const normalizationCode = generateEnumValidationCode(paramName, enumName, param.enumValues, '  ');
        validationCode.push(...normalizationCode);

        // STEP 3: Error handling with helpful error message
        validationCode.push('} catch (IllegalArgumentException e) {');
        validationCode.push('  // Provide detailed error message with all valid enum values');
        validationCode.push(`  throw new IllegalArgumentException("Invalid ${paramName}: " + ${paramName} + ". Valid values: " + Arrays.toString(${enumName}.values()));`);
        validationCode.push('}');
      }
    });
  }

  return validationCode;
}

/**
 * Generate parameter extraction and validation code for consumer methods
 * 
 * This function generates Java code for extracting topic parameters from the solace_destination header
 * and validating them against the generated enum constants. It extracts parameters by position
 * from the topic path and provides a template for developers to understand how to access and validate topic parameters.
 * 
 * @param {Object} func - The function object containing parameters with enum definitions
 * @returns {Array} Array of validation code lines to be inserted into the consumer method
 */
function generateConsumerParameterValidation(func) {
  const validationCode = [];
  if (func.isQueueWithSubscription) {
    return validationCode;
  }
  
  if (func.parameters && func.parameters.length > 0) {
    // First, extract the solace_destination header and split the topic path
    validationCode.push('// Extract topic parameters from solace_destination header');
    validationCode.push('Object solaceDestinationHeader = message.getHeaders().get("solace_destination");');
    validationCode.push('String solaceDestination = solaceDestinationHeader != null ? solaceDestinationHeader.toString() : null;');
    validationCode.push('if (solaceDestination != null) {');
    validationCode.push('  String[] topicSegments = solaceDestination.split("/");');
    validationCode.push('  logger.info("Topic segments: " + Arrays.toString(topicSegments));');
    
    // Sort parameters by position to ensure correct extraction order
    const sortedParams = func.parameters
      .filter(param => param.hasEnum && param.enumValues && param.enumValues.length > 0)
      .sort((a, b) => a.position - b.position);
    
    if (sortedParams.length > 0) {
      validationCode.push('  // Extract enum parameters by position from topic path');
      
      sortedParams.forEach(param => {
        const enumName = toPascalCase(param.name);
        const paramName = param.name;
        const position = param.position;
        const resultVarName = `validated${toPascalCase(paramName)}`;

        validationCode.push(`  // Extract ${paramName} from position ${position} in topic path`);
        validationCode.push(`  if (topicSegments.length > ${position}) {`);
        validationCode.push(`    String ${paramName} = topicSegments[${position}];`);
        validationCode.push('    try {');

        // Generate validation code using helper (with result variable)
        const normalizationCode = generateEnumValidationCode(paramName, enumName, param.enumValues, '      ', resultVarName);
        validationCode.push(...normalizationCode);
        validationCode.push(`      logger.info("Validated ${paramName} from topic position ${position}: " + ${resultVarName});`);

        // Error handling
        validationCode.push('    } catch (IllegalArgumentException e) {');
        validationCode.push(`      logger.warn("Invalid ${paramName} at topic position ${position}: " + ${paramName} + ". Valid values: " + Arrays.toString(${enumName}.values()));`);
        validationCode.push('    }');
        validationCode.push('  } else {');
        validationCode.push(`    logger.warn("Topic path too short, expected ${paramName} at position ${position} but only " + topicSegments.length + " segments found");`);
        validationCode.push('  }');
      });
    }
    
    validationCode.push('} else {');
    validationCode.push('  logger.debug("No solace_destination found in message headers");');
    validationCode.push('}');
  }
  
  return validationCode;
}

module.exports = {
  Application,
  toMethodName,
  toParameterName,
  getPackageName,
  needsJacksonConfiguration
};

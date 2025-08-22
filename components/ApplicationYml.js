const React = require('react');
const { Text } = require('@asyncapi/generator-react-sdk');
const { logger } = require('../utils/logger');

/**
 * ApplicationYml component for generating Spring Boot application.yml
 */
function ApplicationYml({ asyncapi, params, processedData }) {
  logger.debug('ApplicationYml.js: ApplicationYml() - Generating application.yml component');
  const funcs = processedData.functions || [];
  const { 
    binder = 'kafka', 
    host, 
    username, 
    password, 
    msgVpn,
    parametersToHeaders = false,
    useServers = false,
    kafkaBrokers = 'localhost:9092',
    rabbitHost = 'localhost',
    rabbitPort = '5672',
    rabbitUsername = 'guest',
    rabbitPassword = 'guest',
    actuator = 'false'
  } = params;

  // Include supplier, consumer, and function types in definition
  const supplierFunctions = funcs.filter(func => func.type === 'supplier');
  const consumerFunctions = funcs.filter(func => func.type === 'consumer');
  const functionFunctions = funcs.filter(func => func.type === 'function');
  const allFunctions = [...supplierFunctions, ...consumerFunctions, ...functionFunctions];
  const functionNames = allFunctions.map(func => func.name);
  const functionDefinition = functionNames.join(';');

  const elements = [];

  // Check if Jackson configuration is needed
  const needsJacksonConfig = needsJacksonConfiguration(processedData);
  
  // Add Spring Cloud Stream configuration
  elements.push(React.createElement(Text, null, "spring:"));
  
  // Add Jackson configuration if needed
  if (needsJacksonConfig) {
    elements.push(React.createElement(Text, null, "  jackson:"));
    elements.push(React.createElement(Text, null, "    serialization:"));
    elements.push(React.createElement(Text, null, "      write-dates-as-timestamps: false"));
    elements.push(React.createElement(Text, null, "    deserialization:"));
    elements.push(React.createElement(Text, null, "      fail-on-unknown-properties: false"));
  }
  
  elements.push(React.createElement(Text, null, "  cloud:"));
  elements.push(React.createElement(Text, null, "    function:"));
  elements.push(React.createElement(Text, null, `      definition: ${functionDefinition || "''"}`));
  
  // Add function configuration for parametersToHeaders
  if (parametersToHeaders && (binder === 'solace' || binder === 'rabbit')) {
    const headerMappingConfig = generateHeaderMappingConfiguration(consumerFunctions, binder);
    if (headerMappingConfig && Object.keys(headerMappingConfig).length > 0) {
      elements.push(React.createElement(Text, null, "      configuration:"));
      Object.entries(headerMappingConfig).forEach(([functionName, config]) => {
        elements.push(React.createElement(Text, null, `        ${functionName}:`));
        elements.push(React.createElement(Text, null, "          input-header-mapping-expression:"));
        Object.entries(config['input-header-mapping-expression']).forEach(([paramName, expression]) => {
          elements.push(React.createElement(Text, null, `            ${paramName}: ${expression}`));
        });
      });
    }
  }
  
  elements.push(React.createElement(Text, null, "    stream:"));
  if (supplierFunctions.length + consumerFunctions.length + functionFunctions.length === 0) {
    elements.push(React.createElement(Text, null, "      bindings: {}"));
  } else {
    elements.push(React.createElement(Text, null, "      bindings:"));
  }

  // Add bindings for supplier functions (use -out-0)
  supplierFunctions.forEach(func => {
    const bindingName = `${func.name}-out-0`;
    elements.push(React.createElement(Text, null, `        ${bindingName}:`));
    const destination = func.channelInfo?.publishChannel || 
                       func.channelInfo?.channelName || 
                       func.channelName || 
                       (func.channelInfo?.subscribeChannel || func.channelInfo?.publishChannel) ||
                       'topic';
    elements.push(React.createElement(Text, null, `          destination: ${destination}`));
    // Add binder property if using Solace
    if (binder === 'solace') {
      elements.push(React.createElement(Text, null, `          binder: solace-binder`));
    } else if (binder === 'rabbit') {
      elements.push(React.createElement(Text, null, `          binder: rabbit-binder`));
    } else if (binder === 'kafka') {
      elements.push(React.createElement(Text, null, `          binder: kafka-binder`));
    }
  });

  // Add bindings for consumer functions (use -in-0)
  consumerFunctions.forEach(func => {
    const bindingName = `${func.name}-in-0`;
    elements.push(React.createElement(Text, null, `        ${bindingName}:`));
    
    // For queue-based consumers, use the topic subscription pattern
    // For regular consumers, use the subscribe channel
    let destination;
    if (func.isQueueWithSubscription && func.topicSubscriptions && func.topicSubscriptions.length > 0) {
      // Use all topic subscription patterns for queue-based consumers (comma-separated)
      destination = func.topicSubscriptions.join(',');
    } else {
      destination = func.channelInfo?.subscribeChannel || 
                   func.channelInfo?.channelName || 
                   func.channelName || 
                   (func.channelInfo?.publishChannel || func.channelInfo?.subscribeChannel) ||
                   'topic';
    }
    
    elements.push(React.createElement(Text, null, `          destination: ${destination}`));
    // Add group property only for queue-based consumer bindings
    if (func.isQueueWithSubscription) {
      const group = func.channelInfo && func.channelInfo.queueName 
        ? func.channelInfo.queueName 
        : func.name;
      elements.push(React.createElement(Text, null, `          group: ${group}`));
    }
    // Add binder property if using Solace
    if (binder === 'solace') {
      elements.push(React.createElement(Text, null, `          binder: solace-binder`));
    } else if (binder === 'rabbit') {
      elements.push(React.createElement(Text, null, `          binder: rabbit-binder`));
    } else if (binder === 'kafka') {
      elements.push(React.createElement(Text, null, `          binder: kafka-binder`));
    }
  });

  // Add bindings for function types (need both -in-0 and -out-0)
  functionFunctions.forEach(func => {
    // FIX: Use view-aware destination mapping for Function types
    // Use the specific inputOperation and outputOperation properties set in the fix
    let inputDestination, outputDestination;
    
    if (func.inputOperation && func.outputOperation) {
      // Use the specific operation information for accurate destination mapping
      // Get channel information from the operations using AsyncAPI library methods
      const inputChannel = func.inputOperation.channels && func.inputOperation.channels().values ? 
        Array.from(func.inputOperation.channels().values())[0] : null;
      const outputChannel = func.outputOperation.channels && func.outputOperation.channels().values ? 
        Array.from(func.outputOperation.channels().values())[0] : null;
      
      inputDestination = inputChannel ? inputChannel.id() : null;
      outputDestination = outputChannel ? outputChannel.id() : null;
    } else {
      // Fallback to generic channel information
      inputDestination = func.channelInfo?.subscribeChannel || 
                       func.channelInfo?.channelName || 
                       func.channelName || 
                       null;
      outputDestination = func.channelInfo?.publishChannel || 
                        func.channelInfo?.channelName || 
                        func.channelName || 
                        null;
    }
    
    // Validate destinations and provide meaningful error if missing
    if (!inputDestination) {
      logger.warn(`ApplicationYml.js: No input destination found for function ${func.name}, using function name as fallback`);
      inputDestination = `${func.name}-input`;
    }
    if (!outputDestination) {
      logger.warn(`ApplicationYml.js: No output destination found for function ${func.name}, using function name as fallback`);
      outputDestination = `${func.name}-output`;
    }
    
    // Input binding (-in-0)
    const inputBindingName = `${func.name}-in-0`;
    elements.push(React.createElement(Text, null, `        ${inputBindingName}:`));
    elements.push(React.createElement(Text, null, `          destination: ${inputDestination}`));
    if (binder === 'solace') {
      elements.push(React.createElement(Text, null, `          binder: solace-binder`));
    } else if (binder === 'rabbit') {
      elements.push(React.createElement(Text, null, `          binder: rabbit-binder`));
    } else if (binder === 'kafka') {
      elements.push(React.createElement(Text, null, `          binder: kafka-binder`));
    }
    
    // Output binding (-out-0) 
    const outputBindingName = `${func.name}-out-0`;
    elements.push(React.createElement(Text, null, `        ${outputBindingName}:`));
    elements.push(React.createElement(Text, null, `          destination: ${outputDestination}`));
    if (binder === 'solace') {
      elements.push(React.createElement(Text, null, `          binder: solace-binder`));
    } else if (binder === 'rabbit') {
      elements.push(React.createElement(Text, null, `          binder: rabbit-binder`));
    } else if (binder === 'kafka') {
      elements.push(React.createElement(Text, null, `          binder: kafka-binder`));
    }
  });

  // NOTE: Removed poller config for suppliers as it causes lifecycle conflicts
  // Pollers are only needed for polling suppliers (file/database), not for programmatic suppliers

  // Add solace section with bindings and environment
  if (binder === 'solace') {
    // Bindings for queue-based consumers
    const queueConsumers = consumerFunctions.filter(f => f.channelInfo && f.channelInfo.queueName);
    if (queueConsumers.length > 0) {
      elements.push(React.createElement(Text, null, "      solace:"));
      elements.push(React.createElement(Text, null, "        bindings:"));
      queueConsumers.forEach(func => {
        const bindingName = `${func.name}-in-0`;
        elements.push(React.createElement(Text, null, `          ${bindingName}:`));
        elements.push(React.createElement(Text, null, "            consumer:"));
        elements.push(React.createElement(Text, null, `              queueNameExpression: '''${func.channelInfo.queueName || func.name}'''`));
      });
    }
    // Add binders
    elements.push(
      React.createElement(Text, null, "      binders:"),
      React.createElement(Text, null, `        solace-binder:`),
      React.createElement(Text, null, `          type: solace`)
    );
    // Environment section
    elements.push(React.createElement(Text, null, "          environment:"));
    elements.push(React.createElement(Text, null, "            solace:"));
    elements.push(React.createElement(Text, null, "              java:"));
    elements.push(React.createElement(Text, null, `                host: '${host || 'tcp://localhost:55554'}'`));
    elements.push(React.createElement(Text, null, `                msgVpn: ${msgVpn || 'default'}`));
    elements.push(React.createElement(Text, null, `                clientUsername: ${username || 'default'}`));
    elements.push(React.createElement(Text, null, `                clientPassword: ${password || 'default'}`));
  } else if (binder === 'kafka') {
    // Add binders
    elements.push(
      React.createElement(Text, null, "      binders:"),
      React.createElement(Text, null, `        kafka-binder:`),
      React.createElement(Text, null, `          type: kafka`)
    );
    elements.push(React.createElement(Text, null, "          environment:"));
    elements.push(React.createElement(Text, null, "            spring:"));
    elements.push(React.createElement(Text, null, "              cloud:"));
    elements.push(React.createElement(Text, null, "                stream:"));
    elements.push(React.createElement(Text, null, "                  kafka:"));
    elements.push(React.createElement(Text, null, "                    binder:"));
    
    // Use servers if useServers is true, otherwise use kafkaBrokers
    let brokerList = kafkaBrokers;
    if (useServers === true || useServers === 'true') {
      try {
        const servers = asyncapi.servers().all();
        if (servers && servers.length > 0) {
          brokerList = servers.map(server => server.url()).join(',');
          logger.debug(`ApplicationYml.js: Using servers for Kafka brokers: ${brokerList}`);
        } else {
          logger.warn('ApplicationYml.js: useServers is true but no servers found in AsyncAPI document');
        }
      } catch (error) {
        logger.warn(`ApplicationYml.js: Error getting servers for Kafka brokers: ${error.message}`);
      }
    }
    
    elements.push(React.createElement(Text, null, `                      brokers: ${brokerList}`));
  } else if (binder === 'rabbit') {
    // Add binders
    elements.push(
      React.createElement(Text, null, "      binders:"),
      React.createElement(Text, null, `        rabbit-binder:`),
      React.createElement(Text, null, `          type: rabbit`)
    );
    elements.push(React.createElement(Text, null, "          environment:"));
    elements.push(React.createElement(Text, null, "            spring:"));
    elements.push(React.createElement(Text, null, "              rabbitmq:"));
    elements.push(React.createElement(Text, null, `                host: ${rabbitHost}`));
    elements.push(React.createElement(Text, null, `                port: ${rabbitPort}`));
    elements.push(React.createElement(Text, null, `                username: ${rabbitUsername}`));
    elements.push(React.createElement(Text, null, `                password: ${rabbitPassword}`));
  }

  // Add logging configuration (matching reference)
  elements.push(
    React.createElement(Text, null, "logging:"),
    React.createElement(Text, null, "  level:"),
    React.createElement(Text, null, "    root: info"),
    React.createElement(Text, null, "    org:"),
    React.createElement(Text, null, "      springframework: info"),
    React.createElement(Text, null, "      springframework.cloud.stream: info"),
    React.createElement(Text, null, "      springframework.integration: info"),
    React.createElement(Text, null, "    com:"),
    React.createElement(Text, null, "      company: info")
  );
  
  // Add Jackson logging if Jackson config is needed
  if (needsJacksonConfig) {
    elements.push(
      React.createElement(Text, null, "    com.fasterxml.jackson: info")
    );
  }

  // Add actuator configuration if enabled (matching nunjucks reference project)
  if (actuator === 'true' || actuator === true) {
    elements.push(
      React.createElement(Text, null, "server:"),
      React.createElement(Text, null, "  port: 8080"),
      React.createElement(Text, null, "management:"),
      React.createElement(Text, null, "  endpoints:"),
      React.createElement(Text, null, "    web:"),
      React.createElement(Text, null, "      exposure:"),
      React.createElement(Text, null, "        include: '*'")
    );
  }

  // Remove trailing blank lines at the end
  while (elements.length > 0 && elements[elements.length - 1].props && elements[elements.length - 1].props.children === "") {
    elements.pop();
  }

  return React.createElement(React.Fragment, null, ...elements);
}

/**
 * Generate Solace consumer settings (matching reference getConsumerSettings logic)
 */
function generateSolaceConsumerSettings(functions) {
  logger.debug('ApplicationYml.js: generateSolaceConsumerSettings() - Generating Solace consumer settings');
  let ret = null;
  
  functions.forEach(func => {
    // Check if this is a queue-based consumer with subscriptions
    if (func.isQueueWithSubscription) {
      // Use consistent binding name that matches the function name
      let bindingName = func.name;
      if (func.isQueueWithSubscription && func.queueName) {
        bindingName = toJavaClassName(func.queueName);
      }
      const fullBindingName = `${bindingName}-in-0`;
      
      if (!ret) {
        ret = {};
        ret.bindings = {};
      }
      
      ret.bindings[fullBindingName] = {};
      ret.bindings[fullBindingName].consumer = {};
      ret.bindings[fullBindingName].consumer.queueNameExpression = `'''${func.queueName || func.name}'''`;
      
      // Add additional subscriptions (all except the main one)
      if (func.additionalSubscriptions && func.additionalSubscriptions.length > 1) {
        // Filter out the main subscription (subscribeChannel) from additional subscriptions
        const additionalSubs = func.additionalSubscriptions.filter(sub => sub !== func.subscribeChannel);
        if (additionalSubs.length > 0) {
          ret.bindings[fullBindingName].consumer.queueAdditionalSubscriptions = additionalSubs;
        }
      }
    }
  });
  
  return ret;
}

/**
 * Check if Jackson configuration is needed for JSR310 types
 */
function needsJacksonConfiguration(processedData) {
  logger.debug('ApplicationYml.js: needsJacksonConfiguration() - Checking if Jackson config is needed');
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
 * Generate header mapping configuration for parametersToHeaders feature
 * Matches the Nunjucks reference implementation logic
 */
function generateHeaderMappingConfiguration(consumerFunctions, binder) {
  logger.debug('ApplicationYml.js: generateHeaderMappingConfiguration() - Generating header mapping config');
  const config = {};
  
  // Only process dynamic consumer functions (those with channel parameters)
  consumerFunctions.forEach(func => {
    if (func.dynamic && func.channelInfo && func.channelInfo.parameters && func.channelInfo.parameters.length > 0) {
      config[func.name] = {
        'input-header-mapping-expression': {}
      };
      
      // Generate header mappings for each channel parameter
      func.channelInfo.parameters.forEach(param => {
        let headerExpression;
        if (binder === 'solace') {
          headerExpression = `headers.solace_destination.getName.split("/")[${param.position}]`;
        } else if (binder === 'rabbit') {
          headerExpression = `headers.amqp_receivedRoutingKey.getName.split("/")[${param.position}]`;
        }
        
        if (headerExpression) {
          config[func.name]['input-header-mapping-expression'][param.name] = headerExpression;
        }
      });
    }
  });
  
  return config;
}

module.exports = {
  ApplicationYml,
  generateSolaceConsumerSettings,
  needsJacksonConfiguration,
  generateHeaderMappingConfiguration
}; 
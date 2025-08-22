const React = require('react');
const { Text } = require('@asyncapi/generator-react-sdk');
const { logger } = require('../utils/logger');

/**
 * Enhanced Readme component for generating contextual README.md
 */
function Readme({ asyncapi, params, processedData }) {
  logger.debug('Readme.js: Readme() - Generating enhanced README.md component');
  
  const title = getTitle(asyncapi);
  const version = getVersion(asyncapi);
  const description = getDescription(asyncapi);
  const applicationDomain = getApplicationDomain(asyncapi);
  const schemas = processedData?.schemas || [];
  const functions = processedData?.functions || [];
  const channels = getChannels(asyncapi);
  const queues = getQueues(asyncapi);
  
  // Deduplicate schemas, functions, and channels
  const uniqueSchemas = deduplicateSchemas(schemas);
  const uniqueFunctions = deduplicateFunctions(functions);
  const uniqueChannels = deduplicateChannels(channels);
  
  // Extract dynamic values from parameters
  const techStack = getTechnologyStack(params);
  const javaVersion = getJavaVersion(params);
  const mavenVersion = getMavenVersion(params);
  const binderType = getBinderType(params);
  const binderName = getBinderName(params);
  const connectionConfig = getConnectionConfig(params, binderType);

  return React.createElement(React.Fragment, null,
    // Header
    React.createElement(Text, null, `# ${title}`),
    React.createElement(Text, null, ""),
    React.createElement(Text, null, `## Version ${version}`),
    React.createElement(Text, null, ""),
    
    // Description
    ...(description || '').split('\n').map((line, index) => 
      React.createElement(Text, { key: index }, line)
    ),
    React.createElement(Text, null, ""),
    
    // Project Overview
    React.createElement(Text, null, "## Project Overview"),
    React.createElement(Text, null, ""),
    React.createElement(Text, null, `This is a **Spring Cloud Stream** application generated from the **${applicationDomain}** AsyncAPI specification.`),
    React.createElement(Text, null, ""),
    React.createElement(Text, null, "### Technology Stack"),
    ...techStack.map(tech => 
      React.createElement(Text, { key: tech.name }, `- **${tech.name}** ${tech.version}`)
    ),
    React.createElement(Text, null, ""),
    
    // Generated Components
    React.createElement(Text, null, "## Generated Components"),
    React.createElement(Text, null, ""),
    
    // Model Classes
    React.createElement(Text, null, "### Model Classes"),
    ...uniqueSchemas.map(schema => 
      React.createElement(Text, { key: schema.name }, `- **${schema.className || schema.name}**`)
    ),
    React.createElement(Text, null, ""),
    
    // Functions
    React.createElement(Text, null, "### Spring Cloud Stream Functions"),
    ...uniqueFunctions.map(func => {
      // Use sendMethodName for send functions, otherwise use the function name
      const displayName = func.type === 'send' && func.sendMethodName ? func.sendMethodName : func.name;
      return React.createElement(Text, { key: func.name }, `- **${displayName}** - ${getFunctionDescription(func)}`);
    }),
    React.createElement(Text, null, ""),
    
    // Message Channels
    React.createElement(Text, null, "### Message Channels"),
    ...uniqueChannels.map(channel => 
      React.createElement(Text, { key: channel.name }, `- **${channel.name}**`)
    ),
    React.createElement(Text, null, ""),
    
    // Solace Queues
    ...(queues.length > 0 ? [
      React.createElement(Text, null, "### Solace Queues"),
      ...queues.map(queue => [
        React.createElement(Text, { key: queue.name }, `- **${queue.name}** - ${queue.description}`),
        ...(queue.topicSubscriptions && queue.topicSubscriptions.length > 0 ? 
          queue.topicSubscriptions.map((topic, index) => 
            React.createElement(Text, { key: `${queue.name}-topic-${index}` }, `  - \`${topic}\``)
          ) : []
        )
      ]).flat(),
      React.createElement(Text, null, "")
    ] : []),
    
    // Getting Started
    React.createElement(Text, null, "## Getting Started"),
    React.createElement(Text, null, ""),
    React.createElement(Text, null, "### Prerequisites"),
    React.createElement(Text, null, `- Java ${javaVersion} or higher`),
    React.createElement(Text, null, `- Maven ${mavenVersion}+`),
    React.createElement(Text, null, `- ${binderType} broker (local or cloud)`),
    React.createElement(Text, null, ""),
    React.createElement(Text, null, "### Configuration"),
    React.createElement(Text, null, `Update the ${binderType} connection settings in \`src/main/resources/application.yml\`:`),
    React.createElement(Text, null, ""),
    React.createElement(Text, null, "```yaml"),
    ...connectionConfig.map(line => 
      React.createElement(Text, { key: line }, line)
    ),
    React.createElement(Text, null, "```"),
    React.createElement(Text, null, ""),
    
    // Running the Application
    React.createElement(Text, null, "### Running the Application"),
    React.createElement(Text, null, ""),
    React.createElement(Text, null, "1. **Build the application:**"),
    React.createElement(Text, null, "   ```bash"),
    React.createElement(Text, null, "   mvn clean compile"),
    React.createElement(Text, null, "   ```"),
    React.createElement(Text, null, ""),
    React.createElement(Text, null, "2. **Run the application:**"),
    React.createElement(Text, null, "   ```bash"),
    React.createElement(Text, null, "   mvn spring-boot:run"),
    React.createElement(Text, null, "   ```"),
    React.createElement(Text, null, ""),
    
    // Development Guide
    React.createElement(Text, null, "## Development Guide"),
    React.createElement(Text, null, ""),
    React.createElement(Text, null, "### Adding Business Logic"),
    React.createElement(Text, null, "Each generated function in `Application.java` contains placeholder business logic:"),
    React.createElement(Text, null, ""),
    
    // Consumer Function Example
    React.createElement(Text, null, "#### Consumer Functions"),
    React.createElement(Text, null, "Process incoming messages:"),
    React.createElement(Text, null, ""),
    React.createElement(Text, null, "```java"),
    React.createElement(Text, null, "@Bean"),
    React.createElement(Text, null, "public Consumer<Message<?>> yourConsumer() {"),
    React.createElement(Text, null, "  return data -> {"),
    React.createElement(Text, null, "    // Add your business logic here"),
    React.createElement(Text, null, "    logger.info(\"Received: \" + data.toString());"),
    React.createElement(Text, null, "  };"),
    React.createElement(Text, null, "}"),
    React.createElement(Text, null, "```"),
    React.createElement(Text, null, ""),
    
    // Supplier Function Example
    React.createElement(Text, null, "#### Supplier Functions"),
    React.createElement(Text, null, "Generate and publish messages:"),
    React.createElement(Text, null, ""),
    React.createElement(Text, null, "```java"),
    React.createElement(Text, null, "@Bean"),
    React.createElement(Text, null, "public Supplier<YourMessageType> yourSupplier() {"),
    React.createElement(Text, null, "  return () -> {"),
    React.createElement(Text, null, "    // Create and populate your message"),
    React.createElement(Text, null, "    YourMessageType message = new YourMessageType();"),
    React.createElement(Text, null, "    // Add your business logic here"),
    React.createElement(Text, null, "    return message;"),
    React.createElement(Text, null, "  };"),
    React.createElement(Text, null, "}"),
    React.createElement(Text, null, "```"),
    React.createElement(Text, null, ""),
    React.createElement(Text, null, "### Sending Messages"),
    React.createElement(Text, null, "Use the generated `send` methods to publish messages:"),
    React.createElement(Text, null, ""),
    React.createElement(Text, null, "```java"),
    React.createElement(Text, null, "// Example: Send order completed message"),
    React.createElement(Text, null, "sendOrderCompleted(orderStatus, source, country, storeId, orderId);"),
    React.createElement(Text, null, "```"),
    React.createElement(Text, null, ""),
    
    // Testing
    React.createElement(Text, null, "### Testing"),
    React.createElement(Text, null, "1. **Unit Tests:** Create tests for your business logic"),
    React.createElement(Text, null, `2. **Integration Tests:** Test with a local ${binderType} broker`),
    React.createElement(Text, null, "3. **End-to-End Tests:** Test complete message flows"),
    React.createElement(Text, null, ""),
    
    // Deployment
    React.createElement(Text, null, "### Deployment"),
    React.createElement(Text, null, "1. **Build JAR:** `mvn clean package`"),
    React.createElement(Text, null, "2. **Run JAR:** `java -jar target/your-app.jar`"),
    React.createElement(Text, null, "3. **Docker:** Use the generated Dockerfile (if available)"),
    React.createElement(Text, null, ""),
    
    // Troubleshooting
    React.createElement(Text, null, "## Troubleshooting"),
    React.createElement(Text, null, ""),
    React.createElement(Text, null, "### Common Issues"),
    React.createElement(Text, null, `- **Connection Issues:** Verify ${binderType} broker connectivity`),
    React.createElement(Text, null, `- **Queue Not Found:** Ensure queues exist in ${binderType}`),
    React.createElement(Text, null, "- **Message Format:** Verify message payload matches schema"),
    React.createElement(Text, null, ""),
    React.createElement(Text, null, "### Logging"),
    React.createElement(Text, null, "Adjust logging levels in `application.yml`:"),
    React.createElement(Text, null, ""),
    React.createElement(Text, null, "```yaml"),
    React.createElement(Text, null, "logging:"),
    React.createElement(Text, null, "  level:"),
    React.createElement(Text, null, "    com.company: DEBUG"),
    React.createElement(Text, null, "    org.springframework.cloud.stream: DEBUG"),
    React.createElement(Text, null, "```"),
    React.createElement(Text, null, ""),
    
    // API Reference
    React.createElement(Text, null, "## API Reference"),
    React.createElement(Text, null, ""),
    React.createElement(Text, null, "### Message Types"),
    ...getMessageTypes(functions).map(msgType => 
      React.createElement(Text, { key: msgType }, `- **${msgType}**`)
    ),
    React.createElement(Text, null, ""),
    
    // Configuration Reference
    React.createElement(Text, null, "## Configuration Reference"),
    React.createElement(Text, null, ""),
    React.createElement(Text, null, "### Key Properties"),
    React.createElement(Text, null, "- `spring.cloud.function.definition` - Function definitions"),
    React.createElement(Text, null, "- `spring.cloud.stream.bindings.*.destination` - Message destinations"),
    React.createElement(Text, null, "- `spring.cloud.stream.bindings.*.group` - Consumer groups"),
    React.createElement(Text, null, `- \`spring.cloud.stream.${binderName}.bindings.*.consumer.queueNameExpression\` - Queue names`),
    React.createElement(Text, null, ""),
    
    // License
    React.createElement(Text, null, "## License"),
    React.createElement(Text, null, "This project is generated from AsyncAPI specification. Please refer to the original specification for licensing information."),
    React.createElement(Text, null, "")
  );
}

function getTitle(asyncapi) {
  logger.debug('Readme.js: getTitle() - Getting title from AsyncAPI');
  try {
    if (asyncapi.info && typeof asyncapi.info === 'function') {
      const info = asyncapi.info();
      if (info && info.title && typeof info.title === 'function') {
        return info.title();
      }
    }
  } catch (error) {
    logger.warn('Error getting title:', error.message);
  }
  return 'AsyncAPI Application';
}

function getVersion(asyncapi) {
  logger.debug('Readme.js: getVersion() - Getting version from AsyncAPI');
  try {
    if (asyncapi.info && typeof asyncapi.info === 'function') {
      const info = asyncapi.info();
      if (info && info.version && typeof info.version === 'function') {
        return info.version();
      }
    }
  } catch (error) {
    logger.warn('Error getting version:', error.message);
  }
  return '1.0.0';
}

function getDescription(asyncapi) {
  logger.debug('Readme.js: getDescription() - Getting description from AsyncAPI');
  try {
    if (asyncapi.info && typeof asyncapi.info === 'function') {
      const info = asyncapi.info();
      if (info && info.description && typeof info.description === 'function') {
        return info.description();
      }
    }
  } catch (error) {
    logger.warn('Error getting description:', error.message);
  }
  return 'Generated Spring Cloud Stream application for event-driven microservices.';
}

function getApplicationDomain(asyncapi) {
  logger.debug('Readme.js: getApplicationDomain() - Getting application domain');
  try {
    if (asyncapi.info && typeof asyncapi.info === 'function') {
      const info = asyncapi.info();
      if (info && info.extensions && typeof info.extensions === 'function') {
        const extensions = info.extensions();
        const domainName = extensions.get('x-ep-application-domain-name');
        if (domainName && typeof domainName.value === 'function') {
          return domainName.value();
        }
      }
    }
  } catch (error) {
    logger.warn('Error getting application domain:', error.message);
  }
  return 'AsyncAPI Application';
}

function getTechnologyStack(params) {
  logger.debug('Readme.js: getTechnologyStack() - Getting technology stack from params');
  const techStack = [];
  
  // Spring Boot
  const springBootVersion = params.springBootVersion || '3.4.4';
  techStack.push({ name: 'Spring Boot', version: springBootVersion });
  
  // Spring Cloud Stream
  const springCloudStreamVersion = params.springCloudStreamVersion || '3.1.3';
  techStack.push({ name: 'Spring Cloud Stream', version: springCloudStreamVersion });
  
  // Spring Cloud
  const springCloudVersion = params.springCloudVersion || '2024.0.0';
  techStack.push({ name: 'Spring Cloud', version: springCloudVersion });
  
  // Binder-specific version
  const binderType = getBinderType(params);
  if (binderType === 'Solace') {
    const solaceVersion = params.solaceSpringCloudVersion || '4.8.0';
    techStack.push({ name: 'Solace Spring Cloud', version: solaceVersion });
  } else if (binderType === 'Kafka') {
    const kafkaVersion = params.kafkaSpringCloudVersion || '4.2.0';
    techStack.push({ name: 'Kafka Spring Cloud', version: kafkaVersion });
  } else if (binderType === 'RabbitMQ') {
    const rabbitVersion = params.rabbitSpringCloudVersion || '4.2.0';
    techStack.push({ name: 'RabbitMQ Spring Cloud', version: rabbitVersion });
  }
  
  // Java
  const javaVersion = getJavaVersion(params);
  techStack.push({ name: 'Java', version: `${javaVersion}+` });
  
  return techStack;
}

function getJavaVersion(params) {
  logger.debug('Readme.js: getJavaVersion() - Getting Java version from params');
  return params.javaVersion || '17';
}

function getMavenVersion(params) {
  logger.debug('Readme.js: getMavenVersion() - Getting Maven version from params');
  return params.mavenVersion || '3.6';
}

function getBinderType(params) {
  logger.debug('Readme.js: getBinderType() - Getting binder type from params');
  const binder = params.binder || 'solace';
  
  // Map binder to display name
  const binderMap = {
    'solace': 'Solace PubSub+',
    'kafka': 'Apache Kafka',
    'rabbitmq': 'RabbitMQ',
    'redis': 'Redis',
    'pulsar': 'Apache Pulsar'
  };
  
  return binderMap[binder.toLowerCase()] || 'Message Broker';
}

function getBinderName(params) {
  logger.debug('Readme.js: getBinderName() - Getting binder name from params');
  const binder = params.binder || 'solace';
  return binder.toLowerCase();
}

function getConnectionConfig(params, binderType) {
  logger.debug('Readme.js: getConnectionConfig() - Getting connection config from params');
  const config = [];
  
  config.push("spring:");
  config.push("  cloud:");
  config.push("    stream:");
  config.push("      binders:");
  
  const binderName = getBinderName(params);
  config.push(`        ${binderName}-binder:`);
  config.push("          type: " + binderName);
  
  if (binderType === 'Solace PubSub+') {
    config.push("          environment:");
    config.push("            solace:");
    config.push("              java:");
    config.push(`                host: '${params.host || 'tcp://your-solace-host:55554'}'`);
    config.push(`                msgVpn: '${params.msgVpn || 'your-message-vpn'}'`);
    config.push(`                clientUsername: '${params.username || 'your-username'}'`);
    config.push(`                clientPassword: '${params.password || 'your-password'}'`);
  } else if (binderType === 'Apache Kafka') {
    config.push("          environment:");
    config.push("            spring:");
    config.push("              kafka:");
    config.push("                bootstrap-servers: '${params.bootstrapServers || 'localhost:9092'}'");
    config.push("                security:");
    config.push("                  protocol: '${params.securityProtocol || 'PLAINTEXT'}'");
  } else if (binderType === 'RabbitMQ') {
    config.push("          environment:");
    config.push("            spring:");
    config.push("              rabbitmq:");
    config.push(`                host: '${params.rabbitHost || 'localhost'}'`);
    config.push(`                port: ${params.rabbitPort || 5672}`);
    config.push(`                username: '${params.rabbitUsername || 'guest'}'`);
    config.push(`                password: '${params.rabbitPassword || 'guest'}'`);
  }
  
  return config;
}


function getFunctionDescription(func) {
  // Use the actual generated function information from processedData
  const functionType = func.type || 'unknown';
  const isDynamic = func.dynamic || false;
  const hasParams = func.hasParams || false;
  const messageName = func.messageName || '';
  const sendMethodName = func.sendMethodName || '';
  
  // Build a comprehensive description based on the actual function properties
  let description = '';
  
  if (functionType === 'supplier') {
    description = 'Message supplier function for publishing messages';
    if (isDynamic) {
      description += ' (dynamic topic)';
    }
    if (messageName) {
      description += ` - publishes ${messageName} messages`;
    }
  } else if (functionType === 'consumer') {
    description = 'Message consumer function for processing messages';
    if (func.isQueueWithSubscription) {
      description += ` from queue "${func.queueName}"`;
    }
  } else if (functionType === 'send') {
    description = 'Dynamic send function for publishing messages';
    if (hasParams) {
      description += ' with dynamic topic parameters';
    }
  } else {
    // Fallback for unknown types
    if (func.name && func.name.includes('Supplier')) {
      description = 'Message supplier function for publishing messages';
    } else if (func.name && func.name.includes('Consumer')) {
      description = 'Message consumer function for processing messages';
    } else {
      description = 'Spring Cloud Stream function';
    }
  }
  
  return description;
}

function getChannels(asyncapi) {
  logger.debug('Readme.js: getChannels() - Getting channels');
  const channels = [];
  try {
    if (asyncapi.channels && typeof asyncapi.channels === 'function') {
      const channelMap = asyncapi.channels();
      // Get the raw JSON to access channel names
      const rawChannels = asyncapi._json?.channels || {};
      for (const [name, channel] of Object.entries(rawChannels)) {
        const description = getChannelDescription(channel);
        channels.push({ name, description });
      }
    }
  } catch (error) {
    logger.warn('Error getting channels:', error.message);
  }
  return channels;
}

function getChannelDescription(channel) {
  try {
    const operations = [];
    if (channel.operations && typeof channel.operations === 'function') {
      const ops = channel.operations();
      for (const op of ops.values()) {
        if (op.action && typeof op.action === 'function') {
          operations.push(op.action());
        }
      }
    }
    
    // Get channel description from AsyncAPI
    let description = '';
    if (channel.description && typeof channel.description === 'function') {
      description = channel.description();
    }
    
    return description || `${operations.join('/')} operations`;
  } catch (error) {
    return 'Message channel';
  }
}

function getQueues(asyncapi) {
  logger.debug('Readme.js: getQueues() - Getting Solace queues');
  const queueMap = new Map();
  try {
    if (asyncapi.channels && typeof asyncapi.channels === 'function') {
      // Get the raw JSON to access channel names
      const rawChannels = asyncapi._json?.channels || {};
      for (const [name, channel] of Object.entries(rawChannels)) {
        const channelQueues = extractQueuesFromChannel(channel);
        for (const queue of channelQueues) {
          if (queueMap.has(queue.name)) {
            // Merge topic subscriptions for existing queue
            const existingQueue = queueMap.get(queue.name);
            const allSubscriptions = new Set([
              ...existingQueue.topicSubscriptions,
              ...queue.topicSubscriptions
            ]);
            existingQueue.topicSubscriptions = Array.from(allSubscriptions);
            existingQueue.description = `Queue with ${existingQueue.topicSubscriptions.length} topic subscriptions`;
          } else {
            queueMap.set(queue.name, queue);
          }
        }
      }
    }
  } catch (error) {
    logger.warn('Error getting queues:', error.message);
  }
  return Array.from(queueMap.values());
}

function extractQueuesFromChannel(channel) {
  const queues = [];
  try {
    // Check for publish operations
    if (channel.publish && channel.publish.bindings && channel.publish.bindings.solace) {
      const solaceBinding = channel.publish.bindings.solace;
      if (solaceBinding.destinations && Array.isArray(solaceBinding.destinations)) {
        for (const dest of solaceBinding.destinations) {
          if (dest.destinationType === 'queue' && dest.queue) {
            const topicSubscriptions = dest.queue.topicSubscriptions || [];
            queues.push({
              name: dest.queue.name,
              description: `Queue with ${topicSubscriptions.length} topic subscriptions`,
              topicSubscriptions: topicSubscriptions.map(sub => sub.topic || sub)
            });
          }
        }
      }
    }
    
    // Check for subscribe operations
    if (channel.subscribe && channel.subscribe.bindings && channel.subscribe.bindings.solace) {
      const solaceBinding = channel.subscribe.bindings.solace;
      if (solaceBinding.destinations && Array.isArray(solaceBinding.destinations)) {
        for (const dest of solaceBinding.destinations) {
          if (dest.destinationType === 'queue' && dest.queue) {
            const topicSubscriptions = dest.queue.topicSubscriptions || [];
            queues.push({
              name: dest.queue.name,
              description: `Queue with ${topicSubscriptions.length} topic subscriptions`,
              topicSubscriptions: topicSubscriptions.map(sub => sub.topic || sub)
            });
          }
        }
      }
    }
  } catch (error) {
    logger.warn('Error extracting queues from channel:', error.message);
  }
  return queues;
}

function getMessageTypes(functions) {
  const messageTypes = new Set();
  functions.forEach(func => {
    if (func.messageTypes && Array.isArray(func.messageTypes)) {
      func.messageTypes.forEach(type => messageTypes.add(type));
    }
  });
  return Array.from(messageTypes);
}

function deduplicateSchemas(schemas) {
  const seen = new Set();
  const unique = [];
  
  schemas.forEach(schema => {
    const key = schema.className || schema.name;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(schema);
    }
  });
  
  return unique;
}

function deduplicateFunctions(functions) {
  const seen = new Set();
  const unique = [];
  
  functions.forEach(func => {
    if (!seen.has(func.name)) {
      seen.add(func.name);
      unique.push(func);
    }
  });
  
  return unique;
}

function deduplicateChannels(channels) {
  const seen = new Set();
  const unique = [];
  
  channels.forEach(channel => {
    if (!seen.has(channel.name)) {
      seen.add(channel.name);
      unique.push(channel);
    }
  });
  
  return unique;
}

module.exports = {
  Readme,
  getTitle,
  getVersion,
  getDescription,
  getApplicationDomain,
  getTechnologyStack,
  getJavaVersion,
  getMavenVersion,
  getBinderType,
  getBinderName,
  getConnectionConfig,
  getChannels,
  getQueues,
  getMessageTypes
}; 
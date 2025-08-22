const React = require('react');
const { Text } = require('@asyncapi/generator-react-sdk');
const { logger } = require('../utils/logger');
const { isJavaReservedWord } = require('../utils/typeUtils');

/**
 * PomXml component for generating Maven pom.xml
 */
function PomXml({ asyncapi, params, processedData, artifactType = 'application' }) {
  logger.debug('PomXml.js: PomXml() - Generating pom.xml component');
  const info = asyncapi.info();
  const groupId = getGroupId(info, params);
  const artifactId = getArtifactId(info, params);
  const version = info.version();
  const springBootVersion = getSpringBootVersion(info, params);
  const springCloudVersion = getSpringCloudVersion(info, params);
  const springCloudStreamVersion = getSpringCloudStreamVersion(info, params);
  const solaceSpringCloudVersion = getSolaceSpringCloudVersion(info, params);
  const kafkaSpringCloudVersion = getKafkaSpringCloudVersion(info, params);
  const rabbitSpringCloudVersion = getRabbitSpringCloudVersion(info, params);
  const binder = params.binder || 'kafka';
  const actuator = params.actuator === 'true' || params.actuator === true;

  if (artifactType === 'application') {
    return React.createElement(ApplicationPomXml, {
      groupId,
      artifactId,
      version,
      springBootVersion,
      springCloudVersion,
      solaceSpringCloudVersion,
      kafkaSpringCloudVersion,
      rabbitSpringCloudVersion,
      binder,
      actuator,
      processedData
    });
  } else {
    return React.createElement(LibraryPomXml, {
      groupId,
      artifactId,
      version,
      springCloudStreamVersion
    });
  }
}

function ApplicationPomXml({ groupId, artifactId, version, springBootVersion, springCloudVersion, solaceSpringCloudVersion, kafkaSpringCloudVersion, rabbitSpringCloudVersion, binder, actuator, processedData }) {
  logger.debug('PomXml.js: ApplicationPomXml() - Generating application pom.xml');
  return React.createElement(React.Fragment, null,
    React.createElement(Text, null, '<?xml version="1.0" encoding="UTF-8"?>'),
    React.createElement(Text, null, '<project xmlns="http://maven.apache.org/POM/4.0.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"'),
    React.createElement(Text, null, '         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">'),
    React.createElement(Text, null, '  <modelVersion>4.0.0</modelVersion>'),
    React.createElement(Text, null, ''),
    React.createElement(Text, null, `  <groupId>${groupId}</groupId>`),
    React.createElement(Text, null, `  <artifactId>${artifactId}</artifactId>`),
    React.createElement(Text, null, `  <version>${version}</version>`),
    React.createElement(Text, null, '  <packaging>jar</packaging>'),
    React.createElement(Text, null, `  <name>${artifactId}</name>`),
    React.createElement(Text, null, '  <description>Auto-generated Spring Cloud Stream AsyncAPI application</description>'),
    React.createElement(Text, null, ''),
    React.createElement(Text, null, '  <parent>'),
    React.createElement(Text, null, '    <groupId>org.springframework.boot</groupId>'),
    React.createElement(Text, null, '    <artifactId>spring-boot-starter-parent</artifactId>'),
    React.createElement(Text, null, `    <version>${springBootVersion}</version>`),
    React.createElement(Text, null, '    <relativePath/> <!-- lookup parent from repository -->'),
    React.createElement(Text, null, '  </parent>'),
    React.createElement(Text, null, ''),
    React.createElement(Text, null, '  <properties>'),
    React.createElement(Text, null, `    <spring-cloud.version>${springCloudVersion}</spring-cloud.version>`),
    ...(binder === 'solace' ? [
      React.createElement(Text, null, `    <solace-spring-cloud-bom.version>${solaceSpringCloudVersion}</solace-spring-cloud-bom.version>`)
    ] : []),
    ...(binder === 'kafka' ? [
      React.createElement(Text, null, `    <spring-cloud-stream-binder-kafka.version>${kafkaSpringCloudVersion}</spring-cloud-stream-binder-kafka.version>`)
    ] : []),
    ...(binder === 'rabbit' ? [
      React.createElement(Text, null, `    <spring-cloud-stream-binder-rabbit.version>${rabbitSpringCloudVersion}</spring-cloud-stream-binder-rabbit.version>`)
    ] : []),
    React.createElement(Text, null, '  </properties>'),
    React.createElement(Text, null, ''),
    React.createElement(Text, null, '  <dependencyManagement>'),
    React.createElement(Text, null, '    <dependencies>'),
    React.createElement(Text, null, '      <dependency>'),
    React.createElement(Text, null, '        <groupId>org.springframework.cloud</groupId>'),
    React.createElement(Text, null, '        <artifactId>spring-cloud-dependencies</artifactId>'),
    React.createElement(Text, null, '        <version>${spring-cloud.version}</version>'),
    React.createElement(Text, null, '        <type>pom</type>'),
    React.createElement(Text, null, '        <scope>import</scope>'),
    React.createElement(Text, null, '      </dependency>'),
    ...(binder === 'solace' ? [
      React.createElement(Text, null, '      <dependency>'),
      React.createElement(Text, null, '        <groupId>com.solace.spring.cloud</groupId>'),
      React.createElement(Text, null, '        <artifactId>solace-spring-cloud-bom</artifactId>'),
      React.createElement(Text, null, '        <version>${solace-spring-cloud-bom.version}</version>'),
      React.createElement(Text, null, '        <type>pom</type>'),
      React.createElement(Text, null, '        <scope>import</scope>'),
      React.createElement(Text, null, '      </dependency>')
    ] : []),
    React.createElement(Text, null, '    </dependencies>'),
    React.createElement(Text, null, '  </dependencyManagement>'),
    React.createElement(Text, null, ''),
    React.createElement(Text, null, '  <dependencies>'),
    ...(binder === 'rabbit' ? [
      React.createElement(Text, null, '    <dependency>'),
      React.createElement(Text, null, '      <groupId>org.springframework.cloud</groupId>'),
      React.createElement(Text, null, '      <artifactId>spring-cloud-stream-binder-rabbit</artifactId>'),
      React.createElement(Text, null, `      <version>${rabbitSpringCloudVersion}</version>`),
      React.createElement(Text, null, '    </dependency>')
    ] : binder === 'solace' ? [
      React.createElement(Text, null, '    <dependency>'),
      React.createElement(Text, null, '      <groupId>com.solace.spring.cloud</groupId>'),
      React.createElement(Text, null, '      <artifactId>spring-cloud-starter-stream-solace</artifactId>'),
      React.createElement(Text, null, '    </dependency>')
    ] : [
      React.createElement(Text, null, '    <dependency>'),
      React.createElement(Text, null, '      <groupId>org.springframework.cloud</groupId>'),
      React.createElement(Text, null, '      <artifactId>spring-cloud-stream-binder-kafka</artifactId>'),
      React.createElement(Text, null, `      <version>${kafkaSpringCloudVersion}</version>`),
      React.createElement(Text, null, '    </dependency>')
    ]),
    ...(actuator ? [
      React.createElement(Text, null, '    <dependency>'),
      React.createElement(Text, null, '      <groupId>org.springframework.boot</groupId>'),
      React.createElement(Text, null, '      <artifactId>spring-boot-starter-web</artifactId>'),
      React.createElement(Text, null, '    </dependency>'),
      React.createElement(Text, null, '    <dependency>'),
      React.createElement(Text, null, '      <groupId>org.springframework.boot</groupId>'),
      React.createElement(Text, null, '      <artifactId>spring-boot-starter-actuator</artifactId>'),
      React.createElement(Text, null, '    </dependency>'),
      React.createElement(Text, null, '    <dependency>'),
      React.createElement(Text, null, '      <groupId>io.micrometer</groupId>'),
      React.createElement(Text, null, '      <artifactId>micrometer-registry-prometheus</artifactId>'),
      React.createElement(Text, null, '    </dependency>')
    ] : []),
    ...(needsJacksonJsr310(processedData) ? [
      React.createElement(Text, null, '    <dependency>'),
      React.createElement(Text, null, '      <groupId>com.fasterxml.jackson.datatype</groupId>'),
      React.createElement(Text, null, '      <artifactId>jackson-datatype-jsr310</artifactId>'),
      React.createElement(Text, null, '    </dependency>')
    ] : []),
    ...(needsJacksonAnnotations(processedData) ? [
      React.createElement(Text, null, '    <dependency>'),
      React.createElement(Text, null, '      <groupId>com.fasterxml.jackson.core</groupId>'),
      React.createElement(Text, null, '      <artifactId>jackson-annotations</artifactId>'),
      React.createElement(Text, null, '    </dependency>')
    ] : []),
    ...(needsValidation(processedData) ? [
      React.createElement(Text, null, '    <dependency>'),
      React.createElement(Text, null, '      <groupId>org.springframework.boot</groupId>'),
      React.createElement(Text, null, '      <artifactId>spring-boot-starter-validation</artifactId>'),
      React.createElement(Text, null, '    </dependency>')
    ] : []),

    React.createElement(Text, null, '  </dependencies>'),
    React.createElement(Text, null, ''),
    React.createElement(Text, null, '  <build>'),
    React.createElement(Text, null, '    <plugins>'),
    React.createElement(Text, null, '      <plugin>'),
    React.createElement(Text, null, '        <groupId>org.springframework.boot</groupId>'),
    React.createElement(Text, null, '        <artifactId>spring-boot-maven-plugin</artifactId>'),
    React.createElement(Text, null, '      </plugin>'),
    React.createElement(Text, null, '    </plugins>'),
    React.createElement(Text, null, '  </build>'),
    React.createElement(Text, null, ''),
    React.createElement(Text, null, '</project>')
  );
}

function LibraryPomXml({ groupId, artifactId, version, springCloudStreamVersion }) {
  logger.debug('PomXml.js: LibraryPomXml() - Generating library pom.xml');
  return React.createElement(React.Fragment, null,
    React.createElement(Text, null, '<?xml version="1.0" encoding="UTF-8" ?>'),
    React.createElement(Text, null, '<project xmlns="http://maven.apache.org/POM/4.0.0" '),
    React.createElement(Text, null, '  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" '),
    React.createElement(Text, null, '  xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">'),
    React.createElement(Text, null, '  <modelVersion>4.0.0</modelVersion>'),
    React.createElement(Text, null, ''),
    React.createElement(Text, null, `  <groupId>${groupId}</groupId>`),
    React.createElement(Text, null, `  <artifactId>${artifactId}</artifactId>`),
    React.createElement(Text, null, `  <version>${version}</version>`),
    React.createElement(Text, null, `  <name>${artifactId}</name>`),
    React.createElement(Text, null, '  <packaging>jar</packaging>'),
    React.createElement(Text, null, ''),
    React.createElement(Text, null, '  <build>'),
    React.createElement(Text, null, '    <plugins>'),
    React.createElement(Text, null, '      <plugin>'),
    React.createElement(Text, null, '        <groupId>org.apache.maven.plugins</groupId>'),
    React.createElement(Text, null, '        <artifactId>maven-compiler-plugin</artifactId>'),
    React.createElement(Text, null, '        <configuration>'),
    React.createElement(Text, null, '          <source>8</source>'),
    React.createElement(Text, null, '          <target>8</target>'),
    React.createElement(Text, null, '        </configuration>'),
    React.createElement(Text, null, '      </plugin>'),
    React.createElement(Text, null, '    </plugins>'),
    React.createElement(Text, null, '  </build>'),
    React.createElement(Text, null, ''),
    React.createElement(Text, null, '  <properties>'),
    React.createElement(Text, null, '    <java.version>1.8</java.version>'),
    React.createElement(Text, null, `    <spring-cloud-stream.version>${springCloudStreamVersion}</spring-cloud-stream.version>`),
    React.createElement(Text, null, '  </properties>'),
    React.createElement(Text, null, ''),
    React.createElement(Text, null, '  <dependencies>'),
    React.createElement(Text, null, '    <dependency>'),
    React.createElement(Text, null, '      <groupId>org.springframework.cloud</groupId>'),
    React.createElement(Text, null, '      <artifactId>spring-cloud-stream</artifactId>'),
    React.createElement(Text, null, '      <version>${spring-cloud-stream.version}</version>'),
    React.createElement(Text, null, '    </dependency>'),
    React.createElement(Text, null, '  </dependencies>'),
    React.createElement(Text, null, ''),
    React.createElement(Text, null, ''),
    React.createElement(Text, null, '</project>')
  );
}

function getGroupId(info, params) {
  logger.debug('PomXml.js: getGroupId() - Getting group ID');
  
  // PRIORITY 1: Check for x-group-id extension first (higher priority than params)
  const extensions = info.extensions();
  if (extensions) {
    const xGroupId = extensions.get('x-group-id');
    if (xGroupId) {
      const value = xGroupId.value();
      logger.debug('PomXml.js: getGroupId() - Using x-group-id extension:', value);
      return value;
    }
  }
  
  // PRIORITY 2: Use params.groupId only if it's not the default value
  if (params.groupId && params.groupId !== 'com.company') {
    logger.debug('PomXml.js: getGroupId() - Using non-default params.groupId:', params.groupId);
    return params.groupId;
  }
  
  logger.debug('PomXml.js: getGroupId() - Using default: com.company');
  return 'com.company';
}

function getArtifactId(info, params) {
  logger.debug('PomXml.js: getArtifactId() - Getting artifact ID');
  
  // PRIORITY 1: Check AsyncAPI extensions first
  const extensions = info.extensions();
  if (extensions) {
    const xArtifactId = extensions.get('x-artifact-id');
    if (xArtifactId) {
      const value = xArtifactId.value();
      logger.debug('PomXml.js: getArtifactId() - Using x-artifact-id extension:', value);
      return value;
    }
  }
  
  // PRIORITY 2: Check params (but not if it's the default value)
  if (params.artifactId && params.artifactId !== 'project-name') {
    logger.debug('PomXml.js: getArtifactId() - Using params.artifactId:', params.artifactId);
    return params.artifactId;
  }
  
  // PRIORITY 3: Use default value (same as reference project)
  logger.debug('PomXml.js: getArtifactId() - Using default: project-name');
  return 'project-name';
}

function getSpringBootVersion(info, params) {
  logger.debug('PomXml.js: getSpringBootVersion() - Getting Spring Boot version');
  
  // PRIORITY 1: Check AsyncAPI extensions first
  if (info.extensions().get('x-spring-boot-version')) {
    const value = info.extensions().get('x-spring-boot-version').value();
    logger.debug('PomXml.js: getSpringBootVersion() - Using x-spring-boot-version extension:', value);
    return value;
  }
  
  // PRIORITY 2: Check params (but not if it's the default value)
  if (params.springBootVersion && params.springBootVersion !== '3.4.4') {
    logger.debug('PomXml.js: getSpringBootVersion() - Using non-default params.springBootVersion:', params.springBootVersion);
    return params.springBootVersion;
  }
  
  // PRIORITY 3: Use default value
  logger.debug('PomXml.js: getSpringBootVersion() - Using default: 3.4.4');
  return '3.4.4';
}

function getSpringCloudVersion(info, params) {
  logger.debug('PomXml.js: getSpringCloudVersion() - Getting Spring Cloud version');
  
  // PRIORITY 1: Check AsyncAPI extensions first
  if (info.extensions().get('x-spring-cloud-version')) {
    const value = info.extensions().get('x-spring-cloud-version').value();
    logger.debug('PomXml.js: getSpringCloudVersion() - Using x-spring-cloud-version extension:', value);
    return value;
  }
  
  // PRIORITY 2: Check params (but not if it's the default value)
  if (params.springCloudVersion && params.springCloudVersion !== '2024.0.0') {
    logger.debug('PomXml.js: getSpringCloudVersion() - Using non-default params.springCloudVersion:', params.springCloudVersion);
    return params.springCloudVersion;
  }
  
  // PRIORITY 3: Use default value
  logger.debug('PomXml.js: getSpringCloudVersion() - Using default: 2024.0.0');
  return '2024.0.0';
}

function getSpringCloudStreamVersion(info, params) {
  logger.debug('PomXml.js: getSpringCloudStreamVersion() - Getting Spring Cloud Stream version');
  
  // PRIORITY 1: Check AsyncAPI extensions first
  if (info.extensions().get('x-spring-cloud-stream-version')) {
    const value = info.extensions().get('x-spring-cloud-stream-version').value();
    logger.debug('PomXml.js: getSpringCloudStreamVersion() - Using x-spring-cloud-stream-version extension:', value);
    return value;
  }
  
  // PRIORITY 2: Check params (but not if it's the default value)
  if (params.springCloudStreamVersion && params.springCloudStreamVersion !== '3.1.3') {
    logger.debug('PomXml.js: getSpringCloudStreamVersion() - Using non-default params.springCloudStreamVersion:', params.springCloudStreamVersion);
    return params.springCloudStreamVersion;
  }
  
  // PRIORITY 3: Use default value
  logger.debug('PomXml.js: getSpringCloudStreamVersion() - Using default: 3.1.3');
  return '3.1.3';
}

function getSolaceSpringCloudVersion(info, params) {
  logger.debug('PomXml.js: getSolaceSpringCloudVersion() - Getting Solace Spring Cloud version');
  
  // PRIORITY 1: Check AsyncAPI extensions first
  if (info.extensions().get('x-solace-spring-cloud-version')) {
    const value = info.extensions().get('x-solace-spring-cloud-version').value();
    logger.debug('PomXml.js: getSolaceSpringCloudVersion() - Using x-solace-spring-cloud-version extension:', value);
    return value;
  }
  
  // PRIORITY 2: Check params (but not if it's the default value)
  if (params.solaceSpringCloudVersion && params.solaceSpringCloudVersion !== '4.8.0') {
    logger.debug('PomXml.js: getSolaceSpringCloudVersion() - Using non-default params.solaceSpringCloudVersion:', params.solaceSpringCloudVersion);
    return params.solaceSpringCloudVersion;
  }
  
  // PRIORITY 3: Use default value
  logger.debug('PomXml.js: getSolaceSpringCloudVersion() - Using default: 4.8.0');
  return '4.8.0';
}

function getKafkaSpringCloudVersion(info, params) {
  logger.debug('PomXml.js: getKafkaSpringCloudVersion() - Getting Kafka Spring Cloud version');
  
  // PRIORITY 1: Check AsyncAPI extensions first
  if (info.extensions().get('x-kafka-spring-cloud-version')) {
    const value = info.extensions().get('x-kafka-spring-cloud-version').value();
    logger.debug('PomXml.js: getKafkaSpringCloudVersion() - Using x-kafka-spring-cloud-version extension:', value);
    return value;
  }
  
  // PRIORITY 2: Check params (but not if it's the default value)
  if (params.kafkaSpringCloudVersion && params.kafkaSpringCloudVersion !== '4.2.0') {
    logger.debug('PomXml.js: getKafkaSpringCloudVersion() - Using non-default params.kafkaSpringCloudVersion:', params.kafkaSpringCloudVersion);
    return params.kafkaSpringCloudVersion;
  }
  
  // PRIORITY 3: Use default value
  logger.debug('PomXml.js: getKafkaSpringCloudVersion() - Using default: 4.2.0');
  return '4.2.0';
}

function getRabbitSpringCloudVersion(info, params) {
  logger.debug('PomXml.js: getRabbitSpringCloudVersion() - Getting RabbitMQ Spring Cloud version');
  
  // PRIORITY 1: Check AsyncAPI extensions first
  if (info.extensions().get('x-rabbit-spring-cloud-version')) {
    const value = info.extensions().get('x-rabbit-spring-cloud-version').value();
    logger.debug('PomXml.js: getRabbitSpringCloudVersion() - Using x-rabbit-spring-cloud-version extension:', value);
    return value;
  }
  
  // PRIORITY 2: Check params (but not if it's the default value)
  if (params.rabbitSpringCloudVersion && params.rabbitSpringCloudVersion !== '4.2.0') {
    logger.debug('PomXml.js: getRabbitSpringCloudVersion() - Using non-default params.rabbitSpringCloudVersion:', params.rabbitSpringCloudVersion);
    return params.rabbitSpringCloudVersion;
  }
  
  // PRIORITY 3: Use default value
  logger.debug('PomXml.js: getRabbitSpringCloudVersion() - Using default: 4.2.0');
  return '4.2.0';
}

/**
 * Check if Jackson JSR310 dependency is needed based on processed data
 */
function needsJacksonJsr310(processedData) {
  logger.debug('PomXml.js: needsJacksonJsr310() - Checking if Jackson JSR310 is needed');
  if (!processedData) {
    logger.debug('PomXml.js: needsJacksonJsr310() - processedData is null/undefined, returning false');
    return false;
  }
  
  // Check if any schema has properties with JSR310 types
  const jsr310Types = [
    'java.time.LocalDate',
    'java.time.LocalTime', 
    'java.time.LocalDateTime',
    'java.time.Instant',
    'java.time.OffsetDateTime',
    'java.time.Duration'
  ];
  
  const schemas = processedData.schemas || [];
  
  return schemas.some(schema => {
    const properties = schema.properties || [];
    logger.debug(`PomXml.js: needsJacksonJsr310() - Checking schema: ${schema.name}, properties count: ${properties.length}`);
    
    return properties.some(property => {
      // Check both type and format to detect JSR310 types
      const type = property.type;
      const format = property.format;
      const schemaName = property.schemaName;
      
      // Check for date-time format which maps to OffsetDateTime
      if (type === 'string' && format === 'date-time') {
        return true;
      }
      
      // Check for other JSR310 patterns
      if (type === 'string' && (format === 'date' || format === 'time')) {
        return true;
      }
      
      return false;
    });
  });
}

/**
 * Check if Jackson annotations dependency is needed based on processed data
 */
function needsJacksonAnnotations(processedData) {
  logger.debug('PomXml.js: needsJacksonAnnotations() - Checking if Jackson annotations are needed');
  if (!processedData) {
    logger.debug('PomXml.js: needsJacksonAnnotations() - processedData is null/undefined, returning false');
    return false;
  }
  
  const schemas = processedData.schemas || [];
  
  // Check if any schema has properties that need Jackson annotations
  return schemas.some(schema => {
    const properties = schema.properties || [];
    
    return properties.some(property => {
      // Check if property name is a Java reserved word
      if (isJavaReservedWord(property.name)) {
        logger.debug(`PomXml.js: needsJacksonAnnotations() - Found Java reserved word property: ${property.name}`);
        return true;
      }
      
      // Check if property has JsonProperty annotation
      if (property.needsJsonProperty) {
        logger.debug(`PomXml.js: needsJacksonAnnotations() - Found property needing JsonProperty: ${property.name}`);
        return true;
      }
      
      return false;
    });
  });
}



/**
 * Check if validation dependency is needed based on processed data
 */
function needsValidation(processedData) {
  logger.debug('PomXml.js: needsValidation() - Checking if validation is needed');
  if (!processedData) {
    logger.debug('PomXml.js: needsValidation() - processedData is null/undefined, returning false');
    return false;
  }
  
  const schemas = processedData.schemas || [];
  
  // Check if any schema has properties with validation constraints
  return schemas.some(schema => {
    const properties = schema.properties || [];
    
    return properties.some(property => {
      // Check for validation constraints (minimum, maximum, required)
      if (property.minimum !== undefined || property.maximum !== undefined) {
        logger.debug(`PomXml.js: needsValidation() - Found property with min/max constraints: ${property.name}`);
        return true;
      }
      
      // Check for required fields (NotNull annotations)
      if (property.required) {
        logger.debug(`PomXml.js: needsValidation() - Found required property: ${property.name}`);
        return true;
      }
      
      return false;
    });
  });
}



module.exports = {
  PomXml,
  ApplicationPomXml,
  LibraryPomXml,
  getGroupId,
  getArtifactId,
  getSpringBootVersion,
  getSpringCloudVersion,
  getSpringCloudStreamVersion,
  getSolaceSpringCloudVersion,
  needsJacksonJsr310,
  needsJacksonAnnotations,
  needsValidation
}; 
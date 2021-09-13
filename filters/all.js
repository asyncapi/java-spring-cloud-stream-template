const filter = module.exports;
const yaml = require('js-yaml');
const generatorFilters = require('@asyncapi/generator-filters');
const _ = require('lodash');
const ScsLib = require('../lib/scsLib.js');
const scsLib = new ScsLib();
// To enable debug logging, set the env var DEBUG="type function" with whatever things you want to see.
const debugDynamic = require('debug')('dynamic');
const debugFunction = require('debug')('function');
const debugJavaClass = require('debug')('javaClass');
const debugPayload = require('debug')('payload');
const debugProperty = require('debug')('property');
const debugChannel = require('debug')('channel');
const debugType = require('debug')('type');

const stringMap = new Map();
stringMap.set('date',{javaType: 'java.time.LocalDate', printFormat: '%s', sample: '2000-12-31'});
stringMap.set('date-time',{javaType: 'java.time.OffsetDateTime', printFormat: '%s', sample: '2000-12-31T23:59:59+01:00'});
stringMap.set('byte',{javaType: 'byte[]', printFormat: '%s', sample: 'U3dhZ2dlciByb2Nrcw=='});
stringMap.set('binary',{javaType: 'byte[]', printFormat: '%s', sample: 'base64-encoded file contents'});
stringMap.set(undefined,{javaType: 'String', printFormat: '%s', sample: '"string"'});

const integerMap = new Map();
integerMap.set('int32',{javaType: 'Integer', printFormat: '%d', sample: '1'});
integerMap.set('int64',{javaType: 'Long', printFormat: '%d', sample: '1L'});
integerMap.set(undefined,{javaType: 'Integer', printFormat: '%d', sample: '1'});

const numberMap = new Map();
numberMap.set('float',{javaType: 'Float', printFormat: '%f', sample: '1.1F'});
numberMap.set('double',{javaType: 'Double', printFormat: '%f', sample: '1.1'});
numberMap.set(undefined,{javaType: 'java.math.BigDecimal', printFormat: '%s', sample: '100.1'});

const booleanMap = new Map();
booleanMap.set(undefined,{javaType: 'Boolean', printFormat: '%s', sample: 'true'});

const nullMap = new Map();
nullMap.set(undefined,{javaType: 'String', printFormat: '%s', sample: 'null'});

const typeMap = new Map();
typeMap.set('boolean', booleanMap);
typeMap.set('integer', integerMap);
typeMap.set('null', nullMap);
typeMap.set('number', numberMap);
typeMap.set('string', stringMap);

function getType(type, format) {
  let typeObject = typeMap.get(type).get(format);
  if (typeObject === undefined) {
    typeObject = typeMap.get(type).get(undefined);
  }
  return typeObject;
}

class SCSFunction {
  get isPublisher() {
    return this.type === 'function' || this.type === 'supplier';
  }

  get isSubscriber() {
    return this.type === 'function' || this.type === 'consumer';
  }

  get publishBindingName() {
    return `${this.name  }-out-0`;
  }

  get subscribeBindingName() {
    return `${this.name  }-in-0`;
  }

  // This returns true if this is a function, but we need to render it as a consumer
  // because we need to call streamBridge to send out the message.
  get functionAsConsumer() {
    return this.type === 'function' && this.dynamic && this.dynamicType === 'streamBridge';
  }

  get functionSignature() {
    let ret = '';
    if (this.type === 'consumer' || (this.type === 'function' && this.dynamic && this.dynamicType === 'streamBridge')) {
      if (this.reactive) {
        ret = `public Consumer<Flux<${this.subscribePayload}>> ${this.name}()`;
      } else if (this.dynamic && this.parametersToHeaders) {
        ret = `public Consumer<Message<${this.subscribePayload}>> ${this.name}()`;
      } else {
        ret = `public Consumer<${this.subscribePayload}> ${this.name}()`;
      }
    } else if (this.type === 'supplier') {
      ret = this.getSupplierFunctionSignature();
    } else if (this.type === 'function') {
      ret = this.getFunctionMethodSignature();
    } else {
      throw new Error(`Can't determine the function signature for ${this.name} because the type is ${this.type}`);
    }
    return ret;
  }

  getSupplierFunctionSignature() {
    let ret = '';

    if (this.dynamic) {
      if (this.reactive) {
        ret = `public Supplier<Flux<Message<${this.publishPayload}>>> ${this.name}()`;
      } else {
        ret = `public Supplier<Message<${this.publishPayload}>> ${this.name}()`;
      }
    } else if (this.reactive) {
      ret = `public Supplier<Flux<${this.publishPayload}>> ${this.name}()`;
    } else {
      ret = `public Supplier<${this.publishPayload}> ${this.name}()`;
    }

    return ret;
  }

  getFunctionMethodSignature() {
    let ret = '';

    if (this.dynamic) {
      if (this.reactive) {
        ret = `public Function<Flux<${this.subscribePayload}>, Flux<Message<${this.publishPayload}>>> ${this.name}()`;
      } else {
        ret = `public Function<${this.subscribePayload}, Message<${this.publishPayload}>> ${this.name}()`;
      }
    } else if (this.reactive) {
      ret = `public Function<Flux<${this.subscribePayload}>, Flux<${this.publishPayload}>> ${this.name}()`;
    } else {
      ret = `public Function<${this.subscribePayload}, ${this.publishPayload}> ${this.name}()`;
    }

    return ret;
  }
}

// This generates the object that gets rendered in the application.yaml file.
function appProperties([asyncapi, params]) {
  debugProperty('appProperties start');

  if (params.binder !== 'kafka' && params.binder !== 'rabbit' && params.binder !== 'solace') {
    throw new Error('Please provide a parameter named \'binder\' with the value kafka, rabbit or solace.');
  }

  const doc = {};
  doc.spring = {};
  doc.spring.cloud = {};
  const cloud = doc.spring.cloud;
  cloud.function = {};

  // See if we have dynamic functions, and if the parametersToHeaders param is set.
  // If so, add the input-header-mapping-expression config to consumers which consume dynamic channels.
  if (params.parametersToHeaders) {
    handleParametersToHeaders(asyncapi, params, cloud);
  }

  debugProperty('appProperties getFunctionDefinitions');
  cloud.function.definition = getFunctionDefinitions(asyncapi, params);
  cloud.stream = {};
  const scs = cloud.stream;
  debugProperty('appProperties getBindings');
  scs.bindings = getBindings(asyncapi, params);

  if (params.binder === 'solace') {
    debugProperty('appProperties getAdditionalSubs');
    const additionalSubs = getAdditionalSubs(asyncapi, params);

    if (additionalSubs) {
      scs.solace = additionalSubs;
    }
  }

  if (params.binder === 'kafka') {
    const brokerSettings = getBrokerSettings(asyncapi, params);

    if (brokerSettings) {
      scs.kafka = brokerSettings;
    }
  }

  if (isApplication(params)) {
    if (params.binder === 'solace') {
      scs.binders = {};
      scs.binders['solace-binder'] = {};
      const sb = scs.binders['solace-binder'];
      sb.type = 'solace';
      sb.environment = {};
      sb.environment.solace = getSolace(params);
    }

    doc.logging = {};
    doc.logging.level = {};
    doc.logging.level.root = 'info';
    doc.logging.level.org = {};
    doc.logging.level.org.springframework = 'info';

    if (params.actuator === 'true') {
      doc.server = {};
      doc.server.port = 8080;
      doc.management = {};
      doc.management.endpoints = {};
      doc.management.endpoints.web = {};
      doc.management.endpoints.web.exposure = {};
      doc.management.endpoints.web.exposure.include = '*';
    }
  }
  const ym = yaml.safeDump(doc, { lineWidth: 200 });
  debugProperty('appProperties end');
  return ym;
}
filter.appProperties = appProperties;

function handleParametersToHeaders(asyncapi, params, cloud) {
  const dynamicFuncs = getDynamicFunctions([asyncapi, params]);

  if (dynamicFuncs && (params.binder === 'solace' || params.binder === 'rabbit')) {
    cloud.function.configuration = {};
    const funcs = getFunctionSpecs(asyncapi, params);

    funcs.forEach((spec, name, map) => {
      if (spec.dynamic && spec.type === 'consumer') {
        cloud.function.configuration[name] = {};
        cloud.function.configuration[name]['input-header-mapping-expression'] = {};
        const headerConfig = cloud.function.configuration[name]['input-header-mapping-expression'];
        addHeaderConfigs(params, spec.channelInfo, headerConfig);
      }
    });   
  }
}

function addHeaderConfigs(params, channelInfo, headerConfig) {
  for (const param of channelInfo.parameters) {
    if (params.binder === 'solace') {
      headerConfig[param.name] = `headers.solace_destination.getName.split("/")[${param.position}]`;
    } else if (params.binder === 'rabbit') {
      headerConfig[param.name] = `headers.amqp_receivedRoutingKey.getName.split("/")[${param.position}]`;
    }
  }
}

function artifactId([info, params]) {
  return scsLib.getParamOrDefault(info, params, 'artifactId', 'x-artifact-id');
}
filter.artifactId = artifactId;

function addtoExtraIncludesFromFunctionSpecs(asyncapi, params, extraIncludes) {
  const funcs = getFunctionSpecs(asyncapi, params);

  funcs.forEach((spec, name, map) => {
    if (spec.dynamic) {
      extraIncludes.dynamic = true;
    }
    if (spec.multipleMessages || spec.dynamic) {
      extraIncludes.needMessage = true;
    }
    if (spec.type === 'function' && !spec.functionAsConsumer) {
      extraIncludes.needBean = true;
      extraIncludes.needFunction = true;
    }
    if ((spec.type === 'supplier' && !(spec.dynamic && spec.dynamicType === 'streamBridge')) || spec.functionAsConsumer) {
      extraIncludes.needBean = true;
      extraIncludes.needSupplier = true;
    }
    if (spec.type === 'consumer') {
      extraIncludes.needBean = true;
      extraIncludes.needConsumer = true;
    }
  });
}

function appExtraIncludes([asyncapi, params]) {
  const extraIncludes = {};
  
  for (const channelName in asyncapi.channels()) {
    const channel = asyncapi.channels()[channelName];
    const subscribe = channel.subscribe();

    if (subscribe && (subscribe.hasMultipleMessages())) {
      extraIncludes.needMessage = true;
    }

    const publish = channel.publish();
    if (publish && publish.hasMultipleMessages()) {
      extraIncludes.needMessage = true;
    }
  }

  addtoExtraIncludesFromFunctionSpecs(asyncapi, params, extraIncludes);
  return extraIncludes;
}

filter.appExtraIncludes = appExtraIncludes;

function identifierName(str) {
  return scsLib.getIdentifierName(str);
}
filter.identifierName = identifierName;

function indent1(numTabs) {
  return indent(numTabs);
}
filter.indent1 = indent1;

function indent2(numTabs) {
  return indent(numTabs + 1);
}
filter.indent2 = indent2;

function indent3(numTabs) {
  return indent(numTabs + 2);
}
filter.indent3 = indent3;
// This returns the proper Java type for a schema property.
function fixType([name, javaName, property]) {
  debugType(`fixType: ${name}`);
  debugType(property);
  
  let isArrayOfObjects = false;

  // For message headers, type is a property.
  // For schema properties, type is a function.
  let type = property.type;
  let format = property.format;
  debugType(`fixType: ${property}`);

  if (typeof type === 'function') {
    type = property.type();
    format = property.format();
  }

  debugType(`fixType: type: ${type} javaName ${javaName}`);
  debugType(property);
  // If a schema has a property that is a ref to another schema,
  // the type is undefined, and the title gives the title of the referenced schema.
  let typeName;
  if (type === undefined) {
    if (property.enum()) {
      debugType('It is an enum.');
      typeName = _.upperFirst(javaName);
    } else {
      // check to see if it's a ref to another schema.
      typeName = property.ext('x-parser-schema-id');

      if (!typeName) {
        throw new Error(`Can't determine the type of property ${  name}`);
      }
    }
  } else if (type === 'array') {
    if (!property.items()) {
      throw new Error(`Array named ${  name  } must have an 'items' property to indicate what type the array elements are.`);
    }
    let itemsType = property.items().type();
    if (itemsType) {
      if (itemsType === 'object') {
        isArrayOfObjects = true;
        itemsType = _.upperFirst(javaName);
      } else {
        itemsType = getType(itemsType, format).javaType;
      }
    }
    if (!itemsType) {
      itemsType = property.items().ext('x-parser-schema-id');

      if (!itemsType) {
        throw new Error(`Array named ${  name  }: can't determine the type of the items.`);
      }
    }
    typeName = `${itemsType}[]`;
  } else if (type === 'object') {
    typeName = _.upperFirst(javaName);
  } else if (property.enum()) {
    debugType('It is an enum.');
    typeName = _.upperFirst(javaName);
  } else {
    typeName = getType(type,format).javaType;
    if (!typeName) {
      typeName = type;
    }
  }
  return [typeName, isArrayOfObjects];
}
filter.fixType = fixType;

function functionSpecs([asyncapi, params]) {
  return getFunctionSpecs(asyncapi, params);
}
filter.functionSpecs = functionSpecs;

// This returns the non-SCS type functions for sending to dynamic channels.
function getDynamicFunctions([asyncapi, params]) {
  const functionMap = new Map();
  debugDynamic('start:');
  for (const channelName in asyncapi.channels()) {
    const channel = asyncapi.channels()[channelName];
    debugDynamic(`getDynamicFunctions channelName ${channelName}`);
    debugDynamic(channel);
    const publisher = scsLib.getRealPublisher(asyncapi.info(), params, channel);
    if (publisher) {
      debugDynamic('found publisher:');
      debugDynamic(publisher);
      const channelInfo = getChannelInfo(params, channelName, channel);
      if (channelInfo.hasParams) {
        const spec = {};
        spec.channelInfo = channelInfo;
        spec.payloadClass = getPayloadClass(publisher);
        spec.sendMethodName = getSendFunctionName(channelName, publisher);
        functionMap.set(spec.sendMethodName, spec);
      }
    }
  }
  debugDynamic('functionMap');
  debugDynamic(functionMap);
  return functionMap;
}
filter.getDynamicFunctions = getDynamicFunctions;

// This returns the list of methods belonging to an object, just to help debugging.
const getMethods = (obj) => {
  const properties = new Set();
  let currentObj = obj;
  do {
    Object.getOwnPropertyNames(currentObj).forEach(item => properties.add(item));
  } while ((currentObj = Object.getPrototypeOf(currentObj)));
  return [...properties.keys()].filter(item => typeof obj[item] === 'function');
};

function getRealPublisher([info, params, channel]) {
  const pub = scsLib.getRealPublisher(info, params, channel);
  return pub;
}
filter.getRealPublisher = getRealPublisher;

function getRealSubscriber([info, params, channel]) {
  const pub = scsLib.getRealSubscriber(info, params, channel);
  return pub;
}
filter.getRealSubscriber = getRealSubscriber;

function groupId([info, params]) {  
  return scsLib.getParamOrDefault(info, params, 'groupId', 'x-group-id');
}
filter.groupId = groupId;

function isEmpty(obj) {
  if (!obj) {
    return true;
  }
  return obj && Object.keys(obj).length === 0 && obj.constructor === Object;
}
filter.isEmpty = isEmpty;

// Called from the java-class partial
function logJavaClass(obj) {
  debugJavaClass(obj);
}
filter.logJavaClass = logJavaClass;

function logFull(obj) {
  console.log(obj);
  if (obj) {
    console.log(dump(obj));
    console.log(getMethods(obj));
  }
  return obj;
}
filter.logFull = logFull;

function lowerFirst(str) {
  return _.lowerFirst(str);
}
filter.lowerFirst = lowerFirst;

function mainClassName([info, params]) {
  return scsLib.getParamOrDefault(info, params, 'javaClass', 'x-java-class', 'Application');
}
filter.mainClassName = mainClassName;

// This returns the Java class name of the payload.
function payloadClass([channelName, channel]) {
  let ret;

  if (channel.publish()) {
    ret = getPayloadClass(channel.publish());
  }

  if (!ret && channel.subscribe()) {
    ret = getPayloadClass(channel.subscribe());
  }

  if (!ret) {
    throw new Error(`Channel ${  channelName  }: no payload class has been defined.`);
  }
  return ret;
}
filter.payloadClass = payloadClass;

function schemaExtraIncludes([schemaName, schema]) {
  debugProperty(`schemaExtraIncludes ${schemaName} ${schema.type()}`);

  const ret = {};
  if (checkPropertyNames(schemaName, schema)) {
    ret.needJsonPropertyInclude = true;
  }
  debugProperty('checkPropertyNames:');
  debugProperty(ret);
  return ret;
}
filter.schemaExtraIncludes = schemaExtraIncludes;

function solaceSpringCloudVersion([info, params]) {
  return scsLib.getParamOrDefault(info, params, 'solaceSpringCloudVersion', 'x-solace-spring-cloud-version');
}
filter.solaceSpringCloudVersion = solaceSpringCloudVersion;

function springBootVersion([info, params]) {
  return scsLib.getParamOrDefault(info, params, 'springBootVersion', 'x-spring-boot-version');
}
filter.springBootVersion = springBootVersion;

function springCloudStreamVersion([info, params]) {
  return scsLib.getParamOrDefault(info, params, 'springCloudStreamVersion', 'x-spring-cloud-stream-version');
}
filter.springCloudStreamVersion = springCloudStreamVersion;

function springCloudVersion([info, params]) {
  return scsLib.getParamOrDefault(info, params, 'springCloudVersion', 'x-spring-cloud-version');
}
filter.springCloudVersion = springCloudVersion;

function stringify(obj) {
  const str = JSON.stringify(obj, null, 2);
  return str;
}
filter.stringify = stringify;

// Returns true if any property names will be different between json and java.
function checkPropertyNames(name, schema) {
  const ret = false;

  debugProperty(`checkPropertyNames: checking schema ${name}`);
  debugProperty(schema);

  let properties = schema.properties();

  if (schema.type() === 'array') {
    properties = schema.items().properties();
  }

  debugProperty(`schema type : ${schema.type()}`);

  for (const propName in properties) {
    const javaName = _.camelCase(propName);
    const prop = properties[propName];
    debugProperty(`checking ${propName} ${prop.type()}`);

    if (javaName !== propName) {
      debugProperty(`Java name ${javaName} is different from ${propName}`);
      return true;
    }
    if (prop.type() === 'object') {
      debugProperty('Recursing into object');
      const check = checkPropertyNames(propName, prop);
      if (check) {
        return true;
      }
    } else if (prop.type() === 'array') {
      debugProperty(`checkPropertyNames: ${prop}`);
      if (!prop.items) {
        throw new Error(`Array named ${  propName  } must have an 'items' property to indicate what type the array elements are.`);
      }
      const itemsType = prop.items().type();
      debugProperty(`checkPropertyNames: ${prop.items}`);
      debugProperty(`array of ${itemsType}`);
      if (itemsType === 'object') {
        debugProperty('Recursing into array');
        const check = checkPropertyNames(propName, prop.items());
        if (check) {
          return true;
        }
      }
    }
  }
  return ret;
}

function dump(obj) {
  let s = typeof obj;
  for (const p in obj) {
    s += ' ';
    s += p;
  }
  return s;
}

function getAdditionalSubs(asyncapi, params) {
  let ret;
  const funcs = getFunctionSpecs(asyncapi, params);
  funcs.forEach((spec, name, map) => {
    debugProperty(`getAdditionalSubs: ${spec.name} ${spec.isQueueWithSubscription} ${spec.additionalSubscriptions}`);
    // The first additional subscription will be the destination. If there is more than one the rest go here.
    if (spec.isQueueWithSubscription && spec.additionalSubscriptions.length > 1) {
      if (!ret) {
        ret = {};
        ret.bindings = {};
      }
      const bindingName = `${spec.subscribeBindingName}`;
      ret.bindings[bindingName] = {};
      ret.bindings[bindingName].consumer = {};
      ret.bindings[bindingName].consumer.queueAdditionalSubscriptions = spec.additionalSubscriptions.slice(1);
    }
  });
  return ret;
}

function getBrokerSettings(asyncapi, params) {
  let brokerSettings;

  if (params.useServers === 'true') {
    let brokers = '';

    for (const serverName in asyncapi.servers()) {
      const server = asyncapi.servers()[serverName];
      let url = server.url();
      if (server.variables()) {
        url = generatorFilters.replaceServerVariablesWithValues(url, server.variables());
      }
      brokers += `${url},`;
    }
    brokers = brokers.substring(0, brokers.length - 1);
    brokerSettings = {};
    brokerSettings.binder = {};
    brokerSettings.binder.brokers = brokers;
  }
  return brokerSettings;
}

// This returns the SCSt bindings config that will appear in application.yaml.
function getBindings(asyncapi, params) {
  const ret = {};
  const funcs = getFunctionSpecs(asyncapi, params);

  funcs.forEach((spec, name, map) => {
    if (spec.isPublisher) {
      ret[spec.publishBindingName] = {};
      ret[spec.publishBindingName].destination = spec.publishChannel;
    }
    if (spec.isSubscriber) {
      ret[spec.subscribeBindingName] = {};
      ret[spec.subscribeBindingName].destination = decodeURI(spec.subscribeChannel);
      if (spec.group) {
        ret[spec.subscribeBindingName].group = spec.group;
      }
    }
  });
  return ret;
}

// This returns the base function name that SCSt will use to map functions with bindings.
function getFunctionName(channelName, operation, isSubscriber) {
  if (operation.ext('x-scs-function-name')) {
    return operation.ext('x-scs-function-name');
  }

  let ret;
  let functionName;
  const smfBinding = operation.binding('smf');

  if (smfBinding && smfBinding.queueName && smfBinding.topicSubscriptions) {
    functionName = smfBinding.queueName;
  } else {
    if (operation.id()) {
      return operation.id();
    }
    functionName = channelName;
  }

  if (isSubscriber === undefined) {
    ret = _.camelCase(functionName);
  } else {
    ret = _.camelCase(functionName) + (isSubscriber ? 'Consumer' : 'Supplier');
  }

  return ret;
}

// This returns the string that gets rendered in the function.definition part of application.yaml.
function getFunctionDefinitions(asyncapi, params) {
  let ret = '';
  const funcs = getFunctionSpecs(asyncapi, params);
  const names = funcs.keys();
  ret = Array.from(names).join(';');
  return ret;
}

function getFunctionSpecs(asyncapi, params) {
  // This maps function names to SCS function definitions.

  debugFunction('--------------------------- getFunctionSpecs -------------------');

  if (params.dynamicType !== 'header' && params.dynamicType !== 'streamBridge') {
    throw new Error(`The dynamicType parameter must be either 'header' or 'streamBridge. Given: ${params.dynamicType}`);
  }

  const functionMap = new Map();
  const reactive = params.reactive === 'true';
  const info = asyncapi.info();

  for (const channelName in asyncapi.channels()) {
    const channel = asyncapi.channels()[channelName];
    debugFunction(`getFunctionSpecs channelName ${channelName}`);
    debugFunction(channel);
    let functionSpec;

    const publish = scsLib.getRealPublisher(info, params, channel);
    if (publish) {
      const name = getFunctionName(channelName, publish, false);
      debugFunction(`We have a real publisher named ${name}`);
      functionSpec = functionMap.get(name);
      if (functionSpec) {
        if (functionSpec.isPublisher) {
          throw new Error(`Function ${name} can't publish to both channels ${name} and ${channelName}.`);
        }
        functionSpec.type = 'function';
        debugFunction('Found existing subscriber, so this is a function.');
      } else {
        const channelInfo = getChannelInfo(params, channelName, channel);
        functionSpec = new SCSFunction();
        functionSpec.name = name;
        functionSpec.type = 'supplier';
        functionSpec.reactive = reactive;
        functionSpec.dynamic = channelInfo.hasParams;
        functionSpec.channelInfo = channelInfo;
        functionSpec.sendMethodName = getSendFunctionName(channelName, publish);
        functionSpec.dynamicType = params.dynamicType;
        functionSpec.parametersToHeaders = params.parametersToHeaders;
        functionSpec.multipleMessageComment = getMultipleMessageComment(publish);
        functionMap.set(name, functionSpec);
      }
      const payload = getPayloadClass(publish);
      if (!payload) {
        throw new Error(`Channel ${channelName}: no payload class has been defined.`);
      }
      functionSpec.publishPayload = payload;
      functionSpec.publishChannel = channelName;
    }

    const subscribe = scsLib.getRealSubscriber(info, params, channel);

    if (subscribe) {
      const name = getFunctionName(channelName, subscribe, true);
      debugFunction(`We have a real subscriber named ${name}`);
      const smfBinding = subscribe.binding('smf');
      debugFunction('smfBinding:');
      debugFunction(smfBinding);
      functionSpec = functionMap.get(name);
      if (functionSpec) {
        debugFunction(`This already exists: ${name} isQueueWithSubscription: ${functionSpec.isQueueWithSubscription}`);
        if (functionSpec.isQueueWithSubscription) { // This comes from an smf binding to a queue.
          debugFunction(functionSpec);
          for (const sub of smfBinding.channelSubscriptions) {
            let foundIt = false;
            for (const existingSub of functionSpec.additionalSubscriptions) {
              debugFunction(`Comparing ${sub} to ${existingSub}`);
              if (sub === existingSub) {
                foundIt = true;
                break;
              }
            }

            if (!foundIt) {
              debugFunction(`Adding new sub ${sub}`);
              functionSpec.additionalSubscriptions.push(sub);
              functionSpec.multipleMessages = true;
            }
          }
          debugFunction(`The queue ${functionSpec.name} has multiple subs: ${functionSpec.multipleMessages}`);
          if (functionSpec.multipleMessages) {
            functionSpec.subscribePayload = 'Message<?>';
          }
          debugFunction('Updated function spec:');
          debugFunction(functionSpec);
          continue;
        } else {
          if (functionSpec.isSubscriber) {
            throw new Error(`Function ${name} can't subscribe to both channels ${functionSpec.channel} and ${channelName}.`);
          }
          functionSpec.type = 'function';
          functionSpec.dynamicType = params.dynamicType;
        }
      } else {
        debugFunction('This is a new one.');
        const channelInfo = getChannelInfo(params, channelName, channel);
        functionSpec = new SCSFunction();
        functionSpec.name = name;
        functionSpec.type = 'consumer';
        functionSpec.reactive = reactive;
        functionSpec.dynamic = channelInfo.hasParams;
        functionSpec.channelInfo = channelInfo;
        functionSpec.dynamicType = params.dynamicType;
        functionSpec.parametersToHeaders = params.parametersToHeaders;
        functionSpec.multipleMessageComment = getMultipleMessageComment(subscribe);
        if (smfBinding && smfBinding.queueName && smfBinding.topicSubscriptions) {
          debugFunction(`A new one with subscriptions: ${smfBinding.topicSubscriptions}`);
          functionSpec.additionalSubscriptions = smfBinding.topicSubscriptions;
          functionSpec.isQueueWithSubscription = true;
          functionSpec.multipleMessages = smfBinding.topicSubscriptions && smfBinding.topicSubscriptions.length > 1;
        }
        functionMap.set(name, functionSpec);
      }

      if (functionSpec.multipleMessages) {
        functionSpec.subscribePayload = 'Message<?>';
      } else {
        const payload = getPayloadClass(subscribe);
        if (!payload) {
          throw new Error(`Channel ${channelName}: no payload class has been defined.`);
        }
        functionSpec.subscribePayload = payload;
      }
      const group = subscribe.ext('x-scs-group');
      if (group) {
        functionSpec.group = group;
      }
      const dest = subscribe.ext('x-scs-destination');
      if (dest) {
        functionSpec.subscribeChannel = dest;
      } else if (functionSpec.isQueueWithSubscription) {
        functionSpec.subscribeChannel = functionSpec.additionalSubscriptions[0];
        debugFunction(`Setting subscribeChannel for channelWithSubs: ${functionSpec.subscribeChannel}`);
      } else {
        const channelInfo = getChannelInfo(params, channelName, channel);
        functionSpec.subscribeChannel = channelInfo.subscribeChannel;
      }
    }

    debugFunction('functionSpec:');
    debugFunction(functionSpec);
  }

  return functionMap;
}

function getSendFunctionName(channelName, operation) {
  return `send${_.upperFirst(getFunctionName(channelName, operation, undefined))}`;
}

function getMultipleMessageComment(pubOrSub) {
  let ret;

  // We deliberately leave out the last newline, because that makes it easier to use in the template.
  // Otherwise it's really hard to get rid of an extra unwanted newline.
  if (pubOrSub.hasMultipleMessages()) {
    ret = '// The message can be of type:';
    pubOrSub.messages().forEach(m => {
      ret += '\n\t// ';
      ret += getMessagePayloadType(m);
    });
  }

  return ret;
}

function getPayloadClass(pubOrSub) {
  let ret;

  debugPayload(pubOrSub);
  if (pubOrSub.hasMultipleMessages()) {
    ret = 'Message<?>';
  } else {
    const message = pubOrSub.message();
    if (message) {
      ret = getMessagePayloadType(message);
    }
  }
  debugPayload(`getPayloadClass: ${ret}`);

  return ret;
}

function getMessagePayloadType(message) {
  let ret;
  const payload = message.payload();
  debugPayload('payload:');
  debugPayload(payload);

  if (payload) {
    const type = payload.type();
    debugPayload('type:');
    debugPayload(type);

    if (!type || type === 'object') {
      ret = payload.ext('x-parser-schema-id');
      ret = _.camelCase(ret);
      ret = _.upperFirst(ret);
    } else {
      ret = getType(type, payload.format()).javaType;
    }
  }
  return ret;
}

// This returns the connection properties for a solace binder, for application.yaml.
function getSolace(params) {
  const ret = {};
  ret.java = {};
  ret.java.host = params.host;
  ret.java.msgVpn = params.msgVpn;
  ret.java.clientUsername = params.username;
  ret.java.clientPassword = params.password;
  return ret;
}

// This returns an object containing information the template needs to render channel strings.
function getChannelInfo(params, channelName, channel) {
  const ret = {};

  // This isfor the parameterToHeader feature.
  const delimiter = (params.binder === 'rabbit' || params.binder === 'kafka') ? '.' : '/';
  const channelParts = channelName.split(delimiter);

  let publishChannel = String(channelName);
  let subscribeChannel = String(channelName);
  const parameters = [];
  let functionParamList = '';
  let functionArgList = '';
  let sampleArgList = '';
  let first = true;

  debugChannel('parameters:');
  debugChannel(channel.parameters());
  for (const name in channel.parameters()) {
    const nameWithBrackets = `{${name}}`;
    const parameter = channel.parameter(name);
    const schema = parameter.schema();
    const type = getType(schema.type(), schema.format());
    const param = { name: _.camelCase(name) };
    debugChannel(`name: ${name} type:`);
    debugChannel(type);
    let sampleArg = 1;

    // Figure out what position it's in. This is just for the parameterToHeader feature.
    for (let i = 0; i < channelParts.length; i++) {
      if (channelParts[i] === nameWithBrackets) {
        param.position = i;
        break;
      }
    }

    if (first) {
      first = false;
    } else {
      functionParamList += ', ';
      functionArgList += ', ';
    }

    sampleArgList += ', ';
    [publishChannel, sampleArg] = handleParameterType(name, param, type, publishChannel, schema, nameWithBrackets);
    subscribeChannel = subscribeChannel.replace(nameWithBrackets, '*');
    functionParamList += `${param.type} ${param.name}`;
    functionArgList += param.name;
    sampleArgList += sampleArg;
    parameters.push(param);
  }
  ret.functionArgList = functionArgList;
  ret.functionParamList = functionParamList;
  ret.sampleArgList = sampleArgList;
  ret.channelName = channelName;
  ret.parameters = parameters;
  ret.publishChannel = publishChannel;
  ret.subscribeChannel = subscribeChannel;
  ret.hasParams = parameters.length > 0;
  return ret;
}

function handleParameterType(name, param, type, publishChannel, schema, nameWithBrackets) {
  let sampleArg = 1;
  if (type) {
    debugChannel('It is a type:');
    debugChannel(type);
    const javaType = type.javaType || typeMap.get(type);
    if (!javaType) throw new Error(`channelInfo filter: type not found in typeMap: ${type}`);
    param.type = javaType;
    const printfArg = type.printFormat;
    debugChannel(`printf: ${printfArg}`);
    if (!printfArg) throw new Error(`channelInfo filter: printFormat not found in formatMap: ${type}`);
    debugChannel(`Replacing ${nameWithBrackets}`);
    publishChannel = publishChannel.replace(nameWithBrackets, printfArg);
    sampleArg = type.sample;
  } else {
    const en = schema.enum();
    if (en) {
      debugChannel(`It is an enum: ${en}`);
      param.type = _.upperFirst(name);
      param.enum = en;
      sampleArg = `Messaging.${param.type}.${en[0]}`;
      debugChannel(`Replacing ${nameWithBrackets}`);
      publishChannel = publishChannel.replace(nameWithBrackets, '%s');
    } else {
      throw new Error(`channelInfo filter: Unknown parameter type: ${  JSON.stringify(schema)}`);
    }
  }
  param.sampleArg = sampleArg;
  return [publishChannel, sampleArg];
}

function indent(numTabs) {
  return '\t'.repeat(numTabs);
}

function isApplication(params) {
  return params.artifactType === 'application';
}

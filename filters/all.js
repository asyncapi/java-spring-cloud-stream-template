const filter = module.exports;
const yaml = require('js-yaml');
const _ = require('lodash');
const ScsLib = require('../lib/scsLib.js');
const scsLib = new ScsLib();
	
// Library versions
const SOLACE_SPRING_CLOUD_VERSION = '1.1.1';
const SPRING_BOOT_VERSION = '2.3.2.RELEASE';
const SPRING_CLOUD_VERSION = 'Hoxton.SR8';
const SPRING_CLOUD_STREAM_VERSION = '3.0.7.RELEASE';

// Connection defaults. SOLACE_DEFAULT applies to msgVpn, username and password.
const SOLACE_HOST = 'tcp://localhost:55555';
const SOLACE_DEFAULT = 'default';

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
  get publishBindingName() {
    return `${this.name  }-out-0`;
  }

  get subscribeBindingName() {
    return `${this.name  }-in-0`;
  }

  get functionSignature() {
    let ret = '';
    switch (this.type) {
    case 'function':
      if (this.reactive) {
        ret = `public Function<Flux<${this.subscribePayload}>, Flux<${this.publishPayload}>> ${this.name}()`;
      } else {
        ret = `public Function<${this.subscribePayload}, ${this.publishPayload}> ${this.name}()`;
      }
      break;
    case 'supplier':
      if (this.reactive) {
        ret = `public Supplier<Flux<${this.publishPayload}>> ${this.name}()`;
      } else {
        ret = `public Supplier<${this.publishPayload}> ${this.name}()`;
      }
      break;
    case 'consumer':
      if (this.reactive) {
        ret = `public Consumer<Flux<${this.subscribePayload}>> ${this.name}()`;
      } else {
        ret = `public Consumer<${this.subscribePayload}> ${this.name}()`;
      }
      break;
    default:
      throw new Error(`Can't determine the function signature for ${this.name} because the type is ${this.type}`);
    }
    return ret;
  }

  get isPublisher() {
    return this.type === 'function' || this.type === 'supplier';
  }

  get isSubscriber() {
    return this.type === 'function' || this.type === 'consumer';
  }
}

// This generates the object that gets rendered in the application.yaml file.
function appProperties([asyncapi, params]) {
  params.binder = params.binder || 'kafka';
  if (params.binder !== 'kafka' && params.binder !== 'rabbit' && params.binder !== 'solace') {
    throw new Error('Please provide a parameter named \'binder\' with the value kafka, rabbit or solace.');
  }

  const doc = {};
  doc.spring = {};
  doc.spring.cloud = {};
  const cloud = doc.spring.cloud;
  cloud.function = {};
  cloud.function.definition = getFunctionDefinitions(asyncapi, params);
  cloud.stream = {};
  const scs = cloud.stream;
  scs.bindings = getBindings(asyncapi, params);

  if (params.binder === 'solace') {
    const additionalSubs = getAdditionalSubs(asyncapi, params);

    if (additionalSubs) {
      scs.solace = additionalSubs;
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
  //console.log(ym);
  return ym;
}
filter.appProperties = appProperties;

function artifactId([info, params]) {
  return scsLib.getParamOrDefault(info, params, 'artifactId', 'x-artifact-id', 'project-name');
}
filter.artifactId = artifactId;

function appExtraIncludes(asyncapi) {
  const ret = {};
  
  for (const channelName in asyncapi.channels()) {
    const channel = asyncapi.channels()[channelName];
    const subscribe = channel.subscribe();
    
    if (subscribe && subscribe.hasMultipleMessages()) {
      ret.needMessageInclude = true;
      break;
    }

    const publish = channel.publish();
    if (publish && publish.hasMultipleMessages()) {
      ret.needMessageInclude = true;
      break;
    }
  }

  return ret;
}
filter.appExtraIncludes = appExtraIncludes;

function schemaExtraIncludes([schemaName, schema]) {
  //console.log("checkPropertyNames " + schemaName + "  " + schema.type());
  const ret = {};
  if (checkPropertyNames(schemaName, schema)) {
    ret.needJsonPropertyInclude = true;
  }
  //console.log("checkPropertyNames:");
  //console.log(ret);
  return ret;
}
filter.schemaExtraIncludes = schemaExtraIncludes;

// This determines the base function name that we will use for the SCSt mapping between functions and bindings.
// It is only used in the Messaging.java template.
function functionName([channelName, channel]) {
  return getFunctionNameByChannel(channelName, channel);
}
filter.functionName = functionName;

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
  //console.log('fixType: ' + name + " " + dump(property));
  
  let isArrayOfObjects = false;

  // For message headers, type is a property.
  // For schema properties, type is a function.
  let type = property.type;
  let format = property.format;
  //console.log("fixType: " + property);

  if (typeof type === 'function') {
    type = property.type();
    format = property.format();
  }

  //console.log(`fixType: type: ${type} javaNamne ${javaName}` );
  //console.log(property);
  // If a schema has a property that is a ref to another schema,
  // the type is undefined, and the title gives the title of the referenced schema.
  let typeName;
  if (type === undefined) {
    if (property.enum()) {
      //console.log("It's an enum.");
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
        itemsType = typeMap.get(itemsType);
      }
    }
    if (!itemsType) {
      itemsType = property.items().ext('x-parser-schema-id');

      if (!itemsType) {
        throw new Error(`Array named ${  name  }: can't determine the type of the items.`);
      }
    }
    typeName = `${_.upperFirst(itemsType)  }[]`;
  } else if (type === 'object') {
    typeName = _.upperFirst(javaName);
  } else if (property.enum()) {
    //console.log("It's an enum.");
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
  // If we're generating the messaging class, we don't want these in the application class.
  let ret = null;
  if (!params.generateMessagingClass) {
    ret = getFunctionSpecs(asyncapi, params);
  }
  return ret;
}
filter.functionSpecs = functionSpecs;

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
  return scsLib.getParamOrDefault(info, params, 'groupId', 'x-group-id', 'com.company');
}
filter.groupId = groupId;

// This returns the list of methods belonging to an object, just to help debugging.
const getMethods = (obj) => {
  const properties = new Set();
  let currentObj = obj;
  do {
    Object.getOwnPropertyNames(currentObj).forEach(item => properties.add(item));
  } while ((currentObj = Object.getPrototypeOf(currentObj)));
  return [...properties.keys()].filter(item => typeof obj[item] === 'function');
};

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
  let ret = getPayloadClass(channel.publish());
  if (!ret) {
    ret = getPayloadClass(channel.subscribe());
  }
  if (!ret) {
    throw new Error(`Channel ${  channelName  }: no payload class has been defined.`);
  }
  return ret;
}
filter.payloadClass = payloadClass;

function solaceSpringCloudVersion([info, params]) {
  return scsLib.getParamOrDefault(info, params, 'solaceSpringCloudVersion', 'x-solace-spring-cloud-version', SOLACE_SPRING_CLOUD_VERSION);
}
filter.solaceSpringCloudVersion = solaceSpringCloudVersion;

function springBootVersion([info, params]) {
  return scsLib.getParamOrDefault(info, params, 'springBootVersion', 'x-spring-boot-version', SPRING_BOOT_VERSION);
}
filter.springBootVersion = springBootVersion;

function springCloudStreamVersion([info, params]) {
  return scsLib.getParamOrDefault(info, params, 'springCloudStreamVersion', 'x-spring-cloud-stream-version', SPRING_CLOUD_STREAM_VERSION);
}
filter.springCloudStreamVersion = springCloudStreamVersion;

function springCloudVersion([info, params]) {
  return scsLib.getParamOrDefault(info, params, 'springCloudVersion', 'x-spring-cloud-version', SPRING_CLOUD_VERSION);
}
filter.springCloudVersion = springCloudVersion;

function stringify(obj) {
  const str = JSON.stringify(obj, null, 2);
  return str;
}
filter.stringify = stringify;

// This returns an object containing information the template needs to render topic strings.
// Only used by the Messaging class.
function topicInfo([channelName, channel]) {
  return getTopicInfo(channelName, channel);
}
filter.topicInfo = topicInfo;

// Returns true if any property names will be different between json and java.
function checkPropertyNames(name, schema) {
  const ret = false;

  //console.log(JSON.stringify(schema));
  //console.log('checkPropertyNames: checking schema ' + name + getMethods(schema));
  
  let properties = schema.properties();

  if (schema.type() === 'array') {
    properties = schema.items().properties();
  }

  //console.log("schema type: " + schema.type());

  for (const propName in properties) {
    const javaName = _.camelCase(propName);
    const prop = properties[propName];
    //console.log('checking ' + propName + ' ' + prop.type());

    if (javaName !== propName) {
      //console.log("Java name " + javaName + " is different from " + propName);
      return true;
    }
    if (prop.type() === 'object') {
      //console.log("Recursing into object");
      const check = checkPropertyNames(propName, prop);
      if (check) {
        return true;
      }
    } else if (prop.type() === 'array') {
      //console.log('checkPropertyNames: ' + JSON.stringify(prop));
      if (!prop.items) {
        throw new Error(`Array named ${  propName  } must have an 'items' property to indicate what type the array elements are.`);
      }
      const itemsType = prop.items().type();
      //console.log('checkPropertyNames: ' + JSON.stringify(prop.items));
      //console.log('array of : ' + itemsType);
      if (itemsType === 'object') {
        //console.log("Recursing into array");
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

// For the Solace binder. This determines the topic that must be subscribed to on a queue, when the x-scs-destination is given (which is the queue name.)
function getAdditionalSubs(asyncapi, params) {
  let ret;

  for (const channelName in asyncapi.channels()) {
    const channel = asyncapi.channels()[channelName];
    const subscribe = scsLib.getRealSubscriber(asyncapi.info(), params, channel);
    
    if (subscribe) {
      const functionName = getFunctionName(channelName, subscribe, true);
      const topicInfo = getTopicInfo(channelName, channel);
      const queue = subscribe.ext('x-scs-destination');
      if (topicInfo.hasParams || queue) {
        if (!ret) {
          ret = {};
          ret.bindings = {};
        }
        const bindingName = `${functionName  }-in-0`;
        ret.bindings[bindingName] = {};
        ret.bindings[bindingName].consumer = {};
        ret.bindings[bindingName].consumer.queueAdditionalSubscriptions = topicInfo.subscribeTopic;
      }
    }
  } 

  return ret;
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
      ret[spec.subscribeBindingName].destination = spec.subscribeChannel;
      if (spec.group) {
        ret[spec.subscribeBindingName].group = spec.group;
      }
    }
  });
  return ret;
}

// This returns the base function name that SCSt will use to map functions with bindings.
function getFunctionName(channelName, operation, isSubscriber) {
  let ret;
  //console.log('getFunctionName operation: ' + JSON.stringify(operation));
  //console.log(operation);
  let functionName = operation.ext('x-scs-function-name');
  //console.log(getMethods(operation));

  if (!functionName) {
    functionName = operation.id();
  }

  if (functionName) {
    ret = functionName;
  } else {
    ret = _.camelCase(channelName) + (isSubscriber ? 'Consumer' : 'Supplier');
  }
  return ret;
}

// This returns the base function name that SCSt will use to map functions with bindings.
function getFunctionNameByChannel(channelName, channel) {
  let ret = _.camelCase(channelName);
  //console.log('functionName channel: ' + JSON.stringify(channelJson));
  const functionName = channel.ext('x-scs-function-name');
  //console.log('function name for channel ' + channelName + ': ' + functionName);
  if (functionName) {
    ret = functionName;
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
  const functionMap = new Map();
  const reactive = params.reactive === 'true';
  const info = asyncapi.info();

  for (const channelName in asyncapi.channels()) {
    const channel = asyncapi.channels()[channelName];
    //console.log("=====================================");
    //console.log("channelJson: " + JSON.stringify(channel._json));
    //console.log("getFunctionSpecs: " + channelName);
    //console.log("=====================================");
    let functionSpec;
    const publish = scsLib.getRealPublisher(info, params, channel);
    if (publish) {
      const name = getFunctionName(channelName, publish, false);
      functionSpec = functionMap.get(name);
      if (functionSpec) {
        if (functionSpec.type === 'supplier' || functionSpec === 'function') {
          throw new Error(`Function ${name} can't publish to both channels {a.channel} and ${channelName}.`);
        }
        functionSpec.type = 'function';
      } else {
        functionSpec = new SCSFunction();
        functionSpec.name = name;
        functionSpec.type = 'supplier';
        functionSpec.reactive = reactive;
        functionMap.set(name, functionSpec);
      }
      const payload = getPayloadClass(publish);
      if (!payload) {
        throw new Error(`Channel ${  channelName  }: no payload class has been defined.`);
      }
      functionSpec.publishPayload = payload;
      functionSpec.publishChannel = channelName;
    }

    const subscribe = scsLib.getRealSubscriber(info, params, channel);
    if (subscribe) {
      const name = getFunctionName(channelName, subscribe, true);
      functionSpec = functionMap.get(name);
      if (functionSpec) {
        if (functionSpec.type === 'consumer' || functionSpec === 'function') {
          throw new Error(`Function ${name} can't subscribe to both channels {functionSpec.channel} and ${channelName}.`);
        }
        functionSpec.type = 'function';
      } else {
        functionSpec = new SCSFunction();
        functionSpec.name = name;
        functionSpec.type = 'consumer';
        functionSpec.reactive = reactive;
        functionMap.set(name, functionSpec);
      }
      const payload = getPayloadClass(subscribe);
      if (!payload) {
        throw new Error(`Channel ${  channelName  }: no payload class has been defined.`);
      }
      functionSpec.subscribePayload = payload;
      const group = subscribe.ext('x-scs-group');
      if (group) {
        functionSpec.group = group;
      }
      const dest = subscribe.ext('x-scs-destination');
      if (dest) {
        functionSpec.subscribeChannel = dest;
      } else {
        functionSpec.subscribeChannel = channelName;
      }
    }
  }

  return functionMap;
}

function getPayloadClass(pubOrSub) {
  let ret;

  if (pubOrSub) {
    //console.log(pubOrSub);
    if (pubOrSub.hasMultipleMessages()) {
      ret = 'Message<?>';
    } else {
      const message = pubOrSub.message();
      if (message) {
        const payload = message.payload();

        if (payload) {
          ret = payload.ext('x-parser-schema-id');
          ret = _.camelCase(ret);
          ret = _.upperFirst(ret);
        }
      }
    }
  //console.log("getPayloadClass: " + ret);
  }
  
  return ret;
}

// This returns the connection properties for a solace binder, for application.yaml.
function getSolace(params) {
  const ret = {};
  ret.java = {};
  ret.java.host = params.host || SOLACE_HOST;
  ret.java.msgVpn = params.msgVpn || SOLACE_DEFAULT;
  ret.java.clientUsername = params.username || SOLACE_DEFAULT;
  ret.java.clientPassword = params.password || SOLACE_DEFAULT;
  return ret;
}

// This returns an object containing information the template needs to render topic strings.
function getTopicInfo(channelName, channel) {
  const ret = {};
  let publishTopic = String(channelName);
  let subscribeTopic = String(channelName);
  const params = [];
  let functionParamList = '';
  let functionArgList = '';
  let sampleArgList = '';
  let first = true;

  //console.log("params: " + JSON.stringify(channel.parameters()));
  for (const name in channel.parameters()) {
    const nameWithBrackets = `{${  name  }}`;
    const parameter = channel.parameter(name);
    const schema = parameter.schema();
    const type = getType(schema.type(), schema.format());
    const param = { name: _.lowerFirst(name) };
    //console.log("name: " + name + " type: " + type);
    let sampleArg = 1;

    if (first) {
      first = false;
    } else {
      functionParamList += ', ';
      functionArgList += ', ';
    }

    sampleArgList += ', ';

    if (type) {
      //console.log("It's a type: " + type);
      const javaType = type.javaType || typeMap.get(type);
      if (!javaType) throw new Error(`topicInfo filter: type not found in typeMap: ${  type}`);
      param.type = javaType;
      const printfArg = type.printFormat;
      //console.log("printf: " + printfArg);
      if (!printfArg) throw new Error(`topicInfo filter: type not found in formatMap: ${  type}`);
      //console.log("Replacing " + nameWithBrackets);
      publishTopic = publishTopic.replace(nameWithBrackets, printfArg);
      sampleArg = type.sample;
    } else {
      const en = schema.enum();
      if (en) {
        //console.log("It's an enum: " + en);
        param.type = _.upperFirst(name);
        param.enum = en;
        sampleArg = `Messaging.${  param.type  }.${  en[0]}`;
        //console.log("Replacing " + nameWithBrackets);
        publishTopic = publishTopic.replace(nameWithBrackets, '%s');
      } else {
        throw new Error(`topicInfo filter: Unknown parameter type: ${  JSON.stringify(schema)}`);
      }
    }

    subscribeTopic = subscribeTopic.replace(nameWithBrackets, '*');
    functionParamList += `${param.type  } ${  param.name}`;
    functionArgList += param.name;
    sampleArgList += sampleArg;
    params.push(param);
  }
  ret.functionArgList = functionArgList;
  ret.functionParamList = functionParamList;
  ret.sampleArgList = sampleArgList;
  ret.channelName = channelName;
  ret.params = params;
  ret.publishTopic = publishTopic;
  ret.subscribeTopic = subscribeTopic;
  ret.hasParams = params.length > 0;
  return ret;
}

function indent(numTabs) {
  return '\t'.repeat(numTabs);
}

function isApplication(params) {
  const artifactType = params.artifactType;
  return (!artifactType || artifactType === 'application');
}

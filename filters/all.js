// vim: set ts=2 sw=2 sts=2 expandtab :
module.exports = ({ Nunjucks }) => {

  var yaml = require('js-yaml');
  var _ = require('lodash');
  const ScsLib = require('../lib/ScsLib');
	const scsLib = new ScsLib();
	
	// Library versions
	const SOLACE_SPRING_CLOUD_VERSION = '1.0.0';
	const SPRING_BOOT_VERSION = '2.2.6.RELEASE';
	const SPRING_CLOUD_VERSION = 'Hoxton.SR3';
	const SPRING_CLOUD_STREAM_VERSION = '3.0.3.RELEASE';

	// Connection defaults. SOLACE_DEFAULT applies to msgVpn, username and password.
	const SOLACE_HOST = 'tcp://localhost:55555';
	const SOLACE_DEFAULT = 'default';

  // This maps json schema types to Java format strings.
  const formatMap = new Map();
  formatMap.set('boolean', '%s');
  formatMap.set('enum', '%s');
  formatMap.set('integer', '%d');
  formatMap.set('number', '%f');
  formatMap.set('null', '%s');
  formatMap.set('string', '%s');

  // This maps json schema types to examples of values.
  const sampleMap = new Map();
  sampleMap.set('boolean', 'true');
  sampleMap.set('integer', '1');
  sampleMap.set('null', 'string');
  sampleMap.set('number', '1.1');
  sampleMap.set('string', '"string"');

  // This maps json schema types to Java types.
  const typeMap = new Map();
  typeMap.set('boolean', 'Boolean');
  typeMap.set('integer', 'Integer');
  typeMap.set('null', 'String');
  typeMap.set('number', 'Double');
  typeMap.set('string', 'String');
	
  class SCSFunction {
    name;
    type;
    group;
    publishChannel;
    subscribeChannel;
    publishPayload;
    subscribePayload;
    reactive;

    get publishBindingName() {
      return this.name + "-out-0";
    }

    get subscribeBindingName() {
      return this.name + "-in-0";
    }

    get functionSignature() {
      var ret = '';
      switch(this.type) {
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
  Nunjucks.addFilter('appProperties', ([asyncapi, params]) => {
    params.binder = params.binder || 'kafka';
    if (params.binder != 'kafka' && params.binder != 'rabbit' && params.binder != 'solace') {
      throw new Error("Please provide a parameter named 'binder' with the value kafka, rabbit or solace.");
    }

    let doc = {};
    doc.spring = {};
    doc.spring.cloud = {};
    doc.spring.cloud.stream = {};
    let scs = doc.spring.cloud.stream;
    scs.function = {};
    scs.function.definition = getFunctionDefinitions(asyncapi, params);
    scs.bindings = getBindings(asyncapi, params);

    if (params.binder === 'solace') {
      let additionalSubs = getAdditionalSubs(asyncapi);

      if (additionalSubs) {
        scs.solace = additionalSubs;
      }
    }

		if (isApplication(params)) {
      if (params.binder === 'solace') {
        doc.solace = getSolace(params);
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
    let ym = yaml.safeDump(doc, { lineWidth: 200 } );
    //console.log(ym);
    return ym;
  });

  Nunjucks.addFilter('artifactId', ([info, params]) => {
    return scsLib.getParamOrDefault(info, params, 'artifactId', 'x-artifact-id', 'project-name');
  })

  Nunjucks.addFilter('appExtraIncludes', (asyncapi) => {
    let ret = {};
    
    for (let channelName in asyncapi.channels()) {
      let channel = asyncapi.channels()[channelName];
      let subscribe = channel.subscribe();
      
      if (subscribe && subscribe.hasMultipleMessages()) {
        ret.hasMultipleMessages = true;
        break;
      }

      let publish = channel.publish();
      if (publish && publish.hasMultipleMessages()) {
        ret.hasMultipleMessages = true;
        break;
      }
    }
  
    return ret;
  })

  Nunjucks.addFilter('camelCase', (str) => {
    return _.camelCase(str);
  })

  Nunjucks.addFilter('schemaExtraIncludes', ([schemaName, schema]) => {
    //console.log("checkPropertyNames " + schemaName + "  " + schema.type());
    let ret = {};
    if(checkPropertyNames(schemaName, schema)) {
      ret.jsonProperty = true;
    }
//    console.log("checkPropertyNames:");
//    console.log(ret);
    return ret;
  })

  // This determines the base function name that we will use for the SCSt mapping between functions and bindings.
  Nunjucks.addFilter('functionName', ([channelName, channel]) => {
    return getFunctionNameByChannel(channelName, channel);
  })

  Nunjucks.addFilter('identifierName', (str) => {
    return scsLib.getIdentifierName(str);
  })

  Nunjucks.addFilter('indent1', (numTabs) => {
    return indent(numTabs);
  })

  Nunjucks.addFilter('indent2', (numTabs) => {
    return indent(numTabs + 1);
  })

  Nunjucks.addFilter('indent3', (numTabs) => {
    return indent(numTabs + 2);
  })

  // This returns the proper Java type for a schema property.
  Nunjucks.addFilter('fixType', ([name, javaName, property]) => {

    //console.log('fixType: ' + name + " " + dump(property));
    
    let isArrayOfObjects = false;

    // For message headers, type is a property.
    // For schema properties, type is a function.
    let type = property.type;

    //console.log("fixType: " + property);

    if (typeof type == "function") {
      type = property.type();
    }

    // If a schema has a property that is a ref to another schema,
    // the type is undefined, and the title gives the title of the referenced schema.
    let ret;
    if (type === undefined) {
      if (property.enum()) {
        ret = _.upperFirst(javaName);
      } else {
        // check to see if it's a ref to another schema.
        ret = property.ext('x-parser-schema-id');

        if (!ret) {
          throw new Error("Can't determine the type of property " + name);
        }
      }
    } else if (type === 'array') {
      if (!property.items()) {
        throw new Error("Array named " + name + " must have an 'items' property to indicate what type the array elements are.");
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
        //console.log("items: " + itemsType + " -- " + itemsType2);

        if (!itemsType) {
          throw new Error("Array named " + name + ": can't determine the type of the items.");
        }
      }
      ret = _.upperFirst(itemsType) + "[]";
    } else if (type === 'object') {
      ret = _.upperFirst(javaName);
    } else {
      ret = typeMap.get(type);
      if (!ret) {
        ret = type;
      }
    }
    return [ret, isArrayOfObjects];
  })

  Nunjucks.addFilter('functions', ([asyncapi, params]) => {
    return getFunctionSpecs(asyncapi, params);
  });

  Nunjucks.addFilter('groupId', ([info, params]) => {
    return scsLib.getParamOrDefault(info, params, 'groupId', 'x-group-id', 'com.company');
  })

  Nunjucks.addFilter('log', (str) => {
    console.log(str);
    return str;
  })

  Nunjucks.addFilter('logFull', (obj) => {
    console.log(obj);
    if (obj) {
      console.log(dump(obj));
      console.log(getMethods(obj));
    }
    return obj;
  })


  Nunjucks.addFilter('lowerFirst', (str) => {
    return _.lowerFirst(str);
  })

  Nunjucks.addFilter('mainClassName', ([info, params]) => {
    return scsLib.getParamOrDefault(info, params, 'javaClass', 'x-java-class', 'Application');
  });

  // This returns the Java class name of the payload.
  Nunjucks.addFilter('payloadClass', ([channelName, channel]) => {
    let ret = getPayloadClass(channel.publish());
    if (!ret) {
      ret = getPayloadClass(channel.subscribe());
    }
    if (!ret) {
      throw new Error("Channel " + channelName + ": no payload class has been defined.");
    }
    return ret;
  })

  Nunjucks.addFilter('solaceSpringCloudVersion', ([info, params]) => {
    var required = isApplication(params) && params.binder === 'solace';
		return scsLib.getParamOrDefault(info, params, 'solaceSpringCloudVersion', 'x-solace-spring-cloud-version', SOLACE_SPRING_CLOUD_VERSION);
  })

  Nunjucks.addFilter('springBootVersion', ([info, params]) => {
		return scsLib.getParamOrDefault(info, params, 'springBootVersion', 'x-spring-boot-version', SPRING_BOOT_VERSION);
  })

  Nunjucks.addFilter('springCloudStreamVersion', ([info, params]) => {
		return scsLib.getParamOrDefault(info, params, 'springCloudStreamVersion', 'x-spring-cloud-stream-version', SPRING_CLOUD_STREAM_VERSION);
  })

  Nunjucks.addFilter('springCloudVersion', ([info, params]) => {
		return scsLib.getParamOrDefault(info, params, 'springCloudVersion', 'x-spring-cloud-version', SPRING_CLOUD_VERSION);
  })

	Nunjucks.addFilter('stringify', (obj) => {
    var str = JSON.stringify(obj, null, 2);
    return str;
  })


  // This returns an object containing information the template needs to render topic strings.
  Nunjucks.addFilter('topicInfo', ([channelName, channel]) => {
    let p = channel.parameters();
    return getTopicInfo(channelName, channel);
  })

  Nunjucks.addFilter('upperFirst', (str) => {
    return _.upperFirst(str);
  })

  // Returns true if any property names will be different between json and java.
  function checkPropertyNames(name, schema) {
    let ret = false;

    //console.log(JSON.stringify(schema));
		//console.log('checkPropertyNames: checking schema ' + name + getMethods(schema));
		
    var properties = schema.properties();
    

		if (schema.type() === 'array') {
      properties = schema.items().properties();
		}

    //console.log("schema type: " + schema.type());

    for (let propName in properties) {
      let javaName = _.camelCase(propName);
      let prop = properties[propName];
      //console.log('checking ' + propName + ' ' + prop.type());

      if (javaName !== propName) {
        //console.log("Java name " + javaName + " is different from " + propName);
        return true;
      }
      if (prop.type === 'object') {
        //console.log("Recursing into object");
        let check = checkPropertyNames(propName, prop);
        if (check) {
          return true;
        }
      } else if (prop.type === 'array') {
        //console.log('checkPropertyNames: ' + JSON.stringify(prop));
        if (!prop.items) {
          throw new Error("Array named " + propName + " must have an 'items' property to indicate what type the array elements are.");
        }
        let itemsType = prop.items.type;
        //console.log('checkPropertyNames: ' + JSON.stringify(prop.items));
        //console.log('array of : ' + itemsType);
        if (itemsType === 'object') {
          //console.log("Recursing into array");
          let check = checkPropertyNames(propName, prop.items);
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
    for (let p in obj) {
      s += " ";
      s += p;
    }
    return s;
  }

  // For the Solace binder. This determines the topic that must be subscribed to on a queue, when the x-scs-destination is given (which is the queue name.)
  function getAdditionalSubs(asyncapi) {
    let ret;

    for (let channelName in asyncapi.channels()) {
      let channel = asyncapi.channels()[channelName];
      let subscribe = channel.subscribe();
      
      if (subscribe) {
        let functionName = getFunctionName(channelName, subscribe);
        let topicInfo = getTopicInfo(channelName, channel);
        let queue = subscribe.ext('x-scs-destination');
        if (topicInfo.hasParams || queue) {
          if (!ret) {
            ret = {};
            ret.bindings = {};
          }
          let bindingName = functionName + "-in-0";
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
    let ret = {};
    let funcs = getFunctionSpecs(asyncapi, params);

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
  function getFunctionName(channelName, operation) {
    let ret;
    //console.log('functionName operation: ' + JSON.stringify(operation));
    let functionName = operation.ext('x-scs-function-name');
    //console.log(getMethods(operation));

    if (!functionName) {
      functionName = operation.id();
    }

    if (functionName) {
      ret = functionName;
    } else {
      ret = _.camelCase(channelName) + (operation.isSubscribe() ? "Consumer" : "Supplier");
    }
    return ret;
  }

  
  // This returns the base function name that SCSt will use to map functions with bindings.
  function getFunctionNameByChannel(channelName, channel) {
    let ret = _.camelCase(channelName);
    //console.log('functionName channel: ' + JSON.stringify(channelJson));
    let functionName = channel.ext('x-scs-function-name');
    //console.log('function name for channel ' + channelName + ': ' + functionName);
    if (functionName) {
      ret = functionName;
    }
    return ret;
  }

  // This returns the string that gets rendered in the function.definition part of application.yaml.
  function getFunctionDefinitions(asyncapi, params) {
    let ret = "";
    let funcs = getFunctionSpecs(asyncapi, params);
    let names = funcs.keys();
    ret = Array.from(names).join(";");
    return ret;
  }

  function getFunctionSpecs(asyncapi, params) {
    // This maps function names to SCS function definitions.
    const functionMap = new Map();
    const reactive = params.reactive === 'true';

    for (let channelName in asyncapi.channels()) {
      let channel = asyncapi.channels()[channelName];
      //console.log("=====================================");
      //console.log("channelJson: " + JSON.stringify(channel._json));
      //console.log("getFunctionSpecs: " + channelName);
      //console.log("=====================================");
      let functionSpec;
      let publish = channel.publish();
      if (publish) {
        let name = getFunctionName(channelName, publish);
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
        let payload = getPayloadClass(channel.publish());
        if (!payload) {
          throw new Error("Channel " + channelName + ": no payload class has been defined.");
        }
        functionSpec.publishPayload = payload;
        functionSpec.publishChannel = channelName;
      }

      let subscribe = channel.subscribe();
      if (subscribe) {
        let name = getFunctionName(channelName, subscribe);
        functionSpec = functionMap.get(name);
        if (functionSpec) {
          if (functionSpec.type === 'consumer' || functionSpec === 'function') {
            throw new Error(`Function ${name} can't subscribe to both channels {functionSpec.channel} and ${channelName}.`);
          }
          functionSpec.type = 'function'
        } else {
          functionSpec = new SCSFunction();
          functionSpec.name = name;
          functionSpec.type = 'consumer';
          functionSpec.reactive = reactive;
          functionMap.set(name, functionSpec);
        }
        let payload = getPayloadClass(subscribe);
        if (!payload) {
          throw new Error("Channel " + channelName + ": no payload class has been defined.");
        }
        functionSpec.subscribePayload = payload;
        var group = subscribe.ext('x-scs-group');
        if (group) {
            functionSpec.group = group;
        }
        var dest = subscribe.ext('x-scs-destination');
        if (dest) {
            functionSpec.subscribeChannel = dest;
        } else {
            functionSpec.subscribeChannel = channelName;
        }
      }
    }

    return functionMap;
  }
  
  const getMethods = (obj) => {
    let properties = new Set()
    let currentObj = obj
    do {
      Object.getOwnPropertyNames(currentObj).map(item => properties.add(item))
    } while ((currentObj = Object.getPrototypeOf(currentObj)))
    return [...properties.keys()].filter(item => typeof obj[item] === 'function')
  }

  function getPayloadClass(pubOrSub) {
    let ret;

    if (pubOrSub) {
      //console.log(pubOrSub);

      if (pubOrSub.hasMultipleMessages()) {
        ret = 'Message<?>';
      } else {

      let message = pubOrSub.message();
      if (message) {
        let payload = message.payload();

        if (payload) {
          ret = payload.ext('x-parser-schema-id');
        }
      }
    }
    //console.log("getPayloadClass: " + ret);
    }
    
    return ret;
  }

  // This returns the connection properties for a solace binder, for application.yaml.
  function getSolace(params) {
    let ret = {};
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
    let functionParamList = "";
    let functionArgList = "";
    let sampleArgList = "";
    let first = true;

    //console.log("params: " + JSON.stringify(channel.parameters()));
    for (let name in channel.parameters()) {
      const nameWithBrackets = "{" + name + "}";
      const parameter = channel.parameter(name);
      const schema = parameter.schema();
      const type = schema.type();
      const param = { "name": _.lowerFirst(name) };
      //console.log("name: " + name + " type: " + type);
      let sampleArg = 1;

      if (first) {
        first = false;
      } else {
        functionParamList += ", ";
        functionArgList += ", ";
      }

      sampleArgList += ", ";

      if (type) {
        //console.log("It's a type: " + type);
        const javaType = typeMap.get(type);
        if (!javaType) throw new Error("topicInfo filter: type not found in typeMap: " + type);
        param.type = javaType;
        const printfArg = formatMap.get(type);
        //console.log("printf: " + printfArg);
        if (!printfArg) throw new Error("topicInfo filter: type not found in formatMap: " + type);
        //console.log("Replacing " + nameWithBrackets);
        publishTopic = publishTopic.replace(nameWithBrackets, printfArg);
        sampleArg = sampleMap.get(type);
      } else {
        const en = schema.enum();
        if (en) {
          //console.log("It's an enum: " + en);
          param.type = _.upperFirst(name);
          param.enum = en;
          sampleArg = "Messaging." + param.type + "." + en[0];
          //console.log("Replacing " + nameWithBrackets);
          publishTopic = publishTopic.replace(nameWithBrackets, "%s");
        } else {
          throw new Error("topicInfo filter: Unknown parameter type: " + JSON.stringify(schema));
        }
      }

      subscribeTopic = subscribeTopic.replace(nameWithBrackets, "*");
      functionParamList += param.type + " " + param.name;
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
    return "\t".repeat(numTabs);
  }

  function isApplication(params) {
    var artifactType = params.artifactType;
    return (!artifactType || artifactType === 'application')
  }
}

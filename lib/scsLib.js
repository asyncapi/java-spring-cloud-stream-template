// This contains functions that are common to both the all.js filter and the post-process.js hook.
//const Common = require('./common.ts');
const _ = require('lodash');

class ScsLib {
  constructor() {
    if (!ScsLib.javaKeywords) {
      this.initReservedWords();
    }
  }

  // This returns a valid Java class name.
  getClassName(name) {
    const ret = _.camelCase(name);
    console.log(`getClassName: ${name} ${ret}`);
    return _.upperFirst(ret);
  }

  // This returns a valid Java identifier name.
  getIdentifierName(name) {
    let ret = _.camelCase(name);

    if (ScsLib.javaKeywords.has(ret)) {
      ret = `_${ret}`;
    }

    return ret;
  }

  // This returns the value of a param, or specification extension if the param isn't set.
  // If neither is set and the required flag is true, it throws an error.
  getParamOrExtension(info, params, paramName, extensionName, description, example, required) {
    let ret = '';
    if (params[paramName]) {
      ret = params[paramName];
    } else if (info.extensions()[extensionName]) {
      ret = info.extensions()[extensionName];
    } else if (required) {
      throw new Error(`Can't determine the ${description}. Please set the param ${paramName} or info.${extensionName}. Example: ${example}`);
    }
    return ret;
  }

  // This returns the value of a param, or specification extension if the param isn't set.
  // If neither is set it returns defaultValue.
  getParamOrDefault(info, params, paramName, extensionName, defaultValue) {
    let ret = '';
    if (params[paramName]) {
      ret = params[paramName];
    } else if (info.extensions()[extensionName]) {
      ret = info.extensions()[extensionName];
    } else {
      ret = defaultValue;
    }
    return ret;
  }

  /*
  By default, the 'view' is 'client', which means that when the doc says subscribe, we publish.
  By setting the view to 'provider', when the doc says subscribe, we subscribe.
  */
  isProvidererView(info, params) {
    const view = this.getParamOrDefault(info, params, 'view', 'x-view', undefined);
    return view === 'provider';
  }

  /*
  See isProviderView above.
  This returns true if the operation should physically subscribe, based on the 'view' param.
  */
  isRealSubscriber(info, params, operation) {
    const isProvider = this.isProvidererView(info, params);
    const ret = (isProvider && operation.isSubscribe()) || (!isProvider && !operation.isSubscribe());
    console.log(`isRealSubscriber: isProvider: ${isProvider} isSubscribe: ${operation.isSubscribe()}`);
    return ret;
  }

  getRealPublisher(info, params, channel) {
    const isProvider = this.isProvidererView(info, params);
    return isProvider ? channel.publish() : channel.subscribe();
  }

  getRealSubscriber(info, params, channel) {
    const isProvider = this.isProvidererView(info, params);
    return isProvider ? channel.subscribe() : channel.publish();
  }

  initReservedWords() {
    // This is the set of Java reserved words, to ensure that we don't generate any by mistake.
    ScsLib.javaKeywords = new Set();
    ScsLib.javaKeywords.add('abstract');
    ScsLib.javaKeywords.add('assert');
    ScsLib.javaKeywords.add('boolean');
    ScsLib.javaKeywords.add('break');
    ScsLib.javaKeywords.add('byte');
    ScsLib.javaKeywords.add('case');
    ScsLib.javaKeywords.add('catch');
    ScsLib.javaKeywords.add('char');
    ScsLib.javaKeywords.add('class');
    ScsLib.javaKeywords.add('const');
    ScsLib.javaKeywords.add('continue');
    ScsLib.javaKeywords.add('default');
    ScsLib.javaKeywords.add('do');
    ScsLib.javaKeywords.add('double');
    ScsLib.javaKeywords.add('else');
    ScsLib.javaKeywords.add('enum');
    ScsLib.javaKeywords.add('extends');
    ScsLib.javaKeywords.add('final');
    ScsLib.javaKeywords.add('finally');
    ScsLib.javaKeywords.add('float');
    ScsLib.javaKeywords.add('for');
    ScsLib.javaKeywords.add('if');
    ScsLib.javaKeywords.add('goto');
    ScsLib.javaKeywords.add('implements');
    ScsLib.javaKeywords.add('import');
    ScsLib.javaKeywords.add('instalceof');
    ScsLib.javaKeywords.add('int');
    ScsLib.javaKeywords.add('interface');
    ScsLib.javaKeywords.add('long');
    ScsLib.javaKeywords.add('native');
    ScsLib.javaKeywords.add('new');
    ScsLib.javaKeywords.add('package');
    ScsLib.javaKeywords.add('private');
    ScsLib.javaKeywords.add('proteccted');
    ScsLib.javaKeywords.add('public');
    ScsLib.javaKeywords.add('return');
    ScsLib.javaKeywords.add('short');
    ScsLib.javaKeywords.add('static');
    ScsLib.javaKeywords.add('strictfp');
    ScsLib.javaKeywords.add('super');
    ScsLib.javaKeywords.add('switch');
    ScsLib.javaKeywords.add('syncronized');
    ScsLib.javaKeywords.add('this');
    ScsLib.javaKeywords.add('throw');
    ScsLib.javaKeywords.add('throws');
    ScsLib.javaKeywords.add('transient');
    ScsLib.javaKeywords.add('try');
    ScsLib.javaKeywords.add('void');
    ScsLib.javaKeywords.add('volatile');
    ScsLib.javaKeywords.add('while');
  }
}

module.exports = ScsLib;

const _ = require('lodash');

class ModelClass {
  constructor() {
    this.innerClass = true;
  }

  getClassName() {
    return this.className;
  }

  setClassName(originalName) {
    this.className = this.fixClassName(originalName);
  }

  getSuperClassName() {
    return this.superClassName;
  }

  setSuperClassName(originalName) {
    this.superClassName = this.fixClassName(originalName);
  }

  getJavaPackage() {
    return this.javaPackage;
  }

  setJavaPackage(javaPackage) {
    this.javaPackage = javaPackage;
  }

  isSubClass() {
    return this.superClassName !== undefined;
  }

  fixClassName(originalName) {
    return _.upperFirst(_.camelCase(originalName));
  }

  setCanBeInnerClass(innerClass) {
    this.innerClass = innerClass;
  }

  canBeInnerClass() {
    return this.innerClass;
  }
}

module.exports = ModelClass;
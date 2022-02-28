// Common utility functions used throughout
class Util {
  stripPackageName(dotSeparatedName) {
    // If there is a dot in the schema name, it's probably an Avro schema with a fully qualified name (including the namespace.)
    const indexOfDot = dotSeparatedName.lastIndexOf('.');
    if (indexOfDot > 0) {
      return { className: dotSeparatedName.substring(indexOfDot + 1), javaPackage: dotSeparatedName.substring(0, indexOfDot) };
    }
    return { className: dotSeparatedName, javaPackage: undefined };
  }
}

module.exports = Util;
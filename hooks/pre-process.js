const ApplicationModel = require('../lib/applicationModel.js');

module.exports = {
  'generate:before': generator => {
    ApplicationModel.asyncapi = generator.asyncapi;
  }
};
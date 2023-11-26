const ApplicationModel = require('../lib/applicationModel.js');
const applicationModel = new ApplicationModel('setFileTemplateName');

module.exports = {
	'setFileTemplateName': (generator, hookArguments) => {
		const currentFilename = hookArguments.originalFilename;
		// getModelClass will set up the model classes again - this should be optimized to only be done once and used throughout this code generator
		const classModel = applicationModel.getModelClass({ schemaName: currentFilename });
		return classModel.getClassName();
	}
};
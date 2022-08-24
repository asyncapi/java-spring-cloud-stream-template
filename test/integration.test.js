const path = require('path');
const Generator = require('@asyncapi/generator');
const { readFile } = require('fs').promises;
const crypto = require('crypto');

const TEST_SUITE_NAME = 'template integration tests using the generator';
// Constants not overridden per test
const TEST_FOLDER_NAME = 'test';
const MAIN_TEST_RESULT_PATH = path.join(TEST_FOLDER_NAME, 'temp', 'integrationTestResult');

// Unfortunately, the test suite name must be a hard coded string
describe('template integration tests using the generator', () => {
  jest.setTimeout(30000);

  // Constants that may be overridden per test
  const DEFAULT_PACKAGE = 'com.acme';
  const DEFAULT_PACKAGE_PATH = path.join(...DEFAULT_PACKAGE.split('.'));

  let outputDirectory;

  const generateFolderName = () => {
    // we always want to generate to new directory to make sure test runs in clear environment
    const testName = expect.getState().currentTestName.substring(TEST_SUITE_NAME.length + 1);
    return path.resolve(MAIN_TEST_RESULT_PATH, `${testName  } - ${  crypto.randomBytes(4).toString('hex')}`);
  };

  const generate = (asyncApiFilePath, params) => {
    const generator = new Generator(path.normalize('./'), outputDirectory, { forceWrite: true, templateParams: params });
    return generator.generateFromFile(path.resolve(TEST_FOLDER_NAME, asyncApiFilePath));
  };

  const assertExpectedFiles = async (expectedFiles) => {
    for (const index in expectedFiles) {
      const file = await readFile(path.join(outputDirectory, expectedFiles[index]), 'utf8');
      expect(file).toMatchSnapshot();
    }
  };

  beforeEach(() => {
    outputDirectory = generateFolderName();
  });

  it('should generate application files using the solace binder', async () => {
    const params = {
      binder: 'solace',
      javaPackage: DEFAULT_PACKAGE,
      host: 'testVmrUri',
      username: 'user',
      password: 'test', //NOSONAR
      msgVpn: 'vpnName',
      artifactId: 'asyncApiFileName'
    };

    await generate('mocks/solace-test-app.yaml', params);

    const validatedFiles = [
      'pom.xml',
      'README.md',
      `src/main/java/${DEFAULT_PACKAGE_PATH}/Application.java`,
      `src/main/java/${DEFAULT_PACKAGE_PATH}/MySchema.java`,
      'src/main/resources/application.yml'
    ];
    await assertExpectedFiles(validatedFiles);
  });

  it('should generate a consumer and return a payload when using x-scs-function-name and dynamic topic binding', async () => {
    await generate('mocks/scs-function-name/dynamic-topic-same-function-name.yaml');
  
    const validatedFiles = [
      'src/main/java/Application.java'
    ];
    await assertExpectedFiles(validatedFiles);
  });

  it('should generate a function and return a payload when using x-scs-function-name and a static topic', async () => {
    await generate('mocks/scs-function-name/animals-same-function-name.yaml');

    const validatedFiles = [
      'src/main/java/Application.java'
    ];
    await assertExpectedFiles(validatedFiles);
  });

  it('should generate extra config when using the paramatersToHeaders parameter', async () => {
    const params = {
      binder: 'solace',
      javaPackage: DEFAULT_PACKAGE,
      host: 'testVmrUri',
      username: 'user',
      password: 'test', //NOSONAR
      msgVpn: 'vpnName',
      artifactId: 'asyncApiFileName',
      parametersToHeaders: true
    };

    await generate('mocks/solace-test-app.yaml', params);

    const validatedFiles = [
      `src/main/java/${DEFAULT_PACKAGE_PATH}/Application.java`,
      'src/main/resources/application.yml'
    ];
    await assertExpectedFiles(validatedFiles);
  });

  it('should generate a comment for a consumer receiving multiple messages', async () => {
    await generate('mocks/animals.yaml');

    const validatedFiles = [
      'src/main/java/Application.java'
    ];
    await assertExpectedFiles(validatedFiles);
  });

  it('avro schemas should appear in a package based on their namespace, if any.', async () => {
    // Note that this file has 2 Avro schemas named User, but one has the namespace 'userpublisher.'
    const AVRO_PACKAGE_PATH = 'userpublisher';
    const params = {
      binder: 'kafka',
      javaPackage: DEFAULT_PACKAGE,
      artifactId: 'asyncApiFileName'
    };
    await generate('mocks/kafka-avro.yaml', params);

    const validatedFiles = [
      `src/main/java/${DEFAULT_PACKAGE_PATH}/User.java`,
      `src/main/java/${AVRO_PACKAGE_PATH}/User.java`,
    ];
    await assertExpectedFiles(validatedFiles);
  });

  it('should generate a model subclass when it sees an allOf', async () => {
    const params = {
      javaPackage: DEFAULT_PACKAGE,
      artifactId: 'asyncApiFileName'
    };
    await generate('mocks/error-reporter.yaml', params);

    const validatedFiles = [
      `src/main/java/${DEFAULT_PACKAGE_PATH}/ExtendedErrorModel.java`
    ];
    await assertExpectedFiles(validatedFiles);
  });

  it('should generate schemas with nested arrays', async () => {
    await generate('mocks/nested-arrays.yaml');

    const validatedFiles = [
      'src/main/java/Application.java',
      'src/main/java/Dossier.java',
      'src/main/java/Debtor.java'
    ];
    await assertExpectedFiles(validatedFiles);
  });

  it('should generate code from the smarty lighting streetlights example', async () => {
    await generate('mocks/smarty-lighting-streetlights.yaml');

    const validatedFiles = [
      'src/main/java/Application.java',
      'src/main/java/DimLightPayload.java',
      'src/main/java/LightMeasuredPayload.java',
      'src/main/java/SentAt.java',
      'src/main/java/TurnOnOffPayload.java',
      'src/main/java/SubObject.java'
    ];
    await assertExpectedFiles(validatedFiles);
  });

  it('should generate code using schemas that have $id set', async () => {
    await generate('mocks/using-$id-field.yaml');

    const validatedFiles = [
      'src/main/java/Application.java',
      'src/main/java/DefaultMessageSchema.java'
    ];
    await assertExpectedFiles(validatedFiles);
  });

  it('should package and import schemas in another avro namespace', async () => {
    await generate('mocks/avro-schema-namespace.yaml');

    const validatedFiles = [
      'src/main/java/Application.java',
      'src/main/java/com/example/api/jobOrder/JobOrder.java',
      'src/main/java/com/example/api/jobAck/JobAcknowledge.java'
    ];
    await assertExpectedFiles(validatedFiles);
  });

  it('should return object when avro union type is used specifying many possible types', async () => {
    await generate('mocks/avro-union-object.yaml');

    const validatedFiles = [
      'src/main/java/com/example/api/jobOrder/JobOrder.java'
    ];
    await assertExpectedFiles(validatedFiles);
  });

  it('should place the topic variables in the correct order', async () => {
    // For a topic of test/{var1}/{var2}, the listed params in the asyncapi document can be in any order
    await generate('mocks/multivariable-topic.yaml');

    const validatedFiles = [
      'src/main/java/Application.java'
    ];
    await assertExpectedFiles(validatedFiles);
  });

  it('should not populate application yml with functions that are not beans', async () => {
    // If the function is a supplier or using a stream bridge, the function isn't a bean and shouldnt be in application.yml
    await generate('mocks/multivariable-topic.yaml');

    const validatedFiles = [
      'src/main/resources/application.yml'
    ];
    await assertExpectedFiles(validatedFiles);
  });
});

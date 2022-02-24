const path = require('path');
const Generator = require('@asyncapi/generator');
const { readFile } = require('fs').promises;
const crypto = require('crypto');

const MAIN_TEST_RESULT_PATH = path.join('test', 'temp', 'integrationTestResult');

describe('template integration tests using the generator', () => {
  jest.setTimeout(30000);

  const generateFolderName = () => {
    // you always want to generate to new directory to make sure test runs in clear environment
    return path.resolve(MAIN_TEST_RESULT_PATH, crypto.randomBytes(4).toString('hex'));
  };

  const assertExpectedFiles = async (outputDirectory, expectedFiles) => {
    for (const index in expectedFiles) {
      const file = await readFile(path.join(outputDirectory, expectedFiles[index]), 'utf8');
      expect(file).toMatchSnapshot();
    }
  };

  it('should generate application files using the solace binder', async () => {
    const OUTPUT_DIR = generateFolderName();
    const PACKAGE = 'com.acme';
    const PACKAGE_PATH = path.join(...PACKAGE.split('.'));
    const params = {
      binder: 'solace',
      javaPackage: PACKAGE,
      host: 'testVmrUri',
      username: 'user',
      password: 'test', //NOSONAR
      msgVpn: 'vpnName',
      artifactId: 'asyncApiFileName'
    };
    
    const generator = new Generator(path.normalize('./'), OUTPUT_DIR, { forceWrite: true, templateParams: params });
    await generator.generateFromFile(path.resolve('test', 'mocks/solace-test-app.yaml'));

    const expectedFiles = [
      'pom.xml',
      'README.md',
      `src/main/java/${PACKAGE_PATH}/Application.java`,
      `src/main/java/${PACKAGE_PATH}/MySchema.java`,
      'src/main/resources/application.yml'
    ];
    await assertExpectedFiles(OUTPUT_DIR, expectedFiles);
  });

  it('should generate a consumer and return a payload when using x-scs-function-name and dynamic topic binding', async () => {
    const OUTPUT_DIR = generateFolderName();
    
    const generator = new Generator(path.normalize('./'), OUTPUT_DIR, { forceWrite: true });
    await generator.generateFromFile(path.resolve('test', 'mocks/scs-function-name/dynamic-topic-same-function-name.yaml'));
  
    const expectedFiles = [
      'src/main/java/Application.java'
    ];
    await assertExpectedFiles(OUTPUT_DIR, expectedFiles);
  });

  it('should generate a function and return a payload when using x-scs-function-name and a static topic', async () => {
    const OUTPUT_DIR = generateFolderName();
    
    const generator = new Generator(path.normalize('./'), OUTPUT_DIR, { forceWrite: true });
    await generator.generateFromFile(path.resolve('test', 'mocks/scs-function-name/animals-same-function-name.yaml'));
  
    const expectedFiles = [
      'src/main/java/Application.java'
    ];
    await assertExpectedFiles(OUTPUT_DIR, expectedFiles);
  });

  it('should generate extra config when using the paramatersToHeaders parameter', async () => {
    const OUTPUT_DIR = generateFolderName();
    const PACKAGE = 'com.acme';
    const PACKAGE_PATH = path.join(...PACKAGE.split('.'));
    const params = {
      binder: 'solace',
      javaPackage: PACKAGE,
      host: 'testVmrUri',
      username: 'user',
      password: 'test', //NOSONAR
      msgVpn: 'vpnName',
      artifactId: 'asyncApiFileName',
      parametersToHeaders: true
    };
    
    const generator = new Generator(path.normalize('./'), OUTPUT_DIR, { forceWrite: true, templateParams: params });
    await generator.generateFromFile(path.resolve('test', 'mocks/solace-test-app.yaml'));

    const expectedFiles = [
      `src/main/java/${PACKAGE_PATH}/Application.java`,
      'src/main/resources/application.yml'
    ];
    await assertExpectedFiles(OUTPUT_DIR, expectedFiles);
  });

  it('should generate a comment for a consumer receiving multiple messages', async () => {
    const OUTPUT_DIR = generateFolderName();
    
    const generator = new Generator(path.normalize('./'), OUTPUT_DIR, { forceWrite: true });
    await generator.generateFromFile(path.resolve('test', 'mocks/animals.yaml'));

    const expectedFiles = [
      'src/main/java/Application.java'
    ];
    await assertExpectedFiles(OUTPUT_DIR, expectedFiles);
  });

  it('avro schemas should appear in a package based on their namespace, if any.', async () => {
    // Note that this file has 2 Avro schemas named User, but one has the namespace 'userpublisher.'
    const OUTPUT_DIR = generateFolderName();
    const PACKAGE = 'com.acme';
    const PACKAGE_PATH = path.join(...PACKAGE.split('.'));
    const AVRO_PACKAGE_PATH = 'userpublisher';
    const params = {
      binder: 'kafka',
      javaPackage: PACKAGE,
      artifactId: 'asyncApiFileName'
    };
    
    const generator = new Generator(path.normalize('./'), OUTPUT_DIR, { forceWrite: true, templateParams: params });
    await generator.generateFromFile(path.resolve('test', 'mocks/kafka-avro.yaml'));

    const expectedFiles = [
      `src/main/java/${PACKAGE_PATH}/User.java`,
      `src/main/java/${AVRO_PACKAGE_PATH}/User.java`,
    ];
    await assertExpectedFiles(OUTPUT_DIR, expectedFiles);
  });

  it('should generate a model subclass when it sees an allOf', async () => {
    const OUTPUT_DIR = generateFolderName();
    const PACKAGE = 'com.acme';
    const PACKAGE_PATH = path.join(...PACKAGE.split('.'));
    const params = {
      javaPackage: PACKAGE,
      artifactId: 'asyncApiFileName'
    };
    
    const generator = new Generator(path.normalize('./'), OUTPUT_DIR, { forceWrite: true, templateParams: params });
    await generator.generateFromFile(path.resolve('test', 'mocks/error-reporter.yaml'));

    const expectedFiles = [
      `src/main/java/${PACKAGE_PATH}/ExtendedErrorModel.java`
    ];
    await assertExpectedFiles(OUTPUT_DIR, expectedFiles);
  });

  it('should generate schemas with nested arrays', async () => {
    const OUTPUT_DIR = generateFolderName();
    
    const generator = new Generator(path.normalize('./'), OUTPUT_DIR, { forceWrite: true });
    await generator.generateFromFile(path.resolve('test', 'mocks/nested-arrays.yaml'));

    const expectedFiles = [
      'src/main/java/Application.java',
      'src/main/java/Dossier.java',
      'src/main/java/Debtor.java'
    ];
    await assertExpectedFiles(OUTPUT_DIR, expectedFiles);
  });

  it('should generate code from the smarty lighting streetlights example', async () => {
    const OUTPUT_DIR = generateFolderName();
    
    const generator = new Generator(path.normalize('./'), OUTPUT_DIR, { forceWrite: true });
    await generator.generateFromFile(path.resolve('test', 'mocks/smarty-lighting-streetlights.yaml'));

    const expectedFiles = [
      'src/main/java/Application.java',
      'src/main/java/DimLightPayload.java',
      'src/main/java/LightMeasuredPayload.java',
      'src/main/java/SentAt.java',
      'src/main/java/TurnOnOffPayload.java',
      'src/main/java/SubObject.java'
    ];
    await assertExpectedFiles(OUTPUT_DIR, expectedFiles);
  });

  it('should generate code using schemas that have $id set', async () => {
    const OUTPUT_DIR = generateFolderName();
    
    const generator = new Generator(path.normalize('./'), OUTPUT_DIR, { forceWrite: true });
    await generator.generateFromFile(path.resolve('test', 'mocks/using-$id-field.yaml'));

    const expectedFiles = [
      'src/main/java/Application.java',
      'src/main/java/DefaultMessageSchema.java'
    ];
    await assertExpectedFiles(OUTPUT_DIR, expectedFiles);
  });
});

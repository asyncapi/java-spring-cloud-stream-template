const path = require('path');
const Generator = require('@asyncapi/generator');
const { readFile } = require('fs').promises;
const crypto = require('crypto');

const MAIN_TEST_RESULT_PATH = 'test/temp/integrationTestResult';

describe('template integration tests using the generator', () => {
  const generateFolderName = () => {
    // you always want to generate to new directory to make sure test runs in clear environment
    return path.resolve(MAIN_TEST_RESULT_PATH, crypto.randomBytes(4).toString('hex'));
  };

  jest.setTimeout(30000);

  it('should generate application files using the solace binder', async () => {
    const OUTPUT_DIR = generateFolderName();
    const PACKAGE = 'com.acme';
    const PACKAGE_PATH = PACKAGE.replace('.', '/');
    const params = {
      binder: 'solace',
      javaPackage: PACKAGE,
      host: 'testVmrUri',
      username: 'user',
      password: 'test',
      msgVpn: 'vpnName',
      artifactId: 'asyncApiFileName'
    };
    
    const generator = new Generator('./', OUTPUT_DIR, { forceWrite: true, templateParams: params });
    await generator.generateFromFile(path.resolve('test', 'mocks/solace-test-app.yaml'));

    const expectedFiles = [
      'pom.xml',
      'README.md',
      `src/main/java/${PACKAGE_PATH}/Application.java`,
      `src/main/java/${PACKAGE_PATH}/MySchema.java`,
      'src/main/resources/application.yml'
    ];
    for (let index in expectedFiles) {
      const file = await readFile(path.join(OUTPUT_DIR, expectedFiles[index]), 'utf8');
      expect(file).toMatchSnapshot();
    }
  });
});
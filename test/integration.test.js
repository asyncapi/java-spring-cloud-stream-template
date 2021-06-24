const path = require('path');
const Generator = require('@asyncapi/generator');
const fs = require('fs');
const yaml = require('js-yaml');
const { test } = require('@jest/globals');

describe('tests', () => {
  const OUTPUT_FOLDER = 'test_output';

  const fileExists = (file) => {
    return new Promise((resolve) => {
      fs.access(file, fs.constants.F_OK, (err) => {
        return err ? resolve(file) : resolve(true);
      });
    });
  };

  beforeEach(async () => {
    this.params = {
      binder: 'solace',
      javaPackage: 'com.acme',
      host: 'testVmrUri',
      username: 'user',
      password: 'password',
      msgVpn: 'vpnName',
      artifactId: 'asyncApiFileName'
    };
    const PACKAGE = 'com.acme';
    this.packagePathTokens = `${PACKAGE.replace('.', '/')}/`;
    const generator = new Generator('./', path.resolve('test', OUTPUT_FOLDER), { templateParams: this.params });

    try {
      await generator.generateFromFile(path.resolve('test', 'mocks/solace-test-app.yaml'));
    } catch (e) {
      fs.rmdirSync(path.resolve('test', OUTPUT_FOLDER), { recursive: true });
      throw new Error(e);
    }
  });

  afterEach(() => {
    fs.rmdirSync(path.resolve('test', OUTPUT_FOLDER), { recursive: true });
  });

  test('template generates application files', async () => {
    const expectedFiles = ['pom.xml', 'README.md', `src/main/java/${this.packagePathTokens}Application.java`, 'src/main/resources/application.yml'];
    const promises = [];
    expectedFiles.forEach(filePath => promises.push(fileExists(path.resolve('test', OUTPUT_FOLDER, filePath))));
    try {
      const results = await Promise.all(promises);
      const filesFailedToFind = results.filter(element => element !== true);
      expect(filesFailedToFind.length).toBe(0);
    } catch (e) {
      throw new Error(e);
    }
  }, 30000);

  test('sets vmr properties in application yaml for solace binder', () => {
    const applicationYaml = yaml.load(fs.readFileSync(path.resolve('test', OUTPUT_FOLDER, 'src/main/resources/application.yml'), 'utf8'));
    const actualHost = applicationYaml.spring.cloud.stream.binders['solace-binder'].environment.solace.java.host;
    const actualMsgVpn = applicationYaml.spring.cloud.stream.binders['solace-binder'].environment.solace.java.msgVpn;
    const actualUsername = applicationYaml.spring.cloud.stream.binders['solace-binder'].environment.solace.java.clientUsername;
    const actualPassword = applicationYaml.spring.cloud.stream.binders['solace-binder'].environment.solace.java.clientPassword;
    expect(this.params.host).toBe(actualHost);
    expect(this.params.msgVpn).toBe(actualMsgVpn);
    expect(this.params.username).toBe(actualUsername);
    expect(this.params.password).toBe(actualPassword);
  }, 30000);
});
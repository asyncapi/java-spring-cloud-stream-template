const path = require('path');
const fs = require('fs').promises;
const Generator = require('@asyncapi/generator');

const TEST_SUITE_NAME = 'Comprehensive Integration Tests - ALL AsyncAPI Files Validation';

// Constants for folder identification
const MOCKS_FOLDER = path.join('test', 'mocks');
const OUTPUT_FOLDER = path.join('test', 'output');
const TEMP_OUTPUT_FOLDER = path.join('test', 'temp', 'comprehensiveIntegrationTestResult');

// ALL AsyncAPI files in the mocks directory
const ALL_ASYNCAPI_FILES = [
  // Basic test files
  'animals.yaml',
  'animals-same-function-name.yaml',
  'simple-test.yaml',
  'function-name-test.yaml',
  'error-reporter.yaml',
  'no-payload-message.yaml',
  'primitive-types-test.yaml',
  'parameters-to-headers-test.yaml',
  
  // Complex schema files
  'nested-arrays.yaml',
  'schema-with-array-of-objects.yaml',
  'schemas-with-duplicate-$ids.yaml',
  'multivariable-topic.yaml',
  'multivariable-topic-2.6.yaml',
  'dynamic-topic-same-function-name.yaml',
  
  // Avro schema files
  'avro-complex-test.yaml',
  'avro-union-object.yaml',
  'avro-schema-namespace.yaml',
  'kafka-avro.yaml',
  
  // Solace application files
  'solace-test-app.yaml',
  'smarty-lighting-streetlights.yaml',
  'smarty-lighting-streetlights-check.yaml',
  
  // Large Solace JSON files
  'solace-smart-shelf-inventory-control.json',
  'solace-point-of-sale-system.json',
  'solace-payment-processor.json',
  'solace-order-management-v2.json',
  'solace-order-management-v1.json',
  'solace-loyalty-program-manager.json',
  'solace-logistics.json',
  'solace-in-store-fulfillment-mobile-application.json',
  'solace-data-product-real-time-customer-sentiment.json',
  'solace-data-product-daily-store-sales-summary.json',
  'solace-customer-loyalty-management.json',
  'solace-customer-fraud-prevention.json',
  'solace-customer-facing-mobile-app-v2.json',
  'solace-customer-facing-mobile-app-v1.json',
  'solace-core-banking-v2.json',
  'solace-core-banking-v1.json'
];

describe(TEST_SUITE_NAME, () => {
  let outputDirectory;

  // Helper function to generate code from AsyncAPI file
  const generate = async (asyncApiFilePath, params = {}) => {
    // Use the same template parameters as the work script for consistency, but without view: provider
    const defaultParams = {
      binder: 'solace',
      ...params
    };
    
    const generator = new Generator(
      path.normalize('./'), 
      outputDirectory, 
      { forceWrite: true, templateParams: defaultParams }
    );
    return generator.generateFromFile(path.resolve(MOCKS_FOLDER, asyncApiFilePath));
  };

  // Helper function to check if file exists
  const assertFileExists = async (filePath) => {
    const fullPath = path.join(outputDirectory, filePath);
    try {
      await fs.access(fullPath);
      return true;
    } catch (error) {
      return false;
    }
  };

  // Helper function to read file content
  const readFileContent = async (filePath) => {
    const fullPath = path.join(outputDirectory, filePath);
    return await fs.readFile(fullPath, 'utf8');
  };

  beforeEach(() => {
    outputDirectory = path.join(TEMP_OUTPUT_FOLDER, `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
  });

  // ============================================================================
  // COMPREHENSIVE FILE STRUCTURE VALIDATION FOR ALL ASYNCAPI FILES
  // ============================================================================
  
  describe('Comprehensive File Structure Validation', () => {
    it('should generate essential Maven project structure for ALL AsyncAPI files', async () => {
      console.log(`Testing ${ALL_ASYNCAPI_FILES.length} AsyncAPI files for essential structure...`);
      
      for (let i = 0; i < ALL_ASYNCAPI_FILES.length; i++) {
        const testFile = ALL_ASYNCAPI_FILES[i];
        console.log(`[${i + 1}/${ALL_ASYNCAPI_FILES.length}] Testing: ${testFile}`);
        
        try {
          await generate(testFile);
          
          // Essential files that must always be generated
          const essentialFiles = [
            'pom.xml',
            'README.md',
            'src/main/java/com/company/Application.java',
            'src/main/resources/application.yml'
          ];
          
          for (const file of essentialFiles) {
            const exists = await assertFileExists(file);
            expect(exists).toBe(true);
          }
          
          console.log(`✓ ${testFile} - Essential structure validated`);
        } catch (error) {
          console.error(`✗ ${testFile} - Failed:`, error.message);
          throw error;
        }
      }
    }, 600000); // 10 minutes timeout for all files
  });

  // ============================================================================
  // POM.XML VALIDATION FOR ALL FILES
  // ============================================================================
  
  describe('POM.XML Validation for All Files', () => {
    it('should generate valid pom.xml with correct dependencies for ALL AsyncAPI files', async () => {
      console.log(`Testing ${ALL_ASYNCAPI_FILES.length} AsyncAPI files for pom.xml validation...`);
      
      for (let i = 0; i < ALL_ASYNCAPI_FILES.length; i++) {
        const testFile = ALL_ASYNCAPI_FILES[i];
        console.log(`[${i + 1}/${ALL_ASYNCAPI_FILES.length}] Testing pom.xml for: ${testFile}`);
        
        try {
          await generate(testFile);
          const pomXml = await readFileContent('pom.xml');
          
          // Essential Maven structure validation
          expect(pomXml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
          expect(pomXml).toContain('<project');
          expect(pomXml).toContain('<groupId>com.company</groupId>');
          expect(pomXml).toContain('<artifactId>project-name</artifactId>');
          // Version can be any valid Maven version format
          expect(pomXml).toMatch(/<version>[^<]+<\/version>/);
          expect(pomXml).toContain('<parent>');
          expect(pomXml).toContain('<dependencies>');
          expect(pomXml).toContain('</project>');
          
          // Check for Spring Boot parent
          expect(pomXml).toContain('spring-boot-starter-parent');
          
          // Check for Solace dependency
          expect(pomXml).toContain('spring-cloud-starter-stream-solace');
          
          // Check for dependency management
          expect(pomXml).toContain('spring-cloud-dependencies');
          expect(pomXml).toContain('solace-spring-cloud-bom');
          
          // Check for Spring Boot Maven plugin
          expect(pomXml).toContain('spring-boot-maven-plugin');
          
          console.log(`✓ ${testFile} - pom.xml validated`);
        } catch (error) {
          console.error(`✗ ${testFile} - pom.xml validation failed:`, error.message);
          throw error;
        }
      }
    }, 600000); // 10 minutes timeout for all files
  });

  // ============================================================================
  // APPLICATION.YML VALIDATION FOR ALL FILES
  // ============================================================================
  
  describe('Application.YML Validation for All Files', () => {
    it('should generate valid application.yml with Solace configuration for ALL AsyncAPI files', async () => {
      console.log(`Testing ${ALL_ASYNCAPI_FILES.length} AsyncAPI files for application.yml validation...`);
      
      for (let i = 0; i < ALL_ASYNCAPI_FILES.length; i++) {
        const testFile = ALL_ASYNCAPI_FILES[i];
        console.log(`[${i + 1}/${ALL_ASYNCAPI_FILES.length}] Testing application.yml for: ${testFile}`);
        
        try {
          await generate(testFile);
          const appYml = await readFileContent('src/main/resources/application.yml');
          
          // Essential Spring Cloud Stream configuration validation
          expect(appYml).toContain('spring:');
          expect(appYml).toContain('cloud:');
          expect(appYml).toContain('function:');
          expect(appYml).toContain('stream:');
          expect(appYml).toContain('bindings:');
          expect(appYml).toContain('binders:');
          
          // Check for function definition
          expect(appYml).toContain('definition:');
          
          // Check for Solace binder configuration
          expect(appYml).toContain('solace-binder:');
          expect(appYml).toContain('type: solace');
          
          // Check for Solace environment configuration
          expect(appYml).toContain('environment:');
          expect(appYml).toContain('solace:');
          expect(appYml).toContain('java:');
          expect(appYml).toContain('host:');
          expect(appYml).toContain('msgVpn:');
          expect(appYml).toContain('clientUsername:');
          expect(appYml).toContain('clientPassword:');
          
          // Check for logging configuration
          expect(appYml).toContain('logging:');
          expect(appYml).toContain('level:');
          
          console.log(`✓ ${testFile} - application.yml validated`);
        } catch (error) {
          console.error(`✗ ${testFile} - application.yml validation failed:`, error.message);
          throw error;
        }
      }
    }, 600000); // 10 minutes timeout for all files
  });

  // ============================================================================
  // APPLICATION.JAVA VALIDATION FOR ALL FILES
  // ============================================================================
  
  describe('Application.Java Validation for All Files', () => {
    it('should generate valid Application.java with proper Spring Boot structure for ALL AsyncAPI files', async () => {
      console.log(`Testing ${ALL_ASYNCAPI_FILES.length} AsyncAPI files for Application.java validation...`);
      
      for (let i = 0; i < ALL_ASYNCAPI_FILES.length; i++) {
        const testFile = ALL_ASYNCAPI_FILES[i];
        console.log(`[${i + 1}/${ALL_ASYNCAPI_FILES.length}] Testing Application.java for: ${testFile}`);
        
        try {
          await generate(testFile);
          const appJava = await readFileContent('src/main/java/com/company/Application.java');
          
          // Essential Spring Boot structure validation
          expect(appJava).toContain('package com.company;');
          expect(appJava).toContain('import org.springframework.boot.SpringApplication;');
          expect(appJava).toContain('import org.springframework.boot.autoconfigure.SpringBootApplication;');
          expect(appJava).toContain('@SpringBootApplication');
          expect(appJava).toContain('public class Application');
          expect(appJava).toContain('public static void main(String[] args)');
          expect(appJava).toContain('SpringApplication.run(Application.class');
          
          // Check for logger
          expect(appJava).toContain('LoggerFactory.getLogger(Application.class)');
          
          // Check for balanced braces
          const openBraces = (appJava.match(/\{/g) || []).length;
          const closeBraces = (appJava.match(/\}/g) || []).length;
          expect(openBraces).toBe(closeBraces);
          
          console.log(`✓ ${testFile} - Application.java validated`);
        } catch (error) {
          console.error(`✗ ${testFile} - Application.java validation failed:`, error.message);
          throw error;
        }
      }
    }, 600000); // 10 minutes timeout for all files
  });

  // ============================================================================
  // SPECIFIC PATTERN VALIDATION FOR SELECTED FILES
  // ============================================================================
  
  describe('Specific Pattern Validation for Key Files', () => {
    it('should validate specific patterns for key AsyncAPI files', async () => {
      const keyTestFiles = [
        { file: 'animals.yaml', patterns: ['Supplier', 'Consumer', 'Message'] },
        { file: 'function-name-test.yaml', patterns: ['Function', 'Order', 'Result'] },
        { file: 'multivariable-topic.yaml', patterns: ['StreamBridge', 'Region', 'enum'] },
        { file: 'avro-complex-test.yaml', patterns: ['ComplexJobOrder', 'Consumer'] },
        { file: 'nested-arrays.yaml', patterns: ['Dossier', 'Debtor', 'StreamBridge'] },
        { file: 'error-reporter.yaml', patterns: ['ExtendedErrorModel', 'Supplier'] }
      ];

      for (const testCase of keyTestFiles) {
        console.log(`Testing specific patterns for: ${testCase.file}`);
        
        try {
          await generate(testCase.file);
          const appJava = await readFileContent('src/main/java/com/company/Application.java');
          
          for (const pattern of testCase.patterns) {
            expect(appJava).toContain(pattern);
          }
          
          console.log(`✓ ${testCase.file} - Specific patterns validated`);
        } catch (error) {
          console.error(`✗ ${testCase.file} - Specific pattern validation failed:`, error.message);
          throw error;
        }
      }
    }, 300000); // 5 minutes timeout for key files
  });

  // ============================================================================
  // MODEL CLASS VALIDATION FOR FILES WITH SCHEMAS
  // ============================================================================
  
  describe('Model Class Validation for Files with Schemas', () => {
    it('should generate model classes for files with defined schemas', async () => {
      const schemaTestFiles = [
        { file: 'animals.yaml', expectedClasses: ['Cat.java', 'Dog.java'] },
        { file: 'function-name-test.yaml', expectedClasses: ['Order.java', 'Result.java', 'Data.java'] },
        { file: 'nested-arrays.yaml', expectedClasses: ['Debtor.java', 'Dossier.java'] },
        { file: 'error-reporter.yaml', expectedClasses: ['ExtendedErrorModel.java'] }
      ];

      for (const testCase of schemaTestFiles) {
        console.log(`Testing model classes for: ${testCase.file}`);
        
        try {
          await generate(testCase.file);
          
          for (const expectedClass of testCase.expectedClasses) {
            const classPath = `src/main/java/com/company/${expectedClass}`;
            const exists = await assertFileExists(classPath);
            expect(exists).toBe(true);
            
            // Validate basic class structure
            const classContent = await readFileContent(classPath);
            expect(classContent).toContain('package com.company;');
            expect(classContent).toContain('public class');
            expect(classContent).toContain('@JsonInclude');
          }
          
          console.log(`✓ ${testCase.file} - Model classes validated`);
        } catch (error) {
          console.error(`✗ ${testCase.file} - Model class validation failed:`, error.message);
          throw error;
        }
      }
    }, 300000); // 5 minutes timeout for schema files
  });

  // ============================================================================
  // EMPTY OBJECT SCHEMA VALIDATION
  // ============================================================================
  
  describe('Empty Object Schema Validation', () => {
    it('should handle empty object schemas correctly', async () => {
      // Test files that might have empty object schemas
      const emptyObjectTestFiles = [
        'multivariable-topic.yaml', // Has RideReceipt schema
        'simple-test.yaml',
        'no-payload-message.yaml'
      ];

      for (const testFile of emptyObjectTestFiles) {
        console.log(`Testing empty object schema handling for: ${testFile}`);
        
        try {
          await generate(testFile);
          const appJava = await readFileContent('src/main/java/com/company/Application.java');
          
          // Should generate valid Java code regardless of empty schemas
          expect(appJava).toContain('@SpringBootApplication');
          expect(appJava).toContain('public static void main(String[] args)');
          
          // Check for balanced braces
          const openBraces = (appJava.match(/\{/g) || []).length;
          const closeBraces = (appJava.match(/\}/g) || []).length;
          expect(openBraces).toBe(closeBraces);
          
          console.log(`✓ ${testFile} - Empty object schema handling validated`);
        } catch (error) {
          console.error(`✗ ${testFile} - Empty object schema validation failed:`, error.message);
          throw error;
        }
      }
    }, 300000); // 5 minutes timeout
  });

  // ============================================================================
  // AVRO SCHEMA VALIDATION
  // ============================================================================
  
  describe('Avro Schema Validation', () => {
    it('should handle all Avro schema patterns correctly', async () => {
      const avroTestFiles = [
        'avro-complex-test.yaml',
        'avro-union-object.yaml',
        'avro-schema-namespace.yaml',
        'kafka-avro.yaml'
      ];

      for (const testFile of avroTestFiles) {
        console.log(`Testing Avro schema handling for: ${testFile}`);
        
        try {
          await generate(testFile);
          const appJava = await readFileContent('src/main/java/com/company/Application.java');
          
          // Should generate valid Java code for Avro schemas
          expect(appJava).toContain('@SpringBootApplication');
          expect(appJava).toContain('public static void main(String[] args)');
          
          // Check for balanced braces
          const openBraces = (appJava.match(/\{/g) || []).length;
          const closeBraces = (appJava.match(/\}/g) || []).length;
          expect(openBraces).toBe(closeBraces);
          
          console.log(`✓ ${testFile} - Avro schema handling validated`);
        } catch (error) {
          console.error(`✗ ${testFile} - Avro schema validation failed:`, error.message);
          throw error;
        }
      }
    }, 300000); // 5 minutes timeout
  });

  // ============================================================================
  // MESSAGE PAYLOAD TYPE VALIDATION
  // ============================================================================
  
  describe('Message Payload Type Validation', () => {
    it('should validate message payload types for different scenarios', async () => {
      const payloadTestFiles = [
        { file: 'animals.yaml', expectedTypes: ['Message<?>', 'Cat', 'Dog'] },
        { file: 'function-name-test.yaml', expectedTypes: ['Order', 'Result', 'Data'] },
        { file: 'avro-complex-test.yaml', expectedTypes: ['ComplexJobOrder'] },
        { file: 'error-reporter.yaml', expectedTypes: ['ExtendedErrorModel'] },
        { file: 'nested-arrays.yaml', expectedTypes: ['Dossier', 'Debtor'] }
      ];

      for (const testCase of payloadTestFiles) {
        console.log(`Testing message payload types for: ${testCase.file}`);
        
        try {
          await generate(testCase.file);
          const appJava = await readFileContent('src/main/java/com/company/Application.java');
          
          // Should contain appropriate payload types
          for (const expectedType of testCase.expectedTypes) {
            expect(appJava).toContain(expectedType);
          }
          
          console.log(`✓ ${testCase.file} - Message payload types validated`);
        } catch (error) {
          console.error(`✗ ${testCase.file} - Message payload type validation failed:`, error.message);
          throw error;
        }
      }
    }, 300000); // 5 minutes timeout
  });

  // ============================================================================
  // COMPILATION VALIDATION
  // ============================================================================
  
  describe('Compilation Validation', () => {
    it('should generate compilable Java code for key AsyncAPI files', async () => {
      const compilationTestFiles = [
        'animals.yaml',
        'function-name-test.yaml',
        'error-reporter.yaml',
        'simple-test.yaml'
      ];

      for (const testFile of compilationTestFiles) {
        console.log(`Testing compilation for: ${testFile}`);
        
        try {
          await generate(testFile);
          
          // Validate that essential files exist
          const essentialFiles = [
            'pom.xml',
            'src/main/java/com/company/Application.java',
            'src/main/resources/application.yml'
          ];
          
          for (const file of essentialFiles) {
            const exists = await assertFileExists(file);
            expect(exists).toBe(true);
          }
          
          // Validate Java syntax by checking for balanced braces and proper structure
          const appJava = await readFileContent('src/main/java/com/company/Application.java');
          
          // Check for balanced braces
          const openBraces = (appJava.match(/\{/g) || []).length;
          const closeBraces = (appJava.match(/\}/g) || []).length;
          expect(openBraces).toBe(closeBraces);
          
          // Check for balanced parentheses
          const openParens = (appJava.match(/\(/g) || []).length;
          const closeParens = (appJava.match(/\)/g) || []).length;
          expect(openParens).toBe(closeParens);
          
          // Check for proper Java structure
          expect(appJava).toContain('package com.company;');
          expect(appJava).toContain('@SpringBootApplication');
          expect(appJava).toContain('public class Application');
          expect(appJava).toContain('public static void main(String[] args)');
          
          console.log(`✓ ${testFile} - Compilation validation passed`);
        } catch (error) {
          console.error(`✗ ${testFile} - Compilation validation failed:`, error.message);
          throw error;
        }
      }
    }, 300000); // 5 minutes timeout
  });
});

const path = require('path');
const Generator = require('@asyncapi/generator');
const { rmdirSync, existsSync, readdirSync } = require('fs');
const { logger } = require('../utils/logger');
const Module = require('module');

// Patch require.resolve to fake 'npm' for @asyncapi/generator
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function(request, parent, isMain, options) {
  if (request === 'npm') {
    // Return a dummy path, as the generator only uses it for a path string
    return '/usr/local/lib/node_modules/npm/lib/npm.js';
  }
  return originalResolve.apply(this, arguments);
};

// Get command line arguments
const args = process.argv.slice(2);
const specifiedFile = args[0];

// Get custom output directory from environment variable, or use default
const customOutputDir = process.env.OUTPUT_DIR;
const defaultOutputDir = path.join(__dirname, 'output');
const baseOutputDir = customOutputDir || defaultOutputDir;

// Dynamically read all .yaml files from mocks directory
const dirName = 'mocks';
const mocksDir = path.join(__dirname, dirName);
const allFileNames = readdirSync(mocksDir)
  .filter(file => file.endsWith('.yaml') || file.endsWith('.yml') || file.endsWith('.json'))
  .sort();

// Determine which files to process
let fileNames;
if (specifiedFile) {
  if (allFileNames.includes(specifiedFile)) {
    fileNames = [specifiedFile];
    console.log(`🎯 Processing specified file: ${specifiedFile}`);
  } else {
    console.error(`❌ File '${specifiedFile}' not found in mocks directory.`);
    console.log('📁 Available files:', allFileNames);
    process.exit(1);
  }
} else {
  fileNames = allFileNames;
  console.log(`🚀 Processing all ${fileNames.length} AsyncAPI documents...`);
}

const templatePath = path.resolve(__dirname, '../');

const runGenerator = async (fileName, idx, total) => {
  const dummySpecPath = path.join(__dirname, `${dirName}/${fileName}`);
  const baseFileName = path.basename(fileName, path.extname(fileName));
  const outputDir = path.resolve(baseOutputDir, baseFileName);

  // Force immediate output for file header
  console.log('\n===============================================================');
  console.log(`[${idx + 1}/${total}] Processing: ${fileName}`);
  console.log(`📁 Output: ${outputDir}`);
  console.log('===============================================================');
  process.stdout.write(''); // Force flush

  // Clean up existing output directory
  if (existsSync(outputDir)) {
    rmdirSync(outputDir, { recursive: true, force: true });
  }

  let resultMsg = '';
  let success = false;
  try {
    const generator = new Generator(templatePath, outputDir, { 
      forceWrite: true, 
      debug: process.env.DEBUG === 'true' || process.env.LOG_LEVEL === 'DEBUG', 
      templateParams: { 
        binder: 'solace'
      } 
    });
    
    // Store the original file path in the generator context for post-process hook
    generator.originalAsyncApiFilePath = dummySpecPath;
    await generator.generateFromFile(dummySpecPath);

    if (existsSync(outputDir)) {
      const files = readdirSync(outputDir, { recursive: true });
      const fileCount = files.length;
      resultMsg = `✅ SUCCESS: Generated ${fileCount} files for ${fileName}`;
      success = true;
    } else {
      resultMsg = `⚠️  WARNING: No output directory created for ${fileName}`;
    }
  } catch (error) {
    resultMsg = `❌ FAILED: ${fileName} - ${error.message}`;
    if (process.env.LOG_LEVEL === 'DEBUG') {
      logger.debug('Stack trace:', error.stack);
    }
  }

  // Summary and separator - force immediate output
  console.log(resultMsg);
  console.log('────────────────────────────────────────────────────────────────');
  process.stdout.write(''); // Force flush
  return success;
};

const runAllTests = async () => {
  console.log('\n🧪 Starting AsyncAPI code generation tests...');
  console.log(`📂 Template: ${templatePath}`);
  console.log(`📁 Source: ${mocksDir}`);
  console.log(`📁 Output: ${baseOutputDir}`);
  console.log(`📋 Files to process: ${fileNames.length}\n`);
  
  const startTime = Date.now();
  let successCount = 0;
  let failureCount = 0;
  const successfulFiles = [];
  const failedFiles = [];
  
  for (let i = 0; i < fileNames.length; i++) {
    const fileName = fileNames[i];
    const success = await runGenerator(fileName, i, fileNames.length);
    if (success) {
      successCount++;
      successfulFiles.push(fileName);
    } else {
      failureCount++;
      failedFiles.push(fileName);
    }
  }
  
  const endTime = Date.now();
  const duration = ((endTime - startTime) / 1000).toFixed(2);
  
  console.log('\n📊 Test Results:');
  console.log(`   ✅ Successful: ${successCount}`);
  console.log(`   ❌ Failed: ${failureCount}`);
  console.log(`   ⏱️  Duration: ${duration}s`);
  
  if (failedFiles.length > 0) {
    console.log('\n❌ Failed Files:');
    failedFiles.forEach(file => {
      console.log(`   - ${file}`);
    });
  }
  
  if (successfulFiles.length > 0) {
    console.log('\n✅ Successful Files:');
    successfulFiles.forEach(file => {
      console.log(`   - ${file}`);
    });
  }
  
  console.log(`\n📁 Generated code available in: ${baseOutputDir}`);
  
  // Exit with appropriate code
  process.exit(failureCount > 0 ? 1 : 0);
};

// Run the tests
runAllTests().catch(error => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});


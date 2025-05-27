#!/usr/bin/env node

/**
 * Test script for simulating Claude Desktop communication with the MCP server
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Initialize MCP message
const initMessage = {
  method: 'initialize',
  params: {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: {
      name: 'test-client',
      version: '1.0.0'
    }
  },
  jsonrpc: '2.0',
  id: 0
};

// Function to test STDIO communication
async function testStdioMode() {
  console.log('Testing STDIO mode communication...');
  
  // Create a temp file to capture output for debugging
  const debugOutputFile = path.join(__dirname, 'stdio-debug.log');
  const debugOutput = fs.createWriteStream(debugOutputFile, { flags: 'w' });
  
  // Start the server in STDIO mode with custom handling
  const serverProcess = spawn('node', [
    path.join(__dirname, 'dist', 'index.js')
  ], {
    stdio: ['pipe', 'pipe', process.stderr],
    env: { ...process.env, CUSTOM_STDIO: 'true' }
  });
  
  // Set up data handling with improved debugging
  serverProcess.stdout.on('data', (data) => {
    const output = data.toString();
    
    // Log the raw output to the debug file
    debugOutput.write(`[STDOUT] ${output}\n`);
    
    console.log(`Raw output (${output.length} chars): "${output.trim()}"`); 
    
    // Try to find a complete JSON object in the output
    try {
      // First, try to parse the entire output
      const parsed = JSON.parse(output.trim());
      console.log('Successfully parsed complete response:');
      console.log(JSON.stringify(parsed, null, 2));
      
      // If this is a response to our initialize message, consider the test passed
      if (parsed.jsonrpc === '2.0' && parsed.id === 0) {
        console.log('Test PASSED: Received valid response to initialize message');
        serverProcess.kill();
        process.exit(0);
      }
    } catch (e) {
      console.log(`Could not parse complete output: ${e.message}`);
      
      // Try to extract a JSON object using a more robust regex
      try {
        // Look for a complete JSON object with proper closing
        const jsonRegex = /(\{[\s\S]*?\})\n/;
        const match = output.match(jsonRegex);
        
        if (match && match[1]) {
          const jsonStr = match[1];
          console.log(`Extracted JSON: ${jsonStr}`);
          
          const parsed = JSON.parse(jsonStr);
          console.log('Successfully parsed extracted JSON:');
          console.log(JSON.stringify(parsed, null, 2));
          
          // If this is a response to our initialize message, consider the test passed
          if (parsed.jsonrpc === '2.0' && parsed.id === 0) {
            console.log('Test PASSED: Received valid response to initialize message');
            serverProcess.kill();
            process.exit(0);
          }
        } else {
          console.log('No complete JSON object found in output');
        }
      } catch (extractError) {
        console.log(`Error extracting/parsing JSON: ${extractError.message}`);
      }
    }
  });
  
  // Log any errors
  serverProcess.on('error', (error) => {
    console.error('Server process error:', error);
    debugOutput.write(`[ERROR] ${error.toString()}\n`);
    process.exit(1);
  });
  
  // Wait a moment for the server to start
  setTimeout(() => {
    console.log('\nSending initialize message...');
    serverProcess.stdin.write(JSON.stringify(initMessage) + '\n');
    
    // Debug
    debugOutput.write(`[SENT] ${JSON.stringify(initMessage)}\n`);
  }, 2000);
  
  // Set a timeout
  setTimeout(() => {
    console.error('\nTest timed out - no valid response received');
    debugOutput.write('[TIMEOUT] Test timed out\n');
    console.log(`Debug log saved to: ${debugOutputFile}`);
    serverProcess.kill();
    process.exit(1);
  }, 15000);
}

// Run the test
testStdioMode();
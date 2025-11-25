// Test script for AI demo chatbot
import axios from 'axios';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config({ path: './.env' });

// Create a test JWT token (in a real app, this would come from login)
const testUser = { userId: 'testuser' };
const token = jwt.sign(testUser, process.env.JWT_SECRET);

// Test cases
const testCases = [
  "Show me files in the root directory",
  "Create a new folder called 'documents'",
  "How many files are in the photos folder?",
  "List all image files",
  "Move report.pdf to the archive folder"
];

async function testAiDemo() {
  console.log('Testing AI Demo Chatbot...\n');
  
  for (const message of testCases) {
    try {
      console.log(`Sending: "${message}"`);
      
      const response = await axios.post('http://localhost:4002/ai-demo/demo-chat', 
        { message },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      console.log('Response:', response.data.response);
      if (response.data.files) {
        console.log('Files:', response.data.files);
      }
      console.log('---');
    } catch (error) {
      console.error('Error:', error.response?.data || error.message);
      console.log('---');
    }
  }
}

// Run the test
testAiDemo();
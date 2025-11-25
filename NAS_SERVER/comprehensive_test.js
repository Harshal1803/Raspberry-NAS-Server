import axios from "axios";
import fs from "fs";
import path from "path";

// Configuration
const BASE_URL = "http://localhost:4002";
const TEST_TOKEN = "your-jwt-token-here"; // Replace with a valid token

// Test cases for the AI chatbot
async function runComprehensiveTest() {
  console.log("Starting comprehensive test of AI chatbot functionality...\n");
  
  try {
    // Test 1: Basic file listing
    console.log("Test 1: Basic file listing");
    const listResponse = await axios.post(`${BASE_URL}/ai/chat`, {
      message: "Show me files in the root directory"
    }, {
      headers: {
        "Authorization": `Bearer ${TEST_TOKEN}`
      }
    });
    console.log("Response:", listResponse.data);
    console.log("---\n");
    
    // Test 2: Create folder
    console.log("Test 2: Create folder");
    const createFolderResponse = await axios.post(`${BASE_URL}/ai/chat`, {
      message: "Create a new folder called 'ai_test_folder'"
    }, {
      headers: {
        "Authorization": `Bearer ${TEST_TOKEN}`
      }
    });
    console.log("Response:", createFolderResponse.data);
    console.log("---\n");
    
    // Test 3: Count files
    console.log("Test 3: Count files");
    const countResponse = await axios.post(`${BASE_URL}/ai/chat`, {
      message: "How many files are in the root directory?"
    }, {
      headers: {
        "Authorization": `Bearer ${TEST_TOKEN}`
      }
    });
    console.log("Response:", countResponse.data);
    console.log("---\n");
    
    // Test 4: List by type
    console.log("Test 4: List by file type");
    const listByTypeResponse = await axios.post(`${BASE_URL}/ai/chat`, {
      message: "Show me all image files"
    }, {
      headers: {
        "Authorization": `Bearer ${TEST_TOKEN}`
      }
    });
    console.log("Response:", listByTypeResponse.data);
    console.log("---\n");
    
    // Test 5: Search files
    console.log("Test 5: Search files");
    const searchResponse = await axios.post(`${BASE_URL}/ai/chat`, {
      message: "Find files containing 'test'"
    }, {
      headers: {
        "Authorization": `Bearer ${TEST_TOKEN}`
      }
    });
    console.log("Response:", searchResponse.data);
    console.log("---\n");
    
    // Test 6: Move file (simulated)
    console.log("Test 6: Move file");
    const moveResponse = await axios.post(`${BASE_URL}/ai/chat`, {
      message: "Move document.pdf to the backup folder"
    }, {
      headers: {
        "Authorization": `Bearer ${TEST_TOKEN}`
      }
    });
    console.log("Response:", moveResponse.data);
    console.log("---\n");
    
    // Test 7: Delete operation (should ask for confirmation)
    console.log("Test 7: Delete operation (confirmation required)");
    const deleteResponse = await axios.post(`${BASE_URL}/ai/chat`, {
      message: "Delete the old_files folder"
    }, {
      headers: {
        "Authorization": `Bearer ${TEST_TOKEN}`
      }
    });
    console.log("Response:", deleteResponse.data);
    console.log("---\n");
    
    // Test 8: Natural language understanding
    console.log("Test 8: Natural language understanding");
    const naturalLangResponse = await axios.post(`${BASE_URL}/ai/chat`, {
      message: "What's in the documents folder?"
    }, {
      headers: {
        "Authorization": `Bearer ${TEST_TOKEN}`
      }
    });
    console.log("Response:", naturalLangResponse.data);
    console.log("---\n");
    
    // Test 9: File count by date range
    console.log("Test 9: List files by date range");
    const dateRangeResponse = await axios.post(`${BASE_URL}/ai/chat`, {
      message: "Show me files from January 2025"
    }, {
      headers: {
        "Authorization": `Bearer ${TEST_TOKEN}`
      }
    });
    console.log("Response:", dateRangeResponse.data);
    console.log("---\n");
    
    console.log("All tests completed successfully!");
    
  } catch (error) {
    console.error("Test failed:", error.response?.data || error.message);
  }
}

// Run the comprehensive test
runComprehensiveTest();
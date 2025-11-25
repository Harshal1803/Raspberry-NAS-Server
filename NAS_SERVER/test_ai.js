import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

// Test the AI chatbot functionality
async function testAIChatbot() {
  try {
    console.log("Testing AI Chatbot functionality...\n");
    
    // Test 1: List files
    console.log("Test 1: List files in root directory");
    const response1 = await axios.post("http://localhost:4002/ai/chat", {
      message: "Show me files in the root directory"
    }, {
      headers: {
        "Authorization": "Bearer your-test-token-here"
      }
    });
    console.log("Response:", response1.data);
    console.log("---\n");
    
    // Test 2: Create folder
    console.log("Test 2: Create a new folder");
    const response2 = await axios.post("http://localhost:4002/ai/chat", {
      message: "Create a new folder called 'test_folder'"
    }, {
      headers: {
        "Authorization": "Bearer your-test-token-here"
      }
    });
    console.log("Response:", response2.data);
    console.log("---\n");
    
    // Test 3: Count files
    console.log("Test 3: Count files in a directory");
    const response3 = await axios.post("http://localhost:4002/ai/chat", {
      message: "How many files are in the documents folder?"
    }, {
      headers: {
        "Authorization": "Bearer your-test-token-here"
      }
    });
    console.log("Response:", response3.data);
    console.log("---\n");
    
    // Test 4: Delete confirmation
    console.log("Test 4: Delete operation (should ask for confirmation)");
    const response4 = await axios.post("http://localhost:4002/ai/chat", {
      message: "Delete the old_backup folder"
    }, {
      headers: {
        "Authorization": "Bearer your-test-token-here"
      }
    });
    console.log("Response:", response4.data);
    console.log("---\n");
    
    // Test 5: Delete with confirmation
    console.log("Test 5: Delete operation with confirmation");
    const response5 = await axios.post("http://localhost:4002/ai/chat", {
      message: "yes",
      confirmDelete: true
    }, {
      headers: {
        "Authorization": "Bearer your-test-token-here"
      }
    });
    console.log("Response:", response5.data);
    console.log("---\n");
    
    console.log("All tests completed!");
  } catch (error) {
    console.error("Test failed:", error.response?.data || error.message);
  }
}

// Run the tests
testAIChatbot();
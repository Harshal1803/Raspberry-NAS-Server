import axios from "axios";

// Configuration
const BASE_URL = "http://localhost:4002";

async function setupTestUser() {
  try {
    console.log("Setting up test user...");
    
    // Register a test user
    console.log("Registering test user...");
    const registerResponse = await axios.post(`${BASE_URL}/auth/register`, {
      username: "testuser",
      password: "testpassword123"
    });
    console.log("Registration response:", registerResponse.data);
    
    // Login to get a token
    console.log("Logging in to get token...");
    const loginResponse = await axios.post(`${BASE_URL}/auth/login`, {
      username: "testuser",
      password: "testpassword123"
    });
    console.log("Login response:", loginResponse.data);
    
    console.log("\nTest user setup complete!");
    console.log("Use this token for testing:", loginResponse.data.token);
    
    return loginResponse.data.token;
  } catch (error) {
    console.error("Error setting up test user:", error.response?.data || error.message);
  }
}

// Run the setup
setupTestUser();
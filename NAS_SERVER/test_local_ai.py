#!/usr/bin/env python3
"""
Test script for the local AI service
"""
import requests
import time
import sys

def test_ai_service():
    """Test the local AI service"""
    print("Testing Local AI Service...")

    # Test 1: Health check
    try:
        response = requests.get("http://localhost:5001/health", timeout=5)
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Health check passed: {data}")
        else:
            print(f"❌ Health check failed: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Health check error: {e}")
        return False

    # Test 2: Chat endpoint
    test_messages = [
        "hello",
        "show me files",
        "create a folder called test",
        "how many files are in documents"
    ]

    for message in test_messages:
        try:
            print(f"\nTesting message: '{message}'")
            response = requests.post(
                "http://localhost:5001/chat",
                json={"message": message},
                timeout=30
            )

            if response.status_code == 200:
                data = response.json()
                print(f"✅ Response: {data}")
            else:
                print(f"❌ Chat test failed: {response.status_code}")
                return False

        except Exception as e:
            print(f"❌ Chat test error: {e}")
            return False

        time.sleep(1)  # Brief pause between tests

    print("\n🎉 All tests passed! Local AI service is working correctly.")
    return True

if __name__ == "__main__":
    success = test_ai_service()
    sys.exit(0 if success else 1)
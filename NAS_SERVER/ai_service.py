from flask import Flask, request, jsonify
from transformers import AutoTokenizer, AutoModelForSeq2SeqLM
import torch
import os
import logging
import re

app = Flask(__name__)
logging.basicConfig(level=logging.INFO)

class LocalAIModel:
    def __init__(self):
        self.model = None
        self.tokenizer = None
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        logging.info(f"Using device: {self.device}")

    def load_model(self, model_name="google/flan-t5-small"):
        """Load the model and tokenizer"""
        try:
            logging.info(f"Loading model: {model_name}")
            self.tokenizer = AutoTokenizer.from_pretrained(model_name)
            self.model = AutoModelForSeq2SeqLM.from_pretrained(model_name)
            self.model.to(self.device)
            logging.info("Model loaded successfully")
            return True
        except Exception as e:
            logging.error(f"Failed to load model: {e}")
            return False

    def generate_response(self, prompt, max_length=300):
        """Generate response from the model"""
        if not self.model or not self.tokenizer:
            return {"error": "Model not loaded"}

        try:
            inputs = self.tokenizer(prompt, return_tensors="pt", max_length=512, truncation=True)
            inputs = {k: v.to(self.device) for k, v in inputs.items()}

            with torch.no_grad():
                outputs = self.model.generate(
                    **inputs,
                    max_length=max_length,
                    num_beams=4,
                    early_stopping=True,
                    temperature=0.1,
                    do_sample=False
                )

            response = self.tokenizer.decode(outputs[0], skip_special_tokens=True)
            return {"response": response}

        except Exception as e:
            logging.error(f"Error generating response: {e}")
            return {"error": str(e)}

# Global model instance
ai_model = LocalAIModel()

@app.route('/health', methods=['GET'])
def health_check():
    """Check if the AI service is running"""
    return jsonify({"status": "healthy", "model_loaded": ai_model.model is not None})

@app.route('/load_model', methods=['POST'])
def load_model():
    """Load the AI model"""
    model_name = request.json.get('model_name', 'google/flan-t5-small')
    success = ai_model.load_model(model_name)
    return jsonify({"success": success})

def rule_based_parser(message):
    """Rule-based parser for file operations"""
    lower_message = str(message).lower().strip()

    # Greeting detection
    if re.match(r'^(hi|hello|hey|greetings|good morning|good afternoon|good evening)', lower_message):
        return {"action": "message", "text": "Hello! I'm your AI file assistant. How can I help you with your files today?"}

    # List files commands
    if any(phrase in lower_message for phrase in ['show me', 'list', 'display', 'what\'s in', 'what is in']):
        path_match = re.search(r'(?:in|from|of)\s+([^\s]+)', lower_message)
        path = path_match.group(1) if path_match else ""
        return {"action": "list", "path": "" if path == "root" else path}

    # Count files commands
    if any(phrase in lower_message for phrase in ['how many', 'count', 'number of']):
        path_match = re.search(r'(?:in|from|of)\s+([^\s]+)', lower_message)
        path = path_match.group(1) if path_match else ""
        return {"action": "count_files", "path": "" if path == "root" else path}

    # Create folder commands
    if any(phrase in lower_message for phrase in ['create', 'make', 'new']) and 'folder' in lower_message:
        folder_match = re.search(r'(?:called|named|folder)\s+([^\s]+)', lower_message)
        path = folder_match.group(1) if folder_match else "new_folder"
        return {"action": "create_folder", "path": path}

    # Delete commands (with confirmation)
    if any(word in lower_message for word in ['delete', 'remove', 'erase']):
        path_match = re.search(r'(?:file|folder)\s+([^\s]+)', lower_message)
        path = path_match.group(1) if path_match else ""
        if 'folder' in lower_message or 'directory' in lower_message:
            return {"action": "delete_folder", "path": path}
        else:
            return {"action": "delete_file", "path": path}

    # Move commands
    if 'move' in lower_message and 'to' in lower_message:
        move_match = re.search(r'move\s+([^\s]+).*to\s+([^\s]+)', lower_message)
        if move_match:
            return {
                "action": "move",
                "source": move_match.group(1),
                "destination": move_match.group(2)
            }

    # Search commands
    if any(word in lower_message for word in ['find', 'search', 'look for']):
        query_match = re.search(r'(?:for|containing)\s+([^\s]+)', lower_message)
        query = query_match.group(1) if query_match else ""
        return {"action": "search_files", "query": query, "path": ""}

    # List by type commands
    if any(word in lower_message for word in ['images', 'videos', 'audio', 'documents']):
        type_map = {
            'image': 'image',
            'video': 'video',
            'audio': 'audio',
            'document': 'document'
        }
        action_type = None
        for key, value in type_map.items():
            if key in lower_message:
                action_type = value
                break
        if action_type:
            return {"action": "list_by_type", "path": "", "type": action_type}

    # Default fallback
    return {
        "action": "message",
        "text": "I'm not sure what you mean. Try commands like: 'show me files', 'create a folder called photos', 'how many files are in documents', or 'delete old_backup.txt'"
    }

@app.route('/chat', methods=['POST'])
def chat():
    """Process chat messages"""
    data = request.json
    if not data or 'message' not in data:
        return jsonify({"error": "Message required"}), 400

    message = data['message']

    # First try rule-based parsing (fast and reliable)
    parsed_action = rule_based_parser(message)

    # If rule-based parser gives a generic "unable to determine" response,
    # try the AI model for more complex understanding
    if parsed_action.get("text") == "I'm not sure what you mean. Try commands like: 'show me files', 'create a folder called photos', 'how many files are in documents', or 'delete old_backup.txt'":
        logging.info("Rule-based parsing failed, trying AI model")

        # Create a simpler prompt for the AI model
        prompt = f"""Parse this file operation command and respond with a JSON action:

Command: "{message}"

Available actions: list, count_files, create_folder, delete_file, delete_folder, move, search_files, list_by_type

Example: "show me files" -> {{"action": "list", "path": ""}}

Response:"""

        result = ai_model.generate_response(prompt, max_length=100)

        if "error" not in result:
            response_text = result["response"].strip()
            # Try to extract JSON from AI response
            try:
                import json
                if '{' in response_text and '}' in response_text:
                    json_start = response_text.find('{')
                    json_end = response_text.rfind('}') + 1
                    json_str = response_text[json_start:json_end]
                    ai_parsed = json.loads(json_str)
                    if ai_parsed.get("action"):
                        parsed_action = ai_parsed
                        logging.info("AI model successfully parsed command")
            except:
                logging.info("AI model response not valid JSON, using rule-based result")

    return jsonify({"response": parsed_action})

if __name__ == '__main__':
    # Load model on startup
    if ai_model.load_model():
        logging.info("Model loaded successfully on startup")

    app.run(host='0.0.0.0', port=5001, debug=False)
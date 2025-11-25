# Local AI Model Setup Guide

This guide explains how to set up and run AI models locally on your NAS server for natural language processing of file operations.

## Why Local AI Models?

- **Privacy**: No data sent to external services
- **Reliability**: No dependency on internet connectivity or API limits
- **Performance**: Lower latency for AI responses
- **Cost**: No API usage costs
- **Control**: Full control over model behavior and updates

## System Requirements

### Minimum Requirements
- **CPU**: 4-core processor (8-core recommended)
- **RAM**: 8GB (16GB recommended)
- **Storage**: 500MB free space for model files
- **OS**: Linux, macOS, or Windows with Python support

### Recommended Requirements
- **CPU**: 8+ core processor
- **RAM**: 16GB+
- **GPU**: NVIDIA GPU with CUDA support (optional but highly recommended)
- **Storage**: 1GB+ free space

## Installation Steps

### 1. Install Python Dependencies

```bash
cd NAS_SERVER

# Install required packages
pip install -r requirements.txt
```

The `requirements.txt` includes:
- `Flask==2.3.3` - Web framework for the AI service
- `transformers==4.21.0` - Hugging Face transformers library
- `torch==2.0.1` - PyTorch for model inference
- `accelerate==0.20.3` - Performance optimization
- `sentencepiece==0.1.99` - Tokenization support

### 2. Download the Model (Optional)

The model will automatically download on first use, but you can pre-download it:

```python
from transformers import AutoTokenizer, AutoModelForSeq2SeqLM

# Download FLAN-T5 Small model (~250MB)
tokenizer = AutoTokenizer.from_pretrained("google/flan-t5-small")
model = AutoModelForSeq2SeqLM.from_pretrained("google/flan-t5-small")

print("Model downloaded successfully!")
```

### 3. Test the AI Service

Start the Python AI service:

```bash
cd NAS_SERVER
python ai_service.py
```

In another terminal, test the service:

```bash
python test_local_ai.py
```

You should see:
```
Testing Local AI Service...
✅ Health check passed: {'status': 'healthy', 'model_loaded': True}
✅ Response: {'action': 'message', 'text': 'Hello! I'm your AI file assistant...'}
...
🎉 All tests passed! Local AI service is working correctly.
```

### 4. Start Both Services

Use the provided startup scripts:

**Linux/macOS:**
```bash
./start_services.sh
```

**Windows:**
```cmd
start_services.bat
```

This will start:
- Python AI service on port 5001
- Node.js server on port 4002

## Model Options

### FLAN-T5 Models (Recommended)

| Model | Size | Performance | Use Case |
|-------|------|-------------|----------|
| `google/flan-t5-small` | ~250MB | Fast, good accuracy | Production use |
| `google/flan-t5-base` | ~1GB | Better accuracy | High accuracy needed |
| `google/flan-t5-large` | ~3GB | Best accuracy | Maximum accuracy |

### Alternative Models

You can modify `ai_service.py` to use other models:

```python
# For conversational AI
model_name = "microsoft/DialoGPT-medium"

# For general instruction following
model_name = "google/flan-t5-base"

# For more advanced models (requires more resources)
model_name = "google/flan-t5-large"
```

## Configuration

### Model Configuration

Edit `ai_service.py` to change model settings:

```python
class LocalAIModel:
    def __init__(self):
        self.model_name = "google/flan-t5-small"  # Change model here
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.max_length = 300  # Maximum response length
        self.temperature = 0.1  # Response randomness (0.0 = deterministic)
```

### Service Configuration

```python
if __name__ == '__main__':
    app.run(
        host='0.0.0.0',      # Listen on all interfaces
        port=5001,            # Service port
        debug=False           # Set to True for development
    )
```

## Performance Optimization

### GPU Acceleration

If you have a CUDA-compatible GPU:

1. Install CUDA toolkit
2. Install PyTorch with CUDA support:
   ```bash
   pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118
   ```

3. The service will automatically detect and use GPU

### CPU Optimization

For CPU-only systems:

1. Use smaller models (`flan-t5-small`)
2. Reduce `max_length` parameter
3. Consider using `torch.set_num_threads()` for multi-threading

### Memory Optimization

```python
# In ai_service.py, add memory optimization
model = AutoModelForSeq2SeqLM.from_pretrained(
    model_name,
    torch_dtype=torch.float16,  # Use half precision
    low_cpu_mem_usage=True      # Reduce memory usage
)
```

## Troubleshooting

### Common Issues

#### 1. Model Download Fails
```bash
# Clear cache and retry
rm -rf ~/.cache/huggingface/transformers
python ai_service.py
```

#### 2. Out of Memory Error
- Use smaller model (`flan-t5-small`)
- Reduce `max_length` parameter
- Add more RAM or use GPU

#### 3. CUDA Not Available
```python
# Force CPU usage
self.device = "cpu"
```

#### 4. Port Already in Use
```python
# Change port in ai_service.py
app.run(host='0.0.0.0', port=5002)  # Use different port
```

### Performance Tuning

#### Response Time Optimization

```python
# Faster inference settings
outputs = self.model.generate(
    **inputs,
    max_length=max_length,
    num_beams=1,        # Reduce from 4 to 1 for speed
    early_stopping=True,
    do_sample=False,    # Deterministic responses
)
```

#### Batch Processing

For multiple concurrent requests, consider implementing request queuing.

## Security Considerations

### Network Security
- Run the AI service on a private network
- Use firewall rules to restrict access to port 5001
- Consider using HTTPS for production deployments

### Model Security
- FLAN-T5 models are generally safe for file operation parsing
- Monitor for prompt injection attempts
- Implement rate limiting if needed

## Monitoring and Maintenance

### Health Checks

The service provides a health endpoint:

```bash
curl http://localhost:5001/health
# Response: {"status": "healthy", "model_loaded": true}
```

### Logs

Monitor the console output for:
- Model loading status
- Inference performance
- Error messages

### Updates

To update the model:
```bash
# Pull latest model weights
rm -rf ~/.cache/huggingface/transformers/google--flan-t5-small/
python ai_service.py  # Will re-download
```

## Integration with NAS Server

The Node.js server automatically:
1. Calls the Python AI service for chat requests
2. Falls back to rule-based parsing if AI service is unavailable
3. Handles file operations based on AI responses

### API Communication

```javascript
// Node.js calls Python service
const response = await axios.post('http://localhost:5001/chat', {
    message: userMessage
});
```

## Alternative Deployment Options

### Docker Deployment

```dockerfile
FROM python:3.9-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY ai_service.py .
EXPOSE 5001

CMD ["python", "ai_service.py"]
```

### Systemd Service (Linux)

Create `/etc/systemd/system/ai-service.service`:

```ini
[Unit]
Description=Local AI Service
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/NAS_SERVER
ExecStart=/usr/bin/python3 ai_service.py
Restart=always

[Install]
WantedBy=multi-user.target
```

## Support and Resources

- **Hugging Face Documentation**: https://huggingface.co/docs/transformers
- **FLAN-T5 Paper**: https://arxiv.org/abs/2210.11416
- **PyTorch Documentation**: https://pytorch.org/docs/

For issues specific to this implementation, check the logs and ensure all dependencies are correctly installed.
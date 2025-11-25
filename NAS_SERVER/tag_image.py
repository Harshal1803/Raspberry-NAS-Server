import sys
from transformers import pipeline

pipe = pipeline("zero-shot-image-classification", model="openai/clip-vit-base-patch32")

if len(sys.argv) < 2:
    print("")
    sys.exit(1)

path = sys.argv[1]
candidate_labels = ["car", "dog", "cat", "human", "animal", "vehicle", "building", "nature", "food", "person", "bird", "tree", "water", "sky", "mountain", "city", "house", "street", "park", "beach", "flower", "fruit", "furniture", "clothing", "electronic", "book", "toy", "sport", "music", "art"]

try:
    result = pipe(path, candidate_labels=candidate_labels)
    tags = [item['label'] for item in result if item['score'] > 0.1]
    print(','.join(tags))
except Exception as e:
    print("")
from transformers import BlipProcessor, BlipForConditionalGeneration
from PIL import Image
import requests

processor = BlipProcessor.from_pretrained("Salesforce/blip-image-captioning-base")
model = BlipForConditionalGeneration.from_pretrained("Salesforce/blip-image-captioning-base")
def get_caption(image_path):
    
    img = Image.open(image_path).convert("RGB")
    inputs = processor(images=img,  return_tensors="pt")
    out = model.generate(**inputs, max_length=100)
    caption = processor.decode(out[0], skip_special_tokens=True)
    print("Caption:", caption)
    return caption


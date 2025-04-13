from flask import Flask, request, jsonify
import io
from PIL import Image
from main import get_caption
from flask_cors import CORS

app = Flask(__name__)
CORS(app)
@app.route('/get-caption', methods=['POST'])
def get_caption_api():
    if 'image' not in request.files:
        return jsonify({"error": "No image file found"}), 400

    file = request.files['image']
    
    # Read the image file as a numpy array
    file_bytes = file.read()
    image_stream = io.BytesIO(file_bytes)

    # Pass the BytesIO object directly to get_caption (it acts like a file)
    try:
        print("image_stream")
        caption = get_caption(image_stream)
        print("done")
    except Exception as e:
        print("error_________")
        return jsonify({"error": str(e)}), 500

    
    return jsonify({
        "caption":caption
    })

if __name__ == '__main__':
    app.run(debug=False)

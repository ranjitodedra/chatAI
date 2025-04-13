import os
from flask import Flask, request, jsonify, send_from_directory
import io
from flask_cors import CORS
from werkzeug.utils import secure_filename

# Import Torch and Point-E model modules
import torch
from PIL import Image
from main import get_caption
from point_e.diffusion.sampler import PointCloudSampler
# --- Point‑E imports (fixed) ---
from point_e.models.configs import MODEL_CONFIGS, model_from_config
from point_e.diffusion.configs import DIFFUSION_CONFIGS, diffusion_from_config
from point_e.models.download import load_checkpoint
from point_e.util.pc_to_mesh import marching_cubes_mesh

# --- Configuration ---

# ------------------------------------------------------------------
#  MPS float64 fix: cast to float32 *before* moving to the 'mps' device
# ------------------------------------------------------------------
import point_e.diffusion.gaussian_diffusion as gd
import numpy as np
import torch

def _extract_into_tensor_fp32(arr, timesteps, broadcast_shape):
    arr = arr.astype(np.float32)                  # <-- key line
    res = torch.from_numpy(arr).to(device=timesteps.device)[timesteps]
    while len(res.shape) < len(broadcast_shape):
        res = res[..., None]
    return res + torch.zeros(broadcast_shape, device=timesteps.device)

gd._extract_into_tensor = _extract_into_tensor_fp32


app = Flask(__name__)
CORS(app)  # Enable CORS for all routes (for development convenience)

# Directories for uploads and outputs
UPLOAD_FOLDER = "uploads"
OUTPUT_FOLDER = "generated_models"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(OUTPUT_FOLDER, exist_ok=True)

# Allow only image files for upload for safety
ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "gif"}
def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS

# --- Load AI Models at Startup ---

# Select device: use MPS (Apple Metal GPU) if available, else CPU
device = torch.device("mps") if torch.backends.mps.is_available() else torch.device("cpu")
print(f"* Using device: {device}")

# Load Point-E base (image->point cloud), upsampler, and SDF->mesh models
base_name = "base40M"        # image-conditioned base model (coarse point cloud)
upsampler_name = "upsample"  # upsampler model (refines point cloud)
sdf_name = "sdf"             # model to convert point cloud to mesh

# Initialize model architectures
base_model = model_from_config(MODEL_CONFIGS[base_name], device)
base_diffusion = diffusion_from_config(DIFFUSION_CONFIGS[base_name])
upsampler_model = model_from_config(MODEL_CONFIGS[upsampler_name], device)
upsampler_diffusion = diffusion_from_config(DIFFUSION_CONFIGS[upsampler_name])
sdf_model = model_from_config(MODEL_CONFIGS[sdf_name], device)

# Load model weights (this will download weights on first run if not cached)
base_model.load_state_dict(load_checkpoint(base_name, device))
base_model.eval()
upsampler_model.load_state_dict(load_checkpoint(upsampler_name, device))
upsampler_model.eval()
sdf_model.load_state_dict(load_checkpoint(sdf_name, device))
sdf_model.eval()

# Set up the Point-E sampler for point cloud generation
sampler = PointCloudSampler(
    device=device,
    models=[base_model, upsampler_model],
    diffusions=[base_diffusion, upsampler_diffusion],
    num_points=[1024, 4096-1024],      # coarse stage outputs 1024 pts, upsampler adds more to total 4096
    aux_channels=['R', 'G', 'B'],      # include color channels
    guidance_scale=[0.0, 0.0],        # no classifier guidance (not used for image-conditioned model)
    model_kwargs_key_filter=('images', '')  # don't pass conditioning to upsampler
)

# --- Flask Routes ---

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

@app.route('/upload', methods=['POST'])
def upload_image():
    """Handle image upload and 3D model generation."""
    if 'image' not in request.files:
        return jsonify({"error": "No file part"}), 400
    file = request.files['image']
    if file.filename == '':
        return jsonify({"error": "No file selected"}), 400
    if not allowed_file(file.filename):
        return jsonify({"error": "Unsupported file type"}), 400

    # Save uploaded image to disk
    filename = secure_filename(file.filename)
    input_path = os.path.join(UPLOAD_FOLDER, filename)
    file.save(input_path)
    print(f"* Received image: {filename}, saved to {input_path}")

    # Load image and convert to RGB
    img = Image.open(input_path).convert("RGB")

    # Run Point-E sampling to get a point cloud (this may take 30-60+ seconds)
    print("* Generating point cloud from image...")
    sampler_kwargs = {"images": [img]}  # feed the PIL image to the sampler
    samples = None
    for x in sampler.sample_batch_progressive(batch_size=1, model_kwargs=sampler_kwargs):
        samples = x  # iterate through diffusion steps (we take the final output)

    # Convert the diffusion output to a PointCloud object
    pc = sampler.output_to_point_clouds(samples)[0]
    print("* Point cloud generated. Converting to mesh...")

    # Use the SDF model to convert point cloud to mesh (Marching Cubes)
    mesh = marching_cubes_mesh(pc, sdf_model, grid_size=128)  # 128^3 grid for mesh extraction

    # 3. Prepare color data from point cloud
    pc_coords = pc.coords  # Nx3 array of XYZ coordinates for each point
    # Combine the R, G, B channels into an (N, 3) array of colors
    R = pc.channels.get("R")  # e.g., numpy array of length N
    G = pc.channels.get("G")
    B = pc.channels.get("B")
    if R is None or G is None or B is None:
        return jsonify({"error": "Point cloud color channels not found"}), 500
    pc_colors = np.stack([R, G, B], axis=1).astype(float)
    # Ensure colors are in [0, 1] range
    if pc_colors.max() > 1.0:
        pc_colors /= 255.0  # normalize 0-255 RGB values to 0-1


    # Save mesh to an OBJ file
    output_filename = os.path.splitext(filename)[0] + ".obj"
    output_path = os.path.join(OUTPUT_FOLDER, output_filename)
    with open(output_path, 'w') as f:
        # Write vertices
        for v in mesh.verts:
            # Find the nearest point in the point cloud to this mesh vertex (nearest-neighbor color)
            distances = np.linalg.norm(pc_coords - v, axis=1)
            nearest_idx = np.argmin(distances)
            color = pc_colors[nearest_idx]
            # Write vertex line: x, y, z, r, g, b (RGB in [0,1])
            f.write(f"v {v[0]} {v[1]} {v[2]} {color[0]} {color[1]} {color[2]}\n")
            # f.write(f"v {v[0]} {v[1]} {v[2]}\n")
        # Write faces (OBJ faces are 1-indexed)
        for face in mesh.faces:
            f.write(f"f {face[0]+1} {face[1]+1} {face[2]+1}\n")
    print(f"* Mesh saved to {output_path}")


    # Return the filename of the generated model to front-end
    return jsonify({"filename": output_filename})

@app.route('/download/<path:filename>', methods=['GET'])
def download_model(filename):
    """Serve the generated .obj model file for download."""
    # Send file from OUTPUT_FOLDER (as attachment to prompt download in browser)
    return send_from_directory(OUTPUT_FOLDER, filename, as_attachment=True)

# Run the app (for local development)
if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0')

import React, { useState, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import './ThreeDPage.css'; // Import the CSS

function ThreeDPage() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [modelURL, setModelURL] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(''); // Optional: for error display
  const mountRef = useRef(null);
  const rendererRef = useRef(null); // Ref to store the renderer instance
  const sceneRef = useRef(null); // Ref to store the scene instance
  const cameraRef = useRef(null); // Ref to store the camera instance
  const controlsRef = useRef(null); // Ref to store controls instance

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      setSelectedFile(file);
      setErrorMessage(''); // Clear previous errors
      // Reset model view if a new file is selected
      setModelURL(null);
      // Clean up previous Three.js instance if it exists
      if (rendererRef.current) {
          cleanupThree();
      }
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    setLoading(true);
    setErrorMessage('');
    setModelURL(null); // Clear previous model URL
    // Clean up previous Three.js instance before loading new one
    if (rendererRef.current) {
        cleanupThree();
    }

    try {
      const formData = new FormData();
      formData.append('image', selectedFile);

      const response = await fetch('http://localhost:5000/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        let errorText = 'Upload failed';
        try {
          const err = await response.json();
          errorText = err.error || `Server error: ${response.statusText}`;
        } catch (e) {
           // If response is not JSON or empty
           errorText = `Server error: ${response.statusText || response.status}`;
        }
        throw new Error(errorText);
      }

      const data = await response.json();
      const filename = data.filename;
      // IMPORTANT: Ensure your server is correctly serving the .obj file
      // and that the Content-Type header is appropriate (e.g., model/obj or application/octet-stream)
      const fileUrl = `http://localhost:5000/download/${filename}`;
      setModelURL(fileUrl); // Trigger the useEffect for Three.js setup

    } catch (error) {
      console.error('Error uploading or processing file:', error);
      setErrorMessage(`Error: ${error.message}. Please try again or check the console.`);
      setModelURL(null); // Ensure no model tries to load on error
    } finally {
      setLoading(false);
    }
  };

  // Function to clean up Three.js resources
  const cleanupThree = () => {
      if (rendererRef.current) {
          rendererRef.current.dispose();
          rendererRef.current = null;
      }
      if (controlsRef.current) {
          controlsRef.current.dispose();
          controlsRef.current = null;
      }
      if (sceneRef.current) {
          // Dispose geometries, materials, textures in the scene if needed
          sceneRef.current = null;
      }
      if (mountRef.current && mountRef.current.firstChild) {
          mountRef.current.removeChild(mountRef.current.firstChild); // Remove canvas
      }
      console.log("Three.js scene cleaned up.");
  };

  useEffect(() => {
    // Effect runs only when modelURL changes and is not null
    if (!modelURL || !mountRef.current) {
        return; // Exit if no model URL or mount point isn't ready
    }

    // --- Basic Three.js Setup ---
    const currentMount = mountRef.current; // Capture ref value
    const width = currentMount.clientWidth;
    const height = currentMount.clientHeight; // Use the container's height

    sceneRef.current = new THREE.Scene();
    sceneRef.current.background = new THREE.Color(0x333333); // Darker background for viewer

    cameraRef.current = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
    cameraRef.current.position.set(0, 0.5, 3); // Adjusted camera position

    rendererRef.current = new THREE.WebGLRenderer({ antialias: true });
    rendererRef.current.setSize(width, height);
    currentMount.appendChild(rendererRef.current.domElement);

    // --- Lighting ---
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7); // Softer ambient
    sceneRef.current.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.0); // Slightly stronger directional
    dirLight.position.set(5, 5, 5);
    sceneRef.current.add(dirLight);
    const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.5);
    dirLight2.position.set(-5, -5, -5);
    sceneRef.current.add(dirLight2);


    // --- Controls ---
    controlsRef.current = new OrbitControls(cameraRef.current, rendererRef.current.domElement);
    controlsRef.current.enableDamping = true;
    controlsRef.current.dampingFactor = 0.1;
    controlsRef.current.rotateSpeed = 0.6;

    // --- Load Model ---
    const loader = new OBJLoader();
    loader.load(
      modelURL,
      (obj) => {
        console.log("OBJ Loaded successfully");
        // Optional: Center the model geometry
        const box = new THREE.Box3().setFromObject(obj);
        const center = box.getCenter(new THREE.Vector3());
        obj.position.sub(center); // Center the model
        obj.position.set(0, 0, 0); // Ensure it's at the origin after centering

        // Optional: Scale the model if it's too big or small
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = 1.5 / maxDim; // Adjust scale factor as needed
        obj.scale.set(scale, scale, scale);

        sceneRef.current.add(obj);
      },
      (xhr) => {
        // Loading progress
        const percentLoaded = Math.round((xhr.loaded / xhr.total) * 100);
        console.log(`OBJ ${percentLoaded}% loaded`);
        // You could update a loading indicator specific to the model here
      },
      (err) => {
        console.error('Error loading OBJ model:', err);
        setErrorMessage('Failed to load the 3D model. The file might be invalid or corrupted.');
        setModelURL(null); // Reset model URL on loading error
        cleanupThree(); // Clean up the scene
      }
    );

    // --- Animation Loop ---
    let animationFrameId;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      if (controlsRef.current) controlsRef.current.update();
      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
    };
    animate();

    // --- Resize Handling ---
    const handleResize = () => {
        if (currentMount && rendererRef.current && cameraRef.current) {
            const newWidth = currentMount.clientWidth;
            const newHeight = currentMount.clientHeight;
            rendererRef.current.setSize(newWidth, newHeight);
            cameraRef.current.aspect = newWidth / newHeight;
            cameraRef.current.updateProjectionMatrix();
        }
    };
    window.addEventListener('resize', handleResize);


    // --- Cleanup on unmount or when modelURL changes again ---
    return () => {
      console.log("Cleanup triggered for useEffect");
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
      cleanupThree();
    };
  }, [modelURL]); // Rerun effect only when modelURL changes

  return (
    <div className="three-d-page-container">
      <div className="three-d-card">
        <h1>Image to 3D Model</h1>

        <div className="form-controls">
          {/* Custom File Input */}
          <input
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            id="file-upload" // Need an ID to connect the label
            className="file-input-hidden" // Class to hide it
          />
          <label htmlFor="file-upload" className="custom-file-upload-label">
            {selectedFile ? selectedFile.name : 'Choose Image'}
          </label>

          {/* Upload Button */}
          <button
            className="upload-button"
            onClick={handleUpload}
            disabled={!selectedFile || loading}
          >
            {loading ? 'Generating 3D Model…' : 'Upload and Convert'}
          </button>
        </div>

        {/* Status Messages */}
        {loading && <p className="status-message">Processing image, this may take a minute...</p>}
        {errorMessage && <p className="status-message error">{errorMessage}</p>} {/* Display errors */}


        {/* Conditionally render the mount point only when needed */}
        {(modelURL || loading) && !errorMessage && (
             <div
                ref={mountRef}
                className="three-container"
                // Add key to force re-mount if modelURL changes, ensuring clean setup
                key={modelURL || 'loading'}
            />
        )}


        {/* Download Link - Show only if model loaded successfully */}
        {modelURL && !loading && !errorMessage && (
          <a href={modelURL} download={`${selectedFile?.name?.split('.')[0] || 'model'}.obj`} className="download-link">
            Download .OBJ Model
          </a>
        )}
      </div>
    </div>
  );
}

export default ThreeDPage;
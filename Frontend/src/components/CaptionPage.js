import React, { useState } from 'react';
import axios from 'axios';
import './CaptionPage.css'; // Import the CSS file (we'll create this next)

function CaptionPage() {
  const [selectedImage, setSelectedImage] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(''); // State for image preview
  const [caption, setCaption] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(''); // State for error message

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      setSelectedImage(file);
      setPreviewUrl(URL.createObjectURL(file)); // Create a URL for preview
      setCaption(''); // Clear previous caption
      setError('');   // Clear previous error
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); // Clear previous error

    if (!selectedImage) {
      setError('Please select an image first.');
      return;
    }

    const formData = new FormData();
    formData.append('image', selectedImage);

    try {
      setLoading(true);
      setCaption(''); // Clear caption while loading
      const response = await axios.post('http://localhost:5000/get-caption', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      // Basic check if response seems valid
      if (response.data && response.data.caption) {
         setCaption(response.data.caption);
      } else {
         setError('Received an unexpected response from the server.');
         setCaption(''); // Ensure caption is cleared on error
      }

    } catch (err) {
      console.error('Error uploading image:', err);
      // Provide more specific error message if possible
      const errorMessage = err.response?.data?.error || 'An error occurred while generating the caption.';
      setError(errorMessage);
      setCaption(''); // Ensure caption is cleared on error
    } finally {
      setLoading(false);
    }
  };

  return (
    // Add a wrapper to help with centering if needed, and apply background here or in App.css
    <div className="caption-page-container">
        {/* The main card */}
        <div className="caption-card">
            <h1>Image Caption Generator</h1>

            <form onSubmit={handleSubmit} className="caption-form">
                {/* Improved File Input */}
                <label htmlFor="file-upload" className="custom-file-upload">
                  {selectedImage ? selectedImage.name : 'Choose Image'}
                </label>
                <input
                  id="file-upload"
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                />

                {/* Image Preview */}
                {previewUrl && (
                  <div className="image-preview">
                    <img src={previewUrl} alt="Selected preview" />
                  </div>
                )}

                <button type="submit" disabled={loading || !selectedImage} className="submit-button">
                  {loading ? 'Generating...' : 'Generate Caption'}
                </button>
            </form>

            {/* Status Messages */}
            {loading && <p className="status-message loading">Generating caption, please wait...</p>}
            {error && <p className="status-message error">{error}</p>}

            {/* Caption Result */}
            {caption && !loading && !error && (
                <div className="caption-result">
                    <h3>Generated Caption:</h3>
                    <p>{caption}</p>
                </div>
            )}
        </div>
    </div>
  );
}

export default CaptionPage;
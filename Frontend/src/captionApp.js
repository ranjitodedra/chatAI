import React, { useState } from 'react';
import axios from 'axios';

function App() {
  const [selectedImage, setSelectedImage] = useState(null);
  const [caption, setCaption] = useState('');
  const [loading, setLoading] = useState(false);

  const handleFileChange = (event) => {
    setSelectedImage(event.target.files[0]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!selectedImage) return;

    const formData = new FormData();
    formData.append('image', selectedImage);

    try {
      setLoading(true);
      const response = await axios.post('http://localhost:5000/get-caption', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      setCaption(response.data.caption);
    } catch (error) {
      console.error('Error uploading image:', error);
      setCaption("Error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '20px' }}>
      <h1>Image Caption Generator</h1>

      <form onSubmit={handleSubmit}>
        <input type="file" accept="image/*" onChange={handleFileChange} />
        <button type="submit" disabled={loading}>Generate Caption</button>
      </form>

      {loading && <p>Loading...</p>}
      {caption && (
        <div>
          <h3>Caption:</h3>
          <p>{caption}</p>
        </div>
      )}
    </div>
  );
}

export default App;

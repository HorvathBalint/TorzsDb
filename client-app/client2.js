import express from 'express';
import axios from 'axios';

const app = express();
const PORT = 3002;

// API configuration
const API_BASE_URL = 'http://localhost:3000'; // Replace with your API server URL
const API_KEY = 'T8@zP1q!Xm#9wB6$'; // Use a valid API key
const API_KEY_INDEX = 0;

// Set EJS as the templating engine
app.set('view engine', 'ejs');
app.set('views', './views');

// Route to fetch and display data
app.get('/', async (req, res) => {
  try {
    // Fetch data from the protected endpoint
    const response = await axios.get(`${API_BASE_URL}/protected`, {
      headers: {
        'x-api-key': API_KEY,
        'index': API_KEY_INDEX,
      },
    });

    // Render the table view with fetched data
    res.render('table', { data: response.data });
  } catch (error) {
    console.error('Error fetching data:', error.message);
    res.status(500).send('Failed to retrieve data.');
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Client app is running at http://localhost:${PORT}`);
});

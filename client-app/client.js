// server.js
import express from 'express';
import axios from 'axios';
import cors from 'cors';
import bodyParser from 'body-parser';

const app = express();
const PORT = 3001;

// Enable CORS
app.use(cors());
app.use(bodyParser.json()); // To parse JSON request bodies

// Serve static HTML
app.get('/', (req, res) => {
    res.render('display_data.ejs')
});

// Start the server
app.listen(PORT, () => {
  console.log(`Web server is running on http://localhost:${PORT}`);
});

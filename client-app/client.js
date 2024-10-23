// server.js
import express from 'express';
import axios from 'axios';
import cors from 'cors';
import bodyParser from 'body-parser';

const app = express();
const PORT = process.env.PORT || 3001;

// Enable CORS
app.use(cors());
app.use(bodyParser.json()); // To parse JSON request bodies

// Serve static HTML
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Co-Workers and Students Data</title>
        <style>
          body { font-family: Arial, sans-serif; text-align: center; }
          table { width: 80%; margin: 20px auto; border-collapse: collapse; }
          table, th, td { border: 1px solid #ddd; }
          th, td { padding: 8px; text-align: left; }
          th { background-color: #f2f2f2; }
        </style>
      </head>
      <body>
        <h1>Co-Workers and Students Data</h1>
        <div id="data-container"></div>
        <script>
          async function fetchData() {
            try {
              const response = await fetch('http://localhost:3000/api/tantargyweb');
              if (!response.ok) throw new Error('Failed to fetch data');

              const data = await response.json();
              const table = document.createElement('table');
              const headerRow = document.createElement('tr');
              headerRow.innerHTML = '<th>Birth Name</th><th>Neptune ID</th><th>Email</th>';
              table.appendChild(headerRow);

              data.forEach(item => {
                const row = document.createElement('tr');
                row.innerHTML = \`
                  <td>\${item.birthname}</td>
                  <td>\${item.neptune_id}</td>
                  <td>\${item.email}</td>
                \`;
                table.appendChild(row);
              });

              document.getElementById('data-container').appendChild(table);
            } catch (error) {
              document.getElementById('data-container').innerHTML = '<p>Error fetching data: ' + error.message + '</p>';
            }
          }

          // Fetch data when the page loads
          window.onload = fetchData;
        </script>
      </body>
    </html>
  `);
});

// Start the server
app.listen(PORT, () => {
  console.log(`Web server is running on http://localhost:${PORT}`);
});

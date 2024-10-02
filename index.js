import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import xlsx from "xlsx";
import fs from "fs";
import path from "path";
import ExcelJS from "exceljs";
import multer from "multer";


const app = express();
const port = 3000;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.text());
app.use(express.static("views"));
app.use(express.static("public"));
app.use(express.urlencoded({ extended: true}));
app.set('view engine', 'ejs');


const db = new pg.Client({
    user: 'postgres', // PostgreSQL felhasználónév
    host: 'localhost', // PostgreSQL szerver címe
    database: 'Torzsadatbazis', // Adatbázis neve
    password: 'Tobi0424', // Jelszó
    port: 5432, // PostgreSQL alapértelmezett portja
  });

db.connect();

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
      cb(null, 'uploads/'); // The folder where files will be stored
  },
  filename: function (req, file, cb) {
      const customFileName = req.body.customFileName || file.fieldname + '-' + Date.now(); // Use custom name or fallback
      const fileExtension = path.extname(file.originalname); // Extract the file extension
      cb(null, customFileName + fileExtension); // Append the file extension
  }
});

// Initialize multer with storage settings
const upload = multer({ storage: storage });

function xlsxToMatrix(filePath) {
  // Check if the file exists before trying to read it
  if (fs.existsSync(filePath)) {
      try {
          // Attempt to read the workbook
          const workbook = xlsx.readFile(filePath);
          const sheetName = workbook.SheetNames[0];
          if (!sheetName) {
              throw new Error('No sheets found in the Excel file.');
          }
          
          const worksheet = workbook.Sheets[sheetName];
          const matrix = xlsx.utils.sheet_to_json(worksheet, { header: 1 });
          return matrix;
      } catch (error) {
          console.error(`Error reading the Excel file: ${error.message}`);
          throw new Error('Error reading the Excel file.');
      }
  } else {
      console.error(`File does not exist at path: ${filePath}`);
      throw new Error(`File does not exist at path: ${filePath}`);
  }
}

function matrixToHTMLTable(matrix) {
  let table = '<table border="1" cellpadding="5" cellspacing="0">';

  matrix.forEach((row) => {
      table += '<tr>';
      row.forEach((cell) => {
          table += `<td>${cell}</td>`;
      });
      table += '</tr>';
  });

  table += '</table>';
  return table;
}

async function createTableFromMatrix(matrix, tableName) {
  // Get column names from the first row
  const columnNames = matrix[0];

  // Build the CREATE TABLE statement dynamically
  let createTableSQL = `CREATE TABLE ${tableName} (\n`;
  createTableSQL += columnNames.map(col => `"${col}" TEXT`).join(',\n');
  createTableSQL += '\n);';

  // Execute the CREATE TABLE query
  await db.query(createTableSQL);

  // Insert rows into the table
  const insertSQL = `INSERT INTO ${tableName} (${columnNames.map(col => `"${col}"`).join(',')}) VALUES \n`;

  // Build the VALUES portion of the INSERT statement
  const values = matrix.slice(1); // Remove the first row (headers)
  const valuesPlaceholder = values.map((row, rowIndex) => 
      `(${row.map((_, colIndex) => `$${rowIndex * row.length + colIndex + 1}`).join(', ')})`
  ).join(',\n');

  const flatValues = values.flat();  // Flatten the 2D array into a 1D array for parameterized query
  const finalInsertSQL = insertSQL + valuesPlaceholder;

  // Execute the INSERT query
  await db.query(finalInsertSQL, flatValues);
}

const getTablesAndColumns = async () => {
  const query = `
      SELECT 
          table_name, 
          column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position;
  `;
  
  try {
      const res = await db.query(query);
      return res.rows; // returns an array of objects { table_name: '', column_name: '' }
  } catch (err) {
      console.error(err);
  }
};

async function printToXls(querrystr) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Query Results');
  const res = await db.query(querrystr); // Replace with your actual query
  const columns = Object.keys(res.rows[0]).map(key => ({ header: key, key }));
  worksheet.columns = columns;

  // Add rows to the Excel sheet
  res.rows.forEach(row => {
      worksheet.addRow(row);
  });
  let trimmedStr = querrystr.trim();
  let words = trimmedStr.split(" ");

  // Write the Excel file
  await workbook.xlsx.writeFile('querry from '+words[words.length-1]+".xlsx");
};

// Route to handle file upload
app.post('/uploadfile', upload.single('file'), (req, res) => {
  if (!req.file) {
      return res.status(400).send('No file uploaded or invalid file type.');
  }

  const filePath = path.resolve('uploads', req.file.filename);

  fs.access(filePath, fs.constants.F_OK, (err) => {
      if (err) {
          return res.status(404).send('File not found or inaccessible.');
      }

      try {
          const matrix = xlsxToMatrix(filePath);
          const htmlTable = matrixToHTMLTable(matrix);

          // Send the HTML response with the table
          res.send(`
            <html>
              <head>
                <title>Matrix Table</title>
                <style>
              .home-button {
                margin: 20px;
                display: inline-block;
                padding: 10px 20px;
                background-color: #007bff;
                color: white;
                text-decoration: none;
                border-radius: 5px;
              }

              .home-button:hover {
                background-color: #0056b3;
              }
            </style>
              </head>
              <body>
                <a href="/homepage" class="home-button">Vissza a főoldalra</a>
                <br>
                ${htmlTable} <!-- Insert the table here -->
              </body>
            </html>
          `);
          createTableFromMatrix(matrix, req.file.filename.replace('.xlsx', ''));
      } catch (error) {
          res.status(500).send('Error processing the Excel file.');
      }
  });
});


app.get('/upload', async (req, res) => {
  res.render('Upload.ejs');
});

// API végpont a diákokhoz
app.get('/api/students', async (req, res) => {
  try {
    const results = await db.query('SELECT * FROM students');
    res.json(results.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API végpont a munkatársakhoz
app.get('/api/co_workers', async (req, res) => {
    try {
      const results = await db.query('SELECT * co_workers');
      res.json(results.rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });


app.get('/homepage', async (req, res) => {
  res.render('HomePage.ejs');
});

app.get('/QM', async (req, res) => {
  const tablesAndColumns = await getTablesAndColumns();
  res.render('QuerryMaker', { tablesAndColumns });
});

app.get('/hr', async (req, res) => {
  res.render('HR.ejs');
});
  
app.post('/submit-string', (req, res) => {
  const receivedString = req.body;  // Get the string from the form
  printToXls(receivedString);  // Use the received string to generate an XLS file
});

app.listen(port,()=>{
    console.log(`A szerver a ${port} porton fut.`);
});
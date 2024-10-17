import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import xlsx from "xlsx";
import fs from "fs";
import path from "path";
import ExcelJS from "exceljs";
import multer from "multer";
import Client from 'ssh2-sftp-client';


const app = express();
const port = 3000;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.text());
app.use(express.static("views"));
app.use(express.static("public"));
app.use(express.urlencoded({ extended: true}));
app.set('view engine', 'ejs');

const sftp= new Client();

const config={
  host: 'sftp://168.192.1.220',
  port: 22,
  username: 'Taprick',
  password: 'taprick07'
};

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
          fs.unlinkSync(filePath);
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

async function createOrUpsertTableFromMatrix(matrix, tableName, uniqueColumn) {
  // Get column names from the first row
  const columnNames = matrix[0];
  uniqueColumn=matrix[0][0];

   // Use CREATE TABLE IF NOT EXISTS to avoid the "already exists" error
   let createTableSQL = `CREATE TABLE IF NOT EXISTS ${tableName} (\n`;
   createTableSQL += columnNames.map(col => `"${col}" TEXT`).join(',\n');
   createTableSQL += `,\nUNIQUE ("${uniqueColumn}")`;  // Add unique constraint on the specified column
   createTableSQL += '\n);';
 
   // Execute the CREATE TABLE IF NOT EXISTS query
   await db.query(createTableSQL);
 
   // Build the INSERT statement
   const insertSQL = `INSERT INTO ${tableName} (${columnNames.map(col => `"${col}"`).join(',')}) VALUES \n`;
 
   // Build the VALUES portion of the INSERT statement
   const values = matrix.slice(1); // Remove the first row (headers)
   const valuesPlaceholder = values.map((row, rowIndex) => 
     `(${row.map((_, colIndex) => `$${rowIndex * row.length + colIndex + 1}`).join(', ')})`
   ).join(',\n');
 
   const flatValues = values.flat();  // Flatten the 2D array into a 1D array for parameterized query
 
   // Build the final UPSERT query using the unique constraint
   const updateColumns = columnNames.map(col => `"${col}" = EXCLUDED.${col}`).join(', ');
 
   const finalInsertSQL = insertSQL + valuesPlaceholder + `
     ON CONFLICT ("${uniqueColumn}") 
     DO UPDATE SET ${updateColumns};
   `;
 
   // Execute the UPSERT query
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

async function printToXls(queries) {
  const workbook = new ExcelJS.Workbook();

  // Get the current date in the format YYYY-MM-DD
  const currentDate = new Date().toISOString().replace(/:/g, '-').replace('T', '_').split('.')[0];

  // Iterate over each query string in the array
  for (const queryStr of queries) {
      const res = await db.query(queryStr); // Replace with your actual query

      // Extract the table name from the query (assumes a format like "SELECT * FROM tableName")
      const tableName = queryStr.match(/FROM\s+(\w+)/i);
      const sheetName = tableName ? tableName[1] : 'Query'; // Use the table name as the sheet name, fallback to 'Query'

      // Create a new worksheet for each query
      const worksheet = workbook.addWorksheet(sheetName);
      
      // Define columns based on the query result
      const columns = Object.keys(res.rows[0]).map(key => ({ header: key, key }));
      worksheet.columns = columns;

      // Add rows to the Excel sheet
      res.rows.forEach(row => {
          worksheet.addRow(row);
      });
  }

  // Define the file path for the Excel file, using the current date
  const filepath = path.resolve('downloads', `lekérdezések_${currentDate}.xlsx`);
  
  // Write the Excel file
  await workbook.xlsx.writeFile(filepath);
  console.log(`Excel file created at: ${filepath}`);
}

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
          createOrUpsertTableFromMatrix(matrix, req.file.filename.replace('.xlsx', ''));
      } catch (error) {
          res.status(500).send('Error processing the Excel file.');
      }
  });
});

app.get('/download', (req, res) => {
  const filepath = path.resolve('downloads', fs.readdirSync('downloads')[0]);
  res.download(filepath);
  setTimeout(() => {
    fs.unlink(filepath, (err) => {
        if (err) {
            console.error('Error deleting the file:', err);
            return;
        }
    });
  }, 1000);
});

app.get('/upload', async (req, res) => {
  const tablesAndColumns = await getTablesAndColumns();
  const uniqueTableNames = [...new Set(tablesAndColumns.map(table => table.table_name))]; // Get unique table names
  res.render('Upload', { tableNames: uniqueTableNames });
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

app.get('/new', async (req, res) => {
  const tablesAndColumns = await getTablesAndColumns();
  res.render('newQuerry', { tablesAndColumns });
});
  
app.post('/submit-string', (req, res) => {
  const receivedString = req.body;  // Get the string from the form
  console.log(receivedString+'in the app.js');
  printToXls(receivedString);  // Use the received string to generate an XLS file
});

app.listen(port,()=>{
    console.log(`A szerver a ${port} porton fut.`);
});
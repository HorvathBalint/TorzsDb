import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import xlsx from "xlsx";
import fs from "fs";
import path from "path";
import ExcelJS from "exceljs";
import multer from "multer";
import Client from 'ssh2-sftp-client';
import cron from 'node-cron';
import forge from 'node-forge';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import jwt from 'jsonwebtoken'; // Assuming JWT is used for authentication
import cors from 'cors';
import dotenv from 'dotenv';
import nodemailer from 'nodemailer';

// Configure dotenv
dotenv.config();

// Nodemailer setup
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: false, // true for 465, false for 587
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});


const app = express();
const port = 3000;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.text());
app.use(express.static("views"));
app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
//app.use(verifySSHKey);
app.set('view engine', 'ejs');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
});
app.use(limiter);

app.use(cors({
  origin: 'http://localhost:3001' // Replace with the front-end server's address
}));

const sftp= new Client();

const config={
  host: '192.168.1.220',
  port: 22,
  username: 'Taprick',
  password: 'taprick07'
};

sftp.connect(config);

const db = new pg.Client({
    user: 'postgres', // PostgreSQL felhasználónév
    host: 'localhost', // PostgreSQL szerver címe
    database: 'Torzsadatbazis', // Adatbázis neve
    password: 'Tobi0424', // Jelszó
    port: 5432, // PostgreSQL alapértelmezett portja
  });

db.connect();

// Egyszerű API kulcs lista (helyettesítsd adatbázissal éles használatra)
const validApiKeys = ["T8@zP1q!Xm#9wB6$"]; 

// Middleware a hozzáférés ellenőrzéséhez
const accessControl = (validIndex) => {
  return (req, res, next) => {
      const password = req.header('x-api-key'); // Retrieve the password from the request header
      if (password==validApiKeys[validIndex]) {
          next(); // Allow the request to proceed if credentials are valid
      } else {
          res.status(403).json({ error: "Hozzáférés megtagadva: Érvénytelen hitelesítés" }); // Deny access otherwise
      }
  };
};

// Védett végpont
app.get('/protected', accessControl(0), async (req, res) => {
  try {
    const results = await db.query(
      `SELECT co_workers.birthname, students.neptune_id, email
       FROM co_workers
       INNER JOIN students ON co_workers.tax_number = students.tax_number`
    );
    res.json(results.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// // Middleware to authenticate requests using JWT
// function authenticateToken(req, res, next) {
//   const authHeader = req.headers['authorization'];
//   const token = authHeader && authHeader.split(' ')[1];

//   if (!token) return res.sendStatus(401); // Unauthorized

//   jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
//     if (err) return res.sendStatus(403); // Forbidden
//     req.user = user;
//     next();
//   });
// }

//const publicKey = fs.readFileSync('./ssh_keys/id_rsa.pub', 'utf8');

// function verifySSHKey(req, res, next) {
//   const clientSignature = req.headers['x-client-signature']; // Signature from the client
//   const clientMessage = req.headers['x-client-message']; // Message signed by the client

//   if (!clientSignature || !clientMessage) {
//       return res.status(401).send('Unauthorized: Missing signature or message');
//   }

//   // Verify the signature using the public key
//   const pki = forge.pki;
//   const publicKeyObject = pki.publicKeyFromPem(publicKey);
//   const md = forge.md.sha256.create();
//   md.update(clientMessage, 'utf8');

//   const isVerified = publicKeyObject.verify(
//       md.digest().bytes(),
//       forge.util.decode64(clientSignature)
//   );

//   if (isVerified) {
//       next(); // Signature is valid, proceed to the next middleware/route
//   } else {
//       res.status(401).send('Unauthorized: Invalid signature');
//   }
// }

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

app.get('/help', (req, res) => {
  const filePath = path.resolve('views','pdfs','pdf.pdf');
  res.sendFile(filePath);
});

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
  console.log(filepath);
  res.download(filepath);
  setTimeout(() => {
    fs.unlink(filepath, (err) => {
        if (err) {
            console.error('Error deleting the file:', err);
            return;
        }
    });
  }, 2500);
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

// Protected API endpoint
app.get('/api/tantargyweb', async (req, res) => {
  try {
    const results = await db.query(
      `SELECT co_workers.birthname, students.neptune_id, email
       FROM co_workers
       INNER JOIN students ON co_workers.tax_number = students.tax_number`
    );
    res.json(results.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  // Validate user credentials (this is just an example, implement your own logic)
  const user = await db.query('SELECT * FROM users WHERE username = $1 AND password = $2', [username, password]);

  if (user.rowCount === 0) {
    return res.sendStatus(401); // Unauthorized
  }

  // User found, generate JWT
  const token = jwt.sign({ username: user.rows[0].username, role: user.rows[0].role }, process.env.JWT_SECRET, { expiresIn: '1h' });
  res.json({ token });
});

app.get('/homepage', async (req, res) => {
  res.render('HomePage.ejs');
});

app.get('/', async (req, res) => {
  res.render('HomePage.ejs');
});

app.get('/bugreport', async (req, res) => {
  res.render('Bugreport.ejs');
});

app.get('/test', async (req, res) => {
  res.render('test.ejs');
});

app.get('/requestdata', async (req, res) => {
  const tablesAndColumns = await getTablesAndColumns();
  res.render('CreateRequest.ejs', { tablesAndColumns });
});

app.get('/querrymaker', async (req, res) => {
  const tablesAndColumns = await getTablesAndColumns();
  res.render('newQuerry.ejs', { tablesAndColumns });
});
  
app.post('/submit-string', (req, res) => {
  const receivedString = req.body;  // Get the string from the form
  console.log(receivedString+'in the app.js');
  printToXls(receivedString);  // Use the received string to generate an XLS file
});


// Endpoint to handle email sending
// Endpoint to handle form submission
app.post('/send-email', upload.array('images', 10), async (req, res) => {
  try {
      const { title, description } = req.body;
      const attachments = req.files.map(file => ({
          filename: file.originalname,
          path: file.path,
      }));

      // Configure the email
      const mailOptions = {
          from: 'torzsdb.bugreport@gmail.com',
          to: 'torzsdb.bugreport@gmail.com',
          subject: `Bug Report: ${title}`,
          text: `Description:\n\n${description}`,
          attachments,
      };

      // Send the email
      await transporter.sendMail(mailOptions);

      // Cleanup uploaded files
      req.files.forEach(file => fs.unlinkSync(file.path));

      res.status(200).send('Bug report submitted successfully!');
  } catch (error) {
      console.error('Error sending email:', error);
      res.status(500).send('Failed to send bug report.');
  }
});
// Endpoint to save the request file
app.post('/save-request', (req, res) => {
  const { fileName, logContent } = req.body;

  if (!fileName || !logContent) {
      return res.status(400).send('Invalid data.');
  }

  // Define the requests folder
  const requestsFolder = path.resolve('requests');
  if (!fs.existsSync(requestsFolder)) {
      fs.mkdirSync(requestsFolder, { recursive: true }); // Create folder if it doesn't exist
  }

  // Save the log file
  const filePath = path.join(requestsFolder, fileName);
  fs.writeFile(filePath, logContent, 'utf8', (err) => {
      if (err) {
          console.error(err);
          return res.status(500).send('Failed to save the request.');
      }
      res.send('Request saved successfully.');
  });
});

// Folder containing the request files
const requestsFolder = path.resolve('requests');

// Endpoint to list request files
app.get('/list-requests', (req, res) => {
  fs.readdir(requestsFolder, (err, files) => {
      if (err) {
          console.error(err);
          return res.status(500).send('Failed to list requests.');
      }

      // Filter out 'accepted_' and 'denied_' files
      const requestFiles = files.filter(file => file.endsWith('.log') && 
          !file.startsWith('accepted_') && !file.startsWith('denied_'));

      // Read the contents of each file
      const requests = requestFiles.map(fileName => {
          const filePath = path.join(requestsFolder, fileName);
          const content = fs.readFileSync(filePath, 'utf-8'); // Read file contents
          return { fileName, content };
      });

      res.json(requests); // Send file names and contents to the client
  });
});
// Endpoint to react to a request
app.post('/react-to-request', (req, res) => {
    const { fileName, action } = req.body;

    if (!fileName || !['accepted', 'denied'].includes(action)) {
        return res.status(400).send('Invalid data.');
    }

    const oldPath = path.join(requestsFolder, fileName);
    const newFileName = `${action}_${fileName}`;
    const newPath = path.join(requestsFolder, newFileName);

    fs.rename(oldPath, newPath, (err) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Failed to process the request.');
        }
        res.send('Request processed successfully.');
    });
});

// Utility function to convert Excel serial date to JavaScript Date
function excelDateToFormattedDate(serial) {
  const utc_days = Math.floor(serial - 25569);
  const utc_value = utc_days * 86400 * 1000; // milliseconds since epoch
  const date_info = new Date(utc_value);

  const year = date_info.getUTCFullYear();
  const month = String(date_info.getUTCMonth() + 1).padStart(2, '0'); // Month is 0-indexed
  const day = String(date_info.getUTCDate()).padStart(2, '0');

  return `${year}.${month}.${day}`; // Return in YYYY.MM.DD format
}

// Function to check if a date string needs to be converted
function isValidDateString(dateString) {
  // Regex pattern to check for various date formats
  const datePattern = /^\d{4}\.\d{2}\.\d{2}$/; // Matches YYYY.MM.DD
  return datePattern.test(dateString);
}

async function downloadAndLoadData(remotePath, localFilePath, tableName) {
  try {
    // Step 2: Download the file (hardcoding the remote path here)
    await sftp.get(remotePath, localFilePath);

    console.log('File downloaded successfully');

    // Step 3: Read the Excel file
    const workbook = xlsx.readFile(localFilePath);
    const sheetName = workbook.SheetNames[0];
    const sheetData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

    fs.unlinkSync(localFilePath);
    console.log(`Deleted local file: ${localFilePath}`);

    // Load data into the co_workers table
    if (sheetData.length > 0) {
      const columns = Object.keys(sheetData[0]);
    
      for (const row of sheetData) {
        // Convert numeric date fields to a proper date format
        for (const key in row) {
          // Check for numeric values that might represent Excel dates
          if (key.toLowerCase().includes("date") && isValidDateString(excelDateToFormattedDate(row[key]))) {
            // Convert Excel serial date to formatted date string
            row[key] = excelDateToFormattedDate(row[key]);
          }
        }
    
        const values = columns.map(column => row[column]);
    
        const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');
        const updateString = columns.map((col, index) => `${col} = $${index + 1}`).join(', ');

        // Assume 'id' is the unique identifier for conflict resolution
        await db.query(
         `
          INSERT INTO ${tableName} (${columns.join(', ')}) 
          VALUES (${placeholders}) 
          ON CONFLICT (id) 
          DO UPDATE SET ${updateString}
          `,
          values
        );
      }
    }

    console.log('Data loaded successfully');
  } catch (error) {
    console.error('Error occurred:', error);
  }
}

cron.schedule('0 3 * * *', () => {
  console.log('Running scheduled task to download and load data');
  downloadAndLoadData('/SAP/SAP_adatok.xlsx','./sftp/SAP_adatok.xlsx', 'co_workers');
  downloadAndLoadData('/Neptun/Neptun_adatok.xlsx','./sftp/Neptun_adatok.xlsx', 'students');
});

app.listen(port,()=>{
    console.log(`A szerver a ${port} porton fut.`);
});
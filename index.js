import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import * as XLSX from 'xlsx/xlsx.mjs';
import fs from "fs";
import path from "path";
import ExcelJS from "exceljs";

const app = express();
const port = 3000;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.text());
app.use(express.static("views"));


const db = new pg.Client({
    user: 'postgres', // PostgreSQL felhasználónév
    host: 'localhost', // PostgreSQL szerver címe
    database: 'Torzsadatbazis', // Adatbázis neve
    password: 'Tobi0424', // Jelszó
    port: 5432, // PostgreSQL alapértelmezett portja
  });

db.connect();

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

app.get('/test', async (req, res) => {
  res.render('TEST.ejs');
});

app.get('/hr', async (req, res) => {
  res.render('HR.ejs');
});

async function printToXls(querrystr) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Query Results');
  console.log(querrystr,'ez maar a funcon belul');
  const res = await db.query(querrystr); // Replace with your actual query
  console.log(res.rows);  // Print the results to the console for debugging
  const columns = Object.keys(res.rows[0]).map(key => ({ header: key, key }));
  worksheet.columns = columns;

  // Add rows to the Excel sheet
  res.rows.forEach(row => {
      worksheet.addRow(row);
  });

  // Write the Excel file
  await workbook.xlsx.writeFile("first.xlsx");
}

  
app.post('/submit-string', (req, res) => {
  const receivedString = req.body;  // Get the string from the form
  console.log('Received string: in the console', receivedString);
  printToXls(receivedString);  // Use the received string to generate an XLS file
});

app.listen(port,()=>{
    console.log(`A szerver a ${port} porton fut.`);
});
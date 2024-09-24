import express from "express";
import bodyParser from "body-parser";
import pg from "pg";

const app = express();
const port = 3000;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
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
      const results = await db.query('SELECT * FROM co_workers');
      res.json(results.rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

app.get('/homepage', async (req, res) => {
  res.render('HomePage.ejs');
});

app.get('/hr', async (req, res) => {
  res.render('HR.ejs');
});

app.listen(port,()=>{
    console.log(`A szerver a ${port} porton fut.`);
});
import Client from 'ssh2-sftp-client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pkg from 'xlsx';
const { readFile, utils } = pkg;

// Get the directory name from the current module's URL
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sftp = new Client();

const config = {
    host: '192.168.1.220',
    port: 22,
    username: 'Taprick',
    password: 'taprick07',
    eadyTimeout: 20000,
};

// Function to fetch and log the contents of the Excel file
async function fetchAndLogExcelFile(remotePath, fileName) {
    try {
        // Connect to the SFTP server
        await sftp.connect(config);
        console.log('Connected to SFTP server.');

        // Define the remote file path
        const remoteFilePath = path.join(remotePath, fileName);
        
        // Define a temporary local file path to store the downloaded file
        const localFilePath = path.join(__dirname, fileName);

        // Download the file from the SFTP server
        await sftp.get(remoteFilePath, localFilePath);
        console.log(`Downloaded ${fileName} to ${localFilePath}.`);

        // Read the Excel file
        const workbook = readFile(localFilePath); // Use readFile directly
        const sheetName = workbook.SheetNames[0]; // Get the first sheet
        const sheetData = utils.sheet_to_json(workbook.Sheets[sheetName]); // Convert to JSON
        
        // Log the contents to the console
        console.log('Contents of the Excel file:', sheetData);
        
        // Clean up: delete the local file after reading
        fs.unlinkSync(localFilePath);
        console.log(`Deleted local file: ${localFilePath}`);

        // Return the SFTP client so the connection can be used later
        return sftp; // Return the sftp client to keep the connection open
    } catch (error) {
        console.error('Error:', error.message);
    }
}

// Example usage of the fetchAndLogExcelFile function
const remotePath = '/SAP'; // Specify the remote path to the SAP folder
const fileName = 'SAP_adatok.xlsx'; // Specify the file name
fetchAndLogExcelFile(remotePath, fileName)
    .then((sftpClient) => {
        console.log('Operation completed successfully. SFTP client remains connected.');
        // You can perform additional operations with sftpClient here
        // Do not call sftpClient.end() to keep it open
    })
    .catch((error) => {
        console.error('Operation failed:', error);
    });
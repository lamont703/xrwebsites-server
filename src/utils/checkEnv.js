require('dotenv').config();

console.log('Checking environment variables:');
console.log('COSMOS_DB_ENDPOINT:', process.env.COSMOS_DB_ENDPOINT);
console.log('COSMOS_DB_KEY:', process.env.COSMOS_DB_KEY ? '[PRESENT]' : '[MISSING]');
console.log('COSMOS_DB_DATABASE:', process.env.COSMOS_DB_DATABASE); 
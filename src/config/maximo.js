const MAXIMO_HOST = process.env.MAXIMO_HOST || 'http://localhost:9080';
const USERNAME = process.env.MAXIMO_USERNAME || 'hahaha';
const PASSWORD = process.env.MAXIMO_PASSWORD || 'hahaha';

const MAXAUTH = Buffer.from(`${USERNAME}:${PASSWORD}`).toString('base64');

module.exports = { MAXIMO_HOST, MAXAUTH };


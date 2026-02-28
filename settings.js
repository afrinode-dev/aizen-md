// Configuration du Bot
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Charger les variables d'environnement
if (fs.existsSync('.env')) {
  dotenv.config({ path: path.join(__dirname, '.env') });
}

export const settings = {
    OWNER_NUMBER: '24176209643',
    OWNER_NAME: "➵ 𝙹𝚞𝚜𝚝 𝚕𝚒𝚘𝚗𝚎𝚕 ➵",
    PREFIX: '.',
    SESSION_ID: 'AIZEN-MD_shzDYbkd',
    DB_AUTH: 'link-_-*',
    BOT_THEME: 'AIZEN',
    LANG: "fr",
    ALIVE_MESSAGE: "Bonjour, je suis en ligne. Comment puis-je vous aider?",
    ALIVE_LOGO: "https://telegra.ph/file/3a2f0c8b3c6f3f5e2d4e1.jpg",
    TIME_ZONE: "Africa/Libreville",
};

export default settings;
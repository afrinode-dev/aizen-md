import {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  jidDecode,
  jidNormalizedUser,
  isJidUser,
  isJidGroup,
  areJidsSameUser,
  getContentType,
  extractMessageContent
} from "gifted-baileys";
import chalk from "chalk";
import fs from "fs-extra";
import path from "path";
import pino from "pino";
import { Boom } from "@hapi/boom";
import { fileURLToPath } from 'url';
import axios from 'axios';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Charger la configuration depuis settings.js
let settings = {};
try {
  settings = (await import('./settings.js')).default;
} catch (error) {
  console.error('❌ Erreur chargement settings.js:', error.message);
  process.exit(1);
}

// =================== CONFIGURATION ===================
const config = {
  PREFIXE_COMMANDE: settings.PREFIX || ".",
  DOSSIER_AUTH: settings.DOSSIER_AUTH || "session",
  LOG_LEVEL: settings.LOG_LEVEL || "info",
  RECONNECT_DELAY: parseInt(settings.RECONNECT_DELAY) || 5000,
  OWNER_NUMBER: settings.OWNER_NUMBER || "",
  SESSION_ID: settings.SESSION_ID || "",
  GITHUB_USERNAME: settings.GITHUB_USERNAME || "afrinode-dev",
  GITHUB_TOKEN: settings.GITHUB_TOKEN || process.env.GITHUB_TOKEN || "",
  PRIVATE_MODE: settings.PRIVATE_MODE || true,
  ALLOWED_USERS: settings.ALLOWED_USERS || []
};

// Couleurs personnalisées
const colors = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    deeppink: '\x1b[38;5;198m',
    reset: '\x1b[0m'
};

const colorize = (text, color) => `${colors[color] || colors.white}${text}${colors.reset}`;

// =================== LOGGER ===================
const logger = pino({
  level: config.LOG_LEVEL,
  transport: {
    target: "pino-pretty",
    options: { colorize: true, ignore: "pid,hostname", translateTime: "HH:MM:ss" }
  },
  base: null
});

// =================== FICHIERS DE DONNÉES ===================
const DB_PATH = "./db/database.json";
const BANNED_PATH = "./db/banned.json";
const PRIVATE_PATH = "./db/private.json";

// Créer le dossier db s'il n'existe pas
if (!fs.existsSync("./db")) {
  fs.mkdirSync("./db", { recursive: true });
}

// Initialiser les fichiers
if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, JSON.stringify({ users: {} }, null, 2));
if (!fs.existsSync(BANNED_PATH)) fs.writeFileSync(BANNED_PATH, JSON.stringify({ banned: [] }, null, 2));
if (!fs.existsSync(PRIVATE_PATH)) fs.writeFileSync(PRIVATE_PATH, JSON.stringify({ 
  enabled: config.PRIVATE_MODE, 
  allowed: config.ALLOWED_USERS 
}, null, 2));

// =================== UTILITAIRES ===================
const getBareNumber = (input) => {
  if (!input) return "";
  // Extraire le numéro sans le suffixe @s.whatsapp.net
  const str = String(input);
  const parts = str.split('@')[0].split(':')[0];
  return parts.replace(/[^0-9]/g, "");
};

const normalizeJid = (jid) => {
  if (!jid) return null;
  const base = String(jid).trim().split(":")[0];
  return base.includes("@") ? base : `${base}@s.whatsapp.net`;
};

const getText = (m) => {
  if (!m?.message) return "";
  
  const msg = m.message;
  const type = getContentType(msg);
  
  if (!type) return "";
  
  const content = extractMessageContent(msg[type]);
  
  return (
    content?.text ||
    content?.caption ||
    content?.selectedButtonId ||
    content?.selectedRowId ||
    content?.selectedId ||
    msg.conversation ||
    msg.extendedTextMessage?.text ||
    msg.imageMessage?.caption ||
    msg.videoMessage?.caption ||
    msg.buttonsResponseMessage?.selectedButtonId ||
    msg.listResponseMessage?.singleSelectReply?.selectedRowId ||
    msg.templateButtonReplyMessage?.selectedId ||
    ""
  );
};

const isOwner = (senderNum, botNumber) => {
  const ownerNum = getBareNumber(config.OWNER_NUMBER);
  return senderNum === ownerNum || senderNum === botNumber;
};

// =================== GESTION DE SESSION GITHUB GIST ===================
const utils = {
  sessionPath: config.DOSSIER_AUTH,

  cleanSession: () => {
    if (fs.existsSync(utils.sessionPath)) {
      fs.rmSync(utils.sessionPath, { recursive: true, force: true });
      console.log(colorize("🧹 Session nettoyée", "cyan"));
    }
  },

  sessionExists: () => fs.existsSync(`${utils.sessionPath}/creds.json`),

  downloadFromGist: async (gistId) => {
    try {
      if (!gistId) throw new Error('ID Gist manquant');
      
      console.log(colorize('🔄 Téléchargement depuis GitHub Gist...', 'yellow'));
      
      if (!fs.existsSync(utils.sessionPath)) {
        fs.mkdirSync(utils.sessionPath, { recursive: true });
      }

      let realGistId = gistId;
      
      if (gistId.includes('AIZEN-MD_')) {
        realGistId = gistId.split('AIZEN-MD_')[1];
      } else if (gistId.includes('/')) {
        realGistId = gistId.split('/').pop().replace('AIZEN-MD_', '');
      }

      realGistId = realGistId.replace(/[^a-zA-Z0-9]/g, '');
      
      if (!realGistId || realGistId.length < 5) {
        throw new Error(`ID Gist invalide: ${realGistId}`);
      }

      console.log(colorize(`📌 ID Gist extrait: ${realGistId}`, 'green'));

      const gistApiUrl = `https://api.github.com/gists/${realGistId}`;
      
      const headers = {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/vnd.github.v3+json'
      };

      if (config.GITHUB_TOKEN) {
        headers['Authorization'] = `token ${config.GITHUB_TOKEN}`;
      }

      const gistResponse = await axios.get(gistApiUrl, {
        timeout: 30000,
        headers: headers
      });

      if (!gistResponse.data || !gistResponse.data.files) {
        throw new Error('Réponse Gist invalide');
      }

      const files = gistResponse.data.files;
      let credsFile = null;
      let credsContent = null;

      for (const [filename, fileData] of Object.entries(files)) {
        if (filename.includes('creds') || filename.endsWith('.json')) {
          credsFile = filename;
          credsContent = fileData.content;
          break;
        }
      }

      if (!credsContent) {
        for (const [filename, fileData] of Object.entries(files)) {
          if (filename.endsWith('.json')) {
            credsFile = filename;
            credsContent = fileData.content;
            break;
          }
        }
      }

      if (!credsContent) {
        const firstFile = Object.values(files)[0];
        if (firstFile) {
          credsFile = Object.keys(files)[0];
          credsContent = firstFile.content;
        }
      }

      if (!credsContent) {
        throw new Error('Aucun fichier trouvé dans le Gist');
      }

      try {
        JSON.parse(credsContent);
      } catch (e) {
        throw new Error('Le contenu du Gist n\'est pas un JSON valide');
      }

      fs.writeFileSync(`${utils.sessionPath}/creds.json`, credsContent);
      console.log(colorize('✅ Session téléchargée depuis GitHub Gist!', 'green'));
      
      return true;

    } catch (error) {
      console.log(colorize(`❌ Erreur téléchargement Gist: ${error.message}`, 'red'));
      return false;
    }
  },

  loadSession: async () => {
    try {
      if (!config.SESSION_ID) {
        console.log(colorize('❌ SESSION_ID manquant dans settings.js', 'red'));
        return false;
      }

      console.log(colorize('🔍 Vérification de la session...', 'yellow'));

      if (utils.sessionExists()) {
        try {
          const creds = JSON.parse(fs.readFileSync(`${utils.sessionPath}/creds.json`, 'utf-8'));
          if (creds && creds.me) {
            console.log(colorize('✅ Session existante valide', 'green'));
            return true;
          } else {
            console.log(colorize('⚠️ Session existante invalide, téléchargement...', 'yellow'));
            return await utils.downloadFromGist(config.SESSION_ID);
          }
        } catch (e) {
          console.log(colorize(`⚠️ Erreur lecture session: ${e.message}`, 'yellow'));
          return await utils.downloadFromGist(config.SESSION_ID);
        }
      }
      
      return await utils.downloadFromGist(config.SESSION_ID);
    } catch (error) {
      console.log(colorize(`❌ Erreur chargement session: ${error.message}`, 'red'));
      return false;
    }
  }
};

// =================== BASE DE DONNÉES ===================
const loadDatabase = () => {
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
  } catch {
    return { users: {} };
  }
};

const saveDatabase = (data) => {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
};

const loadBanned = () => {
  try {
    return JSON.parse(fs.readFileSync(BANNED_PATH, 'utf-8'));
  } catch {
    return { banned: [] };
  }
};

const saveBanned = (data) => {
  fs.writeFileSync(BANNED_PATH, JSON.stringify(data, null, 2));
};

const loadPrivate = () => {
  try {
    return JSON.parse(fs.readFileSync(PRIVATE_PATH, 'utf-8'));
  } catch {
    return { enabled: config.PRIVATE_MODE, allowed: config.ALLOWED_USERS };
  }
};

const savePrivate = (data) => {
  fs.writeFileSync(PRIVATE_PATH, JSON.stringify(data, null, 2));
};

// =================== CHARGER LES COMMANDES ===================
async function loadCommands() {
  global.commands = {};
  const cmdDir = path.join(__dirname, "commands");
  
  if (!fs.existsSync(cmdDir)) {
    fs.mkdirSync(cmdDir, { recursive: true });
    logger.info("Dossier commands créé");
    return;
  }
  
  const files = fs.readdirSync(cmdDir).filter(f => f.endsWith(".js"));
  logger.info(`Chargement de ${files.length} commandes...`);
  
  for (const file of files) {
    try {
      const cmd = await import(path.join(cmdDir, file));
      const command = cmd.default || cmd;
      
      if (command?.name && typeof command.execute === "function") {
        global.commands[command.name.toLowerCase()] = command;
        logger.info(`✅ Commande chargée: ${command.name}`);
      } else {
        logger.warn(`⚠️ ${file} n'a pas de commande valide`);
      }
    } catch (err) {
      logger.error(`❌ Erreur chargement ${file}: ${err.message}`);
    }
  }
  
  logger.info(`📋 Commandes disponibles: ${Object.keys(global.commands).length}`);
}

// =================== AFFICHER BANNIÈRE ===================
const afficherBanner = () => {
  console.clear();
  console.log(colorize(`
╔══════════════════════════════════════╗
║         MON BOT WHATSAPP             ║
║    Connexion via GitHub Gist         ║
╚══════════════════════════════════════╝
  `, "deeppink"));
  console.log(colorize(`📌 GitHub: ${config.GITHUB_USERNAME}`, 'cyan'));
  if (config.GITHUB_TOKEN) {
    console.log(colorize('🔐 Token GitHub: Configuré', 'green'));
  }
};

// =================== START BOT ===================
let reconnectCount = 0;
const MAX_RECONNECT = 10;
let botNumber = null;

async function startBot() {
  try {
    afficherBanner();
    
    console.log(colorize('🚀 Démarrage du bot...', 'yellow'));

    const sessionLoaded = await utils.loadSession();
    if (!sessionLoaded) {
      console.log(colorize('❌ Échec chargement session depuis GitHub Gist', 'red'));
      process.exit(1);
    }

    const { state, saveCreds } = await useMultiFileAuthState(config.DOSSIER_AUTH);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      printQRInTerminal: false,
      logger: pino({ level: "silent" }),
      auth: state,
      browser: ["Ubuntu", "Chrome", "20.0.04"],
      getMessage: async () => {
        return { conversation: '' };
      }
    });

    sock.ev.on("creds.update", saveCreds);

    // === GESTION DE LA CONNEXION ===
    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect } = update;

      if (connection === 'connecting') {
        console.log(colorize('🕗 Connexion en cours...', 'yellow'));
        reconnectCount = 0;
      }

      if (connection === "open") {
        console.log(colorize('✅ Connecté à WhatsApp!', 'green'));
        reconnectCount = 0;

        botNumber = getBareNumber(sock.user?.id);
        global.owner = botNumber;
        
        logger.info(`👑 Owner (appareil connecté): ${botNumber}`);
        logger.info(`👑 Owner number (settings): ${config.OWNER_NUMBER}`);
        
        console.log(colorize(`📱 Bot: ${botNumber}`, 'cyan'));

        await loadCommands();

        const privateData = loadPrivate();
        console.log(colorize(`🔒 Mode privé: ${privateData.enabled ? 'Activé' : 'Désactivé'}`, privateData.enabled ? 'yellow' : 'green'));
        if (privateData.enabled && privateData.allowed.length > 0) {
          console.log(colorize(`👥 Utilisateurs autorisés: ${privateData.allowed.length}`, 'cyan'));
        }

        if (config.OWNER_NUMBER) {
          setTimeout(async () => {
            try {
              const ownerJid = normalizeJid(config.OWNER_NUMBER);
              const privateStatus = privateData.enabled ? 'ACTIVÉ' : 'désactivé';
              const allowedCount = privateData.allowed.length;
              
              await sock.sendMessage(ownerJid, { 
                text: `✅ *Bot connecté!*\n\n📱 Numéro: ${botNumber}\n📦 Commandes: ${Object.keys(global.commands).length}\n🔧 Prefix: ${config.PREFIXE_COMMANDE}\n🔒 Mode privé: ${privateStatus}\n👥 Utilisateurs autorisés: ${allowedCount}\n📌 Session: GitHub Gist\n\nTapez ${config.PREFIXE_COMMANDE}menu pour commencer.`
              });
            } catch (e) {
              logger.warn("Message à l'owner non envoyé:", e.message);
            }
          }, 5000);
        }
      }

      if (connection === "close") {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        
        if (statusCode === DisconnectReason.loggedOut) {
          console.log(colorize('🚨 Session expirée - Nettoyage...', 'yellow'));
          utils.cleanSession();
          process.exit(1);
        } else if (reconnectCount < MAX_RECONNECT) {
          reconnectCount++;
          const delay = Math.min(config.RECONNECT_DELAY * reconnectCount, 60000);
          console.log(colorize(`🔄 Tentative ${reconnectCount}/${MAX_RECONNECT} dans ${delay/1000}s...`, 'yellow'));
          setTimeout(startBot, delay);
        } else {
          console.log(colorize('❌ Maximum de tentatives atteint', 'red'));
          process.exit(1);
        }
      }
    });

    // === GESTION DES MESSAGES ===
    sock.ev.on("messages.upsert", async ({ messages, type }) => {
      console.log("TYPE EVENT:", type)

      if (!messages) return

      for (const m of messages) {
        console.log("MESSAGE BRUT REÇU")

        if (!m.message) continue

        const text = getText(m)
        const from = m.key.remoteJid
        const sender = m.key.participant || from

        console.log("FROM:", from)
        console.log("TEXT:", text)
        console.log("SENDER:", sender)
        console.log("FROM ME:", m.key.fromMe)
        console.log("------------------------")
      }
    });

    return sock;

  } catch (err) {
    console.log(colorize(`❌ Erreur critique: ${err.message}`, 'red'));
    
    if (reconnectCount < MAX_RECONNECT) {
      reconnectCount++;
      setTimeout(startBot, 10000);
    }
  }
}

// =================== GESTION DES ERREURS GLOBALES ===================
process.on("unhandledRejection", (err) => {
  const ignore = ['conflict', 'not-authorized', 'ECONNRESET', 'ETIMEDOUT'];
  if (!ignore.some(x => err.message?.includes(x))) {
    console.log(colorize(`⚠️ Rejection: ${err.message}`, 'yellow'));
  }
});

process.on("uncaughtException", (err) => {
  const ignore = ['ECONNRESET', 'ETIMEDOUT'];
  if (!ignore.some(x => err.message?.includes(x))) {
    console.log(colorize(`⚠️ Exception: ${err.message}`, 'yellow'));
  }
});

process.on('SIGINT', () => {
  console.log(colorize('\n👋 Arrêt...', 'yellow'));
  process.exit(0);
});

// =================== DÉMARRAGE ===================
startBot();
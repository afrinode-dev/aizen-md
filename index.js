import pkg from 'gifted-baileys';
import pino from "pino";
import fs from "fs";
import axios from 'axios';
import { sms } from "./library/myfunc.js";
import { yushi, danscot } from "./library/couleur.js";
import settings from "./settings.js";
import welcomeHandler from './plugins/welcome.js';

const { 
    default: makeWASocket, 
    useMultiFileAuthState,
    DisconnectReason,
    Browsers
} = pkg;

const config = {
  sessionPath: "./Sessions",
  browser: Browsers.ubuntu('Gifted'),
  logLevel: "silent",
  connectTimeoutMs: 60000,
  defaultQueryTimeoutMs: 60000,
  keepAliveIntervalMs: 10000,
  syncFullHistory: false,
  generateHighQualityLinkPreview: true,
  markOnlineOnConnect: true,
  printQRInTerminal: false,
  PREFIXE_COMMANDE: settings.PREFIX || '.'
};

const store = { 
    contacts: {}, 
    chats: {}, 
    messages: {},
    loadMessage: function(jid, id) {
        return this.messages[jid]?.[id];
    },
    bind: function(ev) {
        ev.on('messages.upsert', ({ messages }) => {
            const message = messages[0];
            if (!message?.key?.remoteJid) return;
            if (!this.messages[message.key.remoteJid]) {
                this.messages[message.key.remoteJid] = {};
            }
            this.messages[message.key.remoteJid][message.key.id] = message;
        });
    },
    destroy: function() {
        this.contacts = {};
        this.chats = {};
        this.messages = {};
    }
};

const utils = {
  cleanSession: () => {
    if (fs.existsSync(config.sessionPath)) {
      fs.rmSync(config.sessionPath, { recursive: true, force: true });
      console.log(yushi("🧹 Session nettoyée", "cyan"));
    }
  },

  sessionExists: () => fs.existsSync(`${config.sessionPath}/creds.json`),

  log: (message, color = "white", level = "INFO") => {
    console.log(yushi(`[${level}] ${message}`, color));
  },

  notifyOwner: async (bot, text) => {
    try {
      if (!bot) return;
      await bot.sendMessage(`${settings.OWNER_NUMBER}@s.whatsapp.net`, { text });
      console.log(yushi(`📤 Notif envoyée`, "blue"));
    } catch (err) {
      console.log(yushi(`❌ Erreur notif: ${err.message}`, "red"));
    }
  },

  downloadFromPastebin: async (pasteId) => {
    try {
      if (!pasteId) {
        throw new Error('ID Pastebin manquant');
      }

      console.log(yushi('🔄 Téléchargement depuis Pastebin...', 'yellow'));
      console.log(yushi(`📊 ID: ${pasteId}`, 'cyan'));
      
      if (!fs.existsSync(config.sessionPath)) {
        fs.mkdirSync(config.sessionPath, { recursive: true });
      }

      let realPasteId = pasteId;
      
      if (pasteId.includes('AIZEN-MD_')) {
        realPasteId = pasteId.split('AIZEN-MD_')[1];
      }
      
      if (pasteId.includes('/')) {
        const parts = pasteId.split('/');
        const lastPart = parts[parts.length - 1];
        if (lastPart.includes('AIZEN-MD_')) {
          realPasteId = lastPart.split('AIZEN-MD_')[1];
        } else {
          realPasteId = lastPart;
        }
      }

      realPasteId = realPasteId.replace(/[^a-zA-Z0-9]/g, '');
      
      if (!realPasteId || realPasteId.length < 5) {
        throw new Error(`ID Pastebin invalide après extraction: ${realPasteId}`);
      }

      console.log(yushi(`📌 ID extrait: ${realPasteId}`, 'green'));

      const pastebinUrl = `https://pastebin.com/raw/${realPasteId}`;
      console.log(yushi(`📡 Téléchargement depuis: ${pastebinUrl}`, 'cyan'));

      const response = await axios.get(pastebinUrl, {
        timeout: 30000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      if (!response.data) {
        throw new Error('Réponse vide de Pastebin');
      }

      let content = response.data;
      
      if (typeof content !== 'string') {
        content = JSON.stringify(content);
      }

      try {
        JSON.parse(content);
        console.log(yushi('✅ Contenu JSON valide', 'green'));
      } catch (e) {
        if (content.includes('<')) {
          const jsonMatch = content.match(/(\{[\s\S]*\})/);
          if (jsonMatch && jsonMatch[0]) {
            content = jsonMatch[0];
          } else {
            const firstBrace = content.indexOf('{');
            const lastBrace = content.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
              content = content.substring(firstBrace, lastBrace + 1);
            }
          }
        }
        
        try {
          JSON.parse(content);
        } catch (e2) {
          throw new Error('Le contenu téléchargé n\'est pas un fichier JSON valide');
        }
      }

      fs.writeFileSync(`${config.sessionPath}/creds.json`, content);
      console.log(yushi('✅ Session téléchargée avec succès depuis Pastebin!', 'green'));
      
      return true;

    } catch (error) {
      console.log(yushi(`❌ Erreur téléchargement Pastebin: ${error.message}`, 'red'));
      
      try {
        if (pasteId.includes('pastebin.com')) {
          let directUrl = pasteId;
          if (!directUrl.includes('/raw/')) {
            const rawId = pasteId.split('/').pop();
            directUrl = `https://pastebin.com/raw/${rawId}`;
          }
          
          const response = await axios.get(directUrl, { timeout: 30000 });
          
          if (response.data) {
            let content = response.data;
            if (typeof content !== 'string') {
              content = JSON.stringify(content);
            }
            fs.writeFileSync(`${config.sessionPath}/creds.json`, content);
            return true;
          }
        }
      } catch (altError) {
        console.log(yushi(`❌ Méthode alternative échouée: ${altError.message}`, 'red'));
      }
      
      return false;
    }
  },

  loadSessionFromSettings: async () => {
    try {
      if (!settings.SESSION_ID) {
        console.log(yushi('❌ Erreur Critique: Aucune SESSION_ID dans settings.js', 'red'));
        return false;
      }

      console.log(yushi('🔍 Session ID trouvé', 'green'));
      
      if (utils.sessionExists()) {
        const stats = fs.statSync(`${config.sessionPath}/creds.json`);
        const fileAge = (Date.now() - stats.mtimeMs) / 1000 / 60;
        
        if (fileAge < 5) {
          console.log(yushi('✅ Session récente détectée, utilisation directe', 'green'));
          return true;
        }
      }
      
      return await utils.downloadFromPastebin(settings.SESSION_ID);
    } catch (error) {
      console.log(yushi(`❌ Erreur chargement: ${error.message}`, 'red'));
      return false;
    }
  }
};

let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 50;
const RECONNECT_DELAY = 5000;

async function reconnectWithRetry() {
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        console.log(yushi('🚨 Tentatives max atteintes. Arrêt...', "red"));
        process.exit(1);
    }

    reconnectAttempts++;
    const delay = Math.min(RECONNECT_DELAY * Math.pow(2, reconnectAttempts - 1), 300000);
    
    console.log(yushi(`🔄 Tentative ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} dans ${delay}ms...`, "yellow"));
    
    setTimeout(async () => {
        try {
            await startBot();
        } catch (error) {
            console.log(yushi(`❌ Échec: ${error.message}`, "red"));
            reconnectWithRetry();
        }
    }, delay);
}

async function initBot() {
  try {
    console.log(yushi("🔍 Initialisation du bot...", "yellow"));
    
    const { state, saveCreds } = await useMultiFileAuthState(config.sessionPath);

    if (utils.sessionExists()) {
      console.log(yushi("🔍 Session valide détectée", "green"));
    } else {
      console.log(yushi("❌ Aucune session trouvée après téléchargement", "red"));
      process.exit(1);
    }

    const bot = makeWASocket({
      auth: state,
      browser: config.browser,
      logger: pino({ level: config.logLevel }),
      markOnlineOnConnect: config.markOnlineOnConnect,
      syncFullHistory: config.syncFullHistory,
      generateHighQualityLinkPreview: config.generateHighQualityLinkPreview,
      connectTimeoutMs: config.connectTimeoutMs,
      defaultQueryTimeoutMs: config.defaultQueryTimeoutMs,
      keepAliveIntervalMs: config.keepAliveIntervalMs,
      printQRInTerminal: config.printQRInTerminal,
      getMessage: async (key) => {
          if (store) {
              const msg = store.loadMessage(key.remoteJid, key.id);
              return msg?.message || undefined;
          }
          return undefined;
      }
    });

    store.bind(bot.ev);

    bot.ev.on("creds.update", () => {
      saveCreds();
      console.log(yushi("🔑 Credentials mises à jour", "blue"));
    });

    bot.sendText = (jid, text, quoted = null) => 
      bot.sendMessage(jid, { text }, { quoted });

    return { bot, saveCreds };
  } catch (err) {
    console.log(yushi(`❌ Erreur init: ${err.message}`, "red"));
    throw err;
  }
}

const getBareNumber = (jid) => {
  if (!jid) return '';
  return jid.split('@')[0].split(':')[0];
};

const getText = (m) => {
  if (!m.message) return '';
  
  const messageTypes = [
    'conversation',
    'imageMessage',
    'videoMessage',
    'extendedTextMessage',
    'documentMessage',
    'audioMessage',
    'stickerMessage'
  ];
  
  for (const type of messageTypes) {
    if (m.message[type]?.text) return m.message[type].text;
    if (m.message[type]?.caption) return m.message[type].caption;
  }
  
  if (m.message.conversation) return m.message.conversation;
  
  return '';
};

function setupHandlers(bot) {
  bot.ev.on('group-participants.update', async (update) => {
    await welcomeHandler(bot, update);
  });

  bot.ev.on("messages.upsert", async ({ messages }) => {
    const m = messages?.[0];
    if (!m?.message) return;
    if (m.key.fromMe) return;

    const from = m.key.remoteJid;
    const sender = m.key.participant || from;
    const senderNum = getBareNumber(sender);
    const text = getText(m);

    if (!text) return;
    if (from === "status@broadcast") return;

    if (!text.startsWith(config.PREFIXE_COMMANDE)) return;

    const args = text.slice(config.PREFIXE_COMMANDE.length).trim().split(/ +/);
    const commandName = args.shift()?.toLowerCase();

    console.log("MESSAGE REÇU :", text);
    
    const processedM = sms(bot, m, store);
    
    const handler = await import("./CaseHandler.js");
    handler.default(bot, processedM, { messages }, store);
  });
}

function setupConnection(bot) {
  bot.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect } = update;
    
    if (connection === "connecting") {
      console.log(yushi("🕗 Connexion en cours...", "yellow"));
      reconnectAttempts = 0;
    }

    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      console.log(yushi(`🔻 Déconnexion - Code: ${statusCode}`, "red"));
      
      if (statusCode === DisconnectReason.loggedOut) {
        console.log(yushi("🚨 Session expirée - Nettoyage...", "yellow"));
        utils.cleanSession();
        process.exit(1);
      } else {
        console.log(yushi("🔄 Reconnexion...", "yellow"));
        setTimeout(() => reconnectWithRetry(), RECONNECT_DELAY);
      }
      
      await utils.notifyOwner(bot, `🔻 Bot déconnecté (code: ${statusCode})`);
      
    } else if (connection === "open") {
      console.log(yushi("✅ Connexion établie avec succès!", "green"));
      reconnectAttempts = 0;
      
      const botNumber = bot.user?.id?.split(':')[0] || 'Inconnu';
      
      setTimeout(async () => {
        try {
          const welcomeMsg = `🤖 *AIZEN BOT - CONNEXION ÉTABLIE* 

📊 **Statut Système:**
• Session: ${settings.SESSION_ID ? '✅ Chargée (Pastebin)' : '❌ Manquante'}
• Mode: Automatique
• Numéro: ${botNumber}
• Status: ✅ Connecté
• Préfixe: ${config.PREFIXE_COMMANDE}

🚀 *Bot prêt et opérationnel*`;

          await utils.notifyOwner(bot, welcomeMsg);
        } catch (err) {
          console.log(yushi(`❌ Erreur notif: ${err.message}`, "red"));
        }
      }, 3000);
    }
  });
}

async function startBot() {
  try {
    const sessionLoaded = await utils.loadSessionFromSettings();
    
    if (!sessionLoaded) {
      console.log(yushi('\n❌ ÉCHEC DU TÉLÉCHARGEMENT DE LA SESSION', 'red'));
      process.exit(1);
    }

    const { bot } = await initBot();
    setupHandlers(bot);
    setupConnection(bot);

    return bot;
  } catch (err) {
    console.log(yushi(`❌ Erreur critique: ${err.message}`, "red"));
    setTimeout(() => startBot(), 10000);
  }
}

console.clear();
console.log(yushi(`
╔══════════════════════════════════════╗
║         AIZEN BOT v.0.0.9            ║
║    CONNEXION VIA PASTEBIN UNIQUEMENT ║
║  🔐 Format: AIZEN-MD_xxxx             ║
║  📁 Source: settings.js               ║
╚══════════════════════════════════════╝
`, "deeppink"));

process.on('SIGINT', async () => {
  console.log(yushi('\n\n👋 Arrêt du bot...', 'yellow'));
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log(yushi('\n\n👋 Arrêt du bot...', 'yellow'));
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  const e = String(err);
  const ignore = [
    "conflict", "not-authorized", "Socket connection timeout", 
    "rate-overlimit", "Connection Closed", "Timed Out", 
    "Value not found", "Stream Errored", "statusCode: 515", 
    "statusCode: 503"
  ];
  if (!ignore.some(x => e.includes(x))) {
    console.log(yushi(`⚠️ Exception non gérée: ${err.message}`, "yellow"));
  }
});

startBot();

export { startBot, utils, config, store };
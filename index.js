const dotenv = require('dotenv');
dotenv.config();

const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    DisconnectReason,
    Browsers,
    jidDecode,
    jidNormalizedUser,
    isJidUser,
    isJidGroup,
    isJidBroadcast,
    isJidStatusBroadcast,
    isLidUser,
    areJidsSameUser,
    getContentType,
    extractMessageContent,
    generateMessageID
} = require('gifted-baileys');

const chalk = require('chalk');
const fs = require('fs-extra');
const path = require('path');
const pino = require('pino');
const { Boom } = require('@hapi/boom');
const axios = require('axios');

// __dirname est déjà défini en CommonJS
// Charger la configuration depuis settings.js
let settings = {};
try {
    settings = require('./settings.js');
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
    SESSION_ID: settings.SESSION_ID || "",
    GITHUB_USERNAME: settings.GITHUB_USERNAME || "afrinode-dev",
    GITHUB_TOKEN: settings.GITHUB_TOKEN || process.env.GITHUB_TOKEN || ""
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
const ACCES_PATH = "./db/acces.json";
const ANTILINKS_PATH = "./db/antilinks.json";

// Créer le dossier db s'il n'existe pas
if (!fs.existsSync("./db")) {
    fs.mkdirSync("./db", { recursive: true });
}

// Initialiser les fichiers
if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, JSON.stringify({ users: {} }, null, 2));
if (!fs.existsSync(BANNED_PATH)) fs.writeFileSync(BANNED_PATH, JSON.stringify({ banned: [] }, null, 2));
if (!fs.existsSync(PRIVATE_PATH)) fs.writeFileSync(PRIVATE_PATH, JSON.stringify({
    enabled: false,
    allowedIds: []
}, null, 2));
if (!fs.existsSync(ACCES_PATH)) fs.writeFileSync(ACCES_PATH, JSON.stringify({
    authorizedIds: []
}, null, 2));
if (!fs.existsSync(ANTILINKS_PATH)) fs.writeFileSync(ANTILINKS_PATH, JSON.stringify({
    antipromote: { groupes: {} },
    antidemote: { groupes: {} },
    antilink: { groupes: {} },
    antilink_whatsapp: { groupes: {} }
}, null, 2));

// =================== UTILITAIRES ===================
const getBareNumber = (input) => {
    if (!input) return "";

    let number = String(input);

    // Enlever @s.whatsapp.net
    number = number.split("@")[0];

    // Enlever le device ID (ex: :12)
    number = number.split(":")[0];

    // Enlever "lid" si présent (pour les comptes WhatsApp Business)
    if (number.includes('lid')) {
        number = number.replace('lid', '');
    }

    // Garder uniquement les chiffres
    number = number.replace(/[^0-9]/g, "");

    return number;
};

const normalizeJid = (jid) => {
    if (!jid) return null;
    const base = String(jid).trim().split(":")[0];
    return base.includes("@") ? base : `${base}@s.whatsapp.net`;
};

const getText = (m) => {
    if (!m?.message) return "";

    const msg = m.message;
    return (
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

// Nettoyer un JID pour obtenir l'ID pur (sans @, sans :)
const cleanId = (jid) => {
    if (!jid) return null;
    return jid.split('@')[0].split(':')[0];
};

// Expressions régulières pour les liens
const LINK_REGEX = /(https?:\/\/[^\s]+)|(www\.[^\s]+)|([a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(?:\/[^\s]*)?)/gi;
const WHATSAPP_LINK_REGEX = /(chat\.whatsapp\.com\/[a-zA-Z0-9]+)|(whatsapp\.com\/channel\/[a-zA-Z0-9]+)|(invite\.whatsapp\.com\/[a-zA-Z0-9]+)/gi;

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

            // Extraire l'ID du Gist
            if (gistId.includes('AIZEN-MD_')) {
                realGistId = gistId.split('AIZEN-MD_')[1];
            } else if (gistId.includes('/')) {
                realGistId = gistId.split('/').pop().replace('AIZEN-MD_', '');
            }

            // Nettoyer l'ID
            realGistId = realGistId.replace(/[^a-zA-Z0-9]/g, '');

            if (!realGistId || realGistId.length < 5) {
                throw new Error(`ID Gist invalide: ${realGistId}`);
            }

            console.log(colorize(`📌 ID Gist extrait: ${realGistId}`, 'green'));

            // Construire l'URL de l'API GitHub
            const gistApiUrl = `https://api.github.com/gists/${realGistId}`;

            console.log(colorize(`🌐 URL API: ${gistApiUrl}`, 'cyan'));

            // Configuration des headers
            const headers = {
                'User-Agent': 'Mozilla/5.0',
                'Accept': 'application/vnd.github.v3+json'
            };

            if (config.GITHUB_TOKEN) {
                headers['Authorization'] = `token ${config.GITHUB_TOKEN}`;
                console.log(colorize('🔐 Authentification avec token GitHub', 'green'));
            }

            // Récupérer les informations du Gist
            const gistResponse = await axios.get(gistApiUrl, {
                timeout: 30000,
                headers: headers
            });

            if (!gistResponse.data || !gistResponse.data.files) {
                throw new Error('Réponse Gist invalide');
            }

            // Chercher le fichier creds.json
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

            console.log(colorize(`📄 Fichier trouvé: ${credsFile}`, 'green'));

            // Vérifier le JSON
            try {
                JSON.parse(credsContent);
            } catch (e) {
                throw new Error('Le contenu du Gist n\'est pas un JSON valide');
            }

            // Sauvegarder
            fs.writeFileSync(`${utils.sessionPath}/creds.json`, credsContent);
            console.log(colorize('✅ Session téléchargée depuis GitHub Gist!', 'green'));

            return true;

        } catch (error) {
            console.log(colorize(`❌ Erreur téléchargement Gist: ${error.message}`, 'red'));
            if (error.response) {
                console.log(colorize(`📌 Status: ${error.response.status}`, 'red'));
            }
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
        return { enabled: false, allowedIds: [] };
    }
};

const savePrivate = (data) => {
    fs.writeFileSync(PRIVATE_PATH, JSON.stringify(data, null, 2));
};

const loadAcces = () => {
    try {
        return JSON.parse(fs.readFileSync(ACCES_PATH, 'utf-8'));
    } catch {
        return { authorizedIds: [] };
    }
};

const saveAcces = (data) => {
    fs.writeFileSync(ACCES_PATH, JSON.stringify(data, null, 2));
};

const loadAntilinks = () => {
    try {
        return JSON.parse(fs.readFileSync(ANTILINKS_PATH, 'utf-8'));
    } catch {
        return {
            antipromote: { groupes: {} },
            antidemote: { groupes: {} },
            antilink: { groupes: {} },
            antilink_whatsapp: { groupes: {} }
        };
    }
};

const saveAntilinks = (data) => {
    fs.writeFileSync(ANTILINKS_PATH, JSON.stringify(data, null, 2));
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
            // Chargement synchrone en CommonJS
            const cmd = require(path.join(cmdDir, file));
            const command = cmd.default || cmd; // supporte les commandes en ES module ou CommonJS

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
    } else {
        console.log(colorize('⚠️ Token GitHub: Non configuré (Gists publics uniquement)', 'yellow'));
    }
};

// =================== COMMANDE ACCES ===================
const accesCommand = {
    name: "acces",
    description: "Gérer les utilisateurs autorisés à utiliser les commandes owner (répondez à leur message)",
    ownerOnly: true,

    execute: async (sock, m, args, from, context) => {
        // Vérifier que c'est en privé
        if (from.endsWith('@g.us')) {
            return await sock.sendMessage(from, {
                text: '❌ Cette commande est utilisable uniquement en privé.'
            }, { quoted: m });
        }

        // Vérifier si c'est une réponse à un message
        const quotedMessage = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const quotedParticipant = m.message?.extendedTextMessage?.contextInfo?.participant;
        const quotedJid = quotedParticipant || m.message?.extendedTextMessage?.contextInfo?.remoteJid;

        const accesConfig = loadAcces();
        const subCommand = args[0]?.toLowerCase();

        // Afficher la liste des autorisés
        if (!subCommand || subCommand === 'list') {
            let list = '👥 *Utilisateurs autorisés aux commandes owner*\n\n';

            if (accesConfig.authorizedIds.length === 0) {
                list += 'Aucun utilisateur autorisé.';
            } else {
                accesConfig.authorizedIds.forEach((id, i) => {
                    list += `${i + 1}. ${id}\n`;
                });
            }

            list += `\n\n*Comment utiliser:*\n`;
            list += `▸ *Répondez* au message de quelqu'un avec ${context.prefix}acces add\n`;
            list += `▸ *Répondez* au message de quelqu'un avec ${context.prefix}acces remove\n`;
            list += `▸ ${context.prefix}acces list - Voir la liste\n`;
            list += `▸ ${context.prefix}acces clear - Supprimer tous les IDs`;

            return await sock.sendMessage(from, { text: list }, { quoted: m });
        }

        // Ajouter un ID en répondant à un message
        if (subCommand === 'add') {
            // Vérifier qu'on répond à un message
            if (!quotedMessage) {
                return await sock.sendMessage(from, {
                    text: '❌ Veuillez répondre au message de la personne que vous voulez autoriser.'
                }, { quoted: m });
            }

            const targetId = cleanId(quotedJid);

            if (targetId === context.botId) {
                return await sock.sendMessage(from, {
                    text: '⚠️ Le bot est déjà propriétaire par défaut.'
                }, { quoted: m });
            }

            if (accesConfig.authorizedIds.includes(targetId)) {
                return await sock.sendMessage(from, {
                    text: `⚠️ L'utilisateur est déjà dans la liste des autorisés.`
                }, { quoted: m });
            }

            accesConfig.authorizedIds.push(targetId);
            saveAcces(accesConfig);

            return await sock.sendMessage(from, {
                text: `✅ Utilisateur ajouté à la liste des autorisés.`
            }, { quoted: m });
        }

        // Supprimer un ID en répondant à un message
        if (subCommand === 'remove') {
            // Vérifier qu'on répond à un message
            if (!quotedMessage) {
                return await sock.sendMessage(from, {
                    text: '❌ Veuillez répondre au message de la personne que vous voulez retirer.'
                }, { quoted: m });
            }

            const targetId = cleanId(quotedJid);
            const index = accesConfig.authorizedIds.indexOf(targetId);

            if (index === -1) {
                return await sock.sendMessage(from, {
                    text: `❌ Cet utilisateur n'est pas dans la liste des autorisés.`
                }, { quoted: m });
            }

            accesConfig.authorizedIds.splice(index, 1);
            saveAcces(accesConfig);

            return await sock.sendMessage(from, {
                text: `✅ Utilisateur retiré de la liste des autorisés.`
            }, { quoted: m });
        }

        // Supprimer tous les IDs
        if (subCommand === 'clear') {
            accesConfig.authorizedIds = [];
            saveAcces(accesConfig);
            return await sock.sendMessage(from, {
                text: '✅ Tous les IDs autorisés ont été supprimés.'
            }, { quoted: m });
        }

        // Commande inconnue
        return await sock.sendMessage(from, {
            text: `❌ Commande inconnue. Tapez ${context.prefix}acces pour voir les options.`
        }, { quoted: m });
    }
};

// Ajouter la commande acces aux commandes globales
global.commands = global.commands || {};
global.commands.acces = accesCommand;

// =================== START BOT ===================
let reconnectCount = 0;
const MAX_RECONNECT = 10;

async function startBot() {
    try {
        afficherBanner();

        console.log(colorize('🚀 Démarrage du bot...', 'yellow'));

        // Charger la session
        const sessionLoaded = await utils.loadSession();
        if (!sessionLoaded) {
            console.log(colorize('❌ Échec chargement session depuis GitHub Gist', 'red'));
            console.log(colorize('💡 Vérifiez votre SESSION_ID dans settings.js', 'yellow'));
            process.exit(1);
        }

        const { state, saveCreds } = await useMultiFileAuthState(config.DOSSIER_AUTH);
        const { version } = await fetchLatestBaileysVersion();

        const sock = makeWASocket({
            version,
            printQRInTerminal: false,
            logger: pino({ level: "silent" }),
            auth: state,
            browser: Browsers.ubuntu('AIZEN'), // Utilisation de Browsers depuis gifted-baileys
            msgRetryCounterCache: new Map(),
            shouldIgnoreJid: (jid) => jid.endsWith('@broadcast'),
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

                // Afficher les informations du bot
                const botNumber = getBareNumber(sock.user?.id);
                const botId = cleanId(sock.user?.id);

                console.log(colorize(`📱 Bot: ${botNumber}`, 'cyan'));
                console.log(colorize(`🆔 Bot ID: ${botId}`, 'cyan'));

                // Charger les commandes
                await loadCommands();

                // Ajouter la commande acces aux commandes
                global.commands.acces = accesCommand;
            }

            if (connection === "close") {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const errorMsg = lastDisconnect?.error?.message || 'Inconnu';

                console.log(colorize(`🔻 Déconnexion - Code: ${statusCode}`, 'red'));
                console.log(colorize(`📌 Raison: ${errorMsg}`, 'yellow'));

                if (statusCode === DisconnectReason.loggedOut) {
                    console.log(colorize('🚨 Session expirée - Nettoyage...', 'yellow'));
                    utils.cleanSession();
                    process.exit(1);
                } else if (reconnectCount < MAX_RECONNECT) {
                    reconnectCount++;
                    const delay = Math.min(config.RECONNECT_DELAY * reconnectCount, 60000);
                    console.log(colorize(`🔄 Tentative ${reconnectCount}/${MAX_RECONNECT} dans ${delay / 1000}s...`, 'yellow'));
                    setTimeout(startBot, delay);
                } else {
                    console.log(colorize('❌ Maximum de tentatives atteint', 'red'));
                    process.exit(1);
                }
            }
        });

        // === GESTION DES MISES À JOUR DU GROUPE (ANTI-PROMOTE / ANTI-DEMOTE) ===
        sock.ev.on('group-participants.update', async (update) => {
            const { id: groupId, participants, action } = update;

            if (!['promote', 'demote'].includes(action)) return;

            const antilinks = loadAntilinks();
            const isAntiPromote = antilinks.antipromote?.groupes?.[groupId] === true;
            const isAntiDemote = antilinks.antidemote?.groupes?.[groupId] === true;

            if (action === 'promote' && !isAntiPromote) return;
            if (action === 'demote' && !isAntiDemote) return;

            try {
                const metadata = await sock.groupMetadata(groupId);

                // ✅ SOLUTION : Les groupes utilisent @lid (nouveau système WhatsApp)
                // On identifie le bot en cherchant son LID dans les données de session
                // OU en se basant sur sock.authState qui contient le mapping lid <-> numéro

                // Méthode 1 : Chercher via sock.user (qui peut avoir un lid aussi)
                const botLid = sock.user?.lid?.split(':')[0] + '@lid';
                const botPhone = sock.user?.id?.split(':')[0].split('@')[0];

                console.log('🤖 botLid:', botLid);
                console.log('📱 botPhone:', botPhone);
                console.log('👥 Participants:', metadata.participants.map(p => `${p.id}(${p.admin})`));

                // Chercher le bot parmi les participants
                let botParticipant = null;

                // Tentative 1 : via le LID direct
                if (sock.user?.lid) {
                    const lidRaw = sock.user.lid.split(':')[0].split('@')[0];
                    botParticipant = metadata.participants.find(p =>
                        p.id.split(':')[0].split('@')[0] === lidRaw
                    );
                    if (botParticipant) console.log('✅ Bot trouvé via LID:', botParticipant.id);
                }

                // Tentative 2 : via authState (mapping lid <-> jid)
                if (!botParticipant && sock.authState?.creds?.me?.lid) {
                    const credsLid = sock.authState.creds.me.lid.split(':')[0].split('@')[0];
                    botParticipant = metadata.participants.find(p =>
                        p.id.split(':')[0].split('@')[0] === credsLid
                    );
                    if (botParticipant) console.log('✅ Bot trouvé via authState LID:', botParticipant.id);
                }

                // Tentative 3 : via state.creds
                if (!botParticipant) {
                    const { state } = await useMultiFileAuthState(config.DOSSIER_AUTH);
                    const credsLid = state?.creds?.me?.lid?.split(':')[0].split('@')[0];
                    if (credsLid) {
                        botParticipant = metadata.participants.find(p =>
                            p.id.split(':')[0].split('@')[0] === credsLid
                        );
                        if (botParticipant) console.log('✅ Bot trouvé via state LID:', botParticipant.id);
                    }
                }

                // Tentative 4 : Supposer que le bot est le superadmin
                // (le créateur du groupe est toujours superadmin, mais le bot peut être admin)
                // On skip cette méthode car trop risquée

                if (!botParticipant) {
                    console.log(colorize('⚠️ Bot introuvable — groupe utilise @lid non mappé', 'yellow'));
                    // FALLBACK : on suppose que le bot est admin et on agit quand même
                    // car si le bot reçoit l'événement, c'est qu'il est dans le groupe
                    console.log(colorize('💡 Tentative action sans vérification admin...', 'cyan'));

                    for (const user of participants) {
                        try {
                            if (action === 'promote') {
                                await sock.groupParticipantsUpdate(groupId, [user], 'demote');
                                await sock.sendMessage(groupId, {
                                    text: `⚠️ *ANTI-PROMOTION*\n\n@${user.split('@')[0]} a été automatiquement démoté.`,
                                    mentions: [user]
                                });
                                console.log(colorize(`✅ Anti-promote (fallback): ${user} démoté`, 'green'));
                            } else if (action === 'demote') {
                                await sock.groupParticipantsUpdate(groupId, [user], 'promote');
                                await sock.sendMessage(groupId, {
                                    text: `⚠️ *ANTI-DÉMOTION*\n\n@${user.split('@')[0]} a été automatiquement remis admin.`,
                                    mentions: [user]
                                });
                                console.log(colorize(`✅ Anti-demote (fallback): ${user} repromu`, 'green'));
                            }
                        } catch (e) {
                            console.log(colorize(`❌ Erreur action sur ${user}: ${e.message}`, 'red'));
                        }
                    }
                    return;
                }

                const botIsAdmin = botParticipant.admin === 'admin' || botParticipant.admin === 'superadmin';

                if (!botIsAdmin) {
                    console.log(colorize(`⚠️ Bot non admin dans ${groupId}`, 'yellow'));
                    return;
                }

                const botLidFull = botParticipant.id;

                for (const user of participants) {
                    // Ne pas agir sur le bot lui-même
                    if (user === botLidFull) continue;

                    try {
                        if (action === 'promote') {
                            await sock.groupParticipantsUpdate(groupId, [user], 'demote');
                            await sock.sendMessage(groupId, {
                                text: `⚠️ *ANTI-PROMOTION*\n\n@${user.split('@')[0]} a été automatiquement démoté.`,
                                mentions: [user]
                            });
                            console.log(colorize(`✅ Anti-promote: ${user} démoté`, 'green'));
                        } else if (action === 'demote') {
                            await sock.groupParticipantsUpdate(groupId, [user], 'promote');
                            await sock.sendMessage(groupId, {
                                text: `⚠️ *ANTI-DÉMOTION*\n\n@${user.split('@')[0]} a été automatiquement remis admin.`,
                                mentions: [user]
                            });
                            console.log(colorize(`✅ Anti-demote: ${user} repromu`, 'green'));
                        }
                    } catch (e) {
                        console.log(colorize(`❌ Erreur sur ${user}: ${e.message}`, 'red'));
                    }
                }

            } catch (err) {
                console.log(colorize(`❌ Erreur anti promote/demote: ${err.message}`, 'red'));
            }

        });

        // === GESTION DES MESSAGES ===
        sock.ev.on("messages.upsert", async ({ messages }) => {
            const msg = messages?.[0];
            if (!msg?.message) return;

            // === DÉTECTION ULTRA SIMPLE ===
            const from = msg.key.remoteJid;
            if (!from) return;

            const isGroup = from.endsWith('@g.us');

            const senderJid = msg.key.fromMe
                ? sock.user.id
                : isGroup
                    ? msg.key.participant
                    : from;

            if (!senderJid) return;

            // Nettoyer les IDs
            const cleanSender = cleanId(senderJid);
            const botId = cleanId(sock.user.id);

            // Vérifier si c'est le propriétaire (le bot lui-même)
            const isOwner = cleanSender === botId;

            // Charger la liste des IDs autorisés
            const accesConfig = loadAcces();
            const isAuthorized = accesConfig.authorizedIds.includes(cleanSender);

            // Un utilisateur peut utiliser les commandes owner si:
            // - C'est le propriétaire (bot lui-même) OU
            // - Il est dans la liste des autorisés
            const canUseOwnerCommands = isOwner || isAuthorized;

            const text = getText(msg);

            // Ignorer les status
            if (from === "status@broadcast") return;

            // === ANTI-LIEN (TRAITEMENT AUTOMATIQUE) ===
            if (isGroup && text && !msg.key.fromMe) {
                const antilinks = loadAntilinks();
                const groupId = from;

                try {
                    // Vérifier si le bot est admin
                    const groupMetadata = await sock.groupMetadata(groupId);
                    const botNumber = sock.user.id.split(':')[0] + '@s.whatsapp.net';
                    const botIsAdmin = groupMetadata.participants.some(p => p.id === botNumber && (p.admin === 'admin' || p.admin === 'superadmin'));

                    if (botIsAdmin) {
                        // Vérifier l'anti-lien général
                        const isAntiLinkActive = antilinks.antilink?.groupes?.[groupId] === true;
                        // Vérifier l'anti-lien WhatsApp
                        const isAntiLinkWaActive = antilinks.antilink_whatsapp?.groupes?.[groupId] === true;

                        let hasLink = false;
                        let linkType = '';

                        if (isAntiLinkActive) {
                            // Vérifier tous les types de liens
                            if (LINK_REGEX.test(text)) {
                                hasLink = true;
                                linkType = 'général';
                            }
                        }

                        if (isAntiLinkWaActive && !hasLink) {
                            // Vérifier uniquement les liens WhatsApp
                            WHATSAPP_LINK_REGEX.lastIndex = 0; // Réinitialiser le regex
                            if (WHATSAPP_LINK_REGEX.test(text)) {
                                hasLink = true;
                                linkType = 'WhatsApp';
                            }
                        }

                        if (hasLink) {
                            // Supprimer le message
                            await sock.sendMessage(groupId, {
                                delete: msg.key
                            });

                            // Envoyer un avertissement
                            await sock.sendMessage(groupId, {
                                text: `⚠️ @${cleanSender}, les liens ${linkType} ne sont pas autorisés dans ce groupe.`,
                                mentions: [senderJid]
                            });

                            console.log(colorize(`🔗 Lien ${linkType} supprimé de ${cleanSender} dans ${groupId}`, 'yellow'));
                        }
                    }
                } catch (error) {
                    console.error('Erreur anti-lien:', error);
                }
            }

            // Afficher des logs pour déboguer
            if (text && text.startsWith(config.PREFIXE_COMMANDE)) {
                console.log(colorize('═══════════════════════════════════════', 'cyan'));
                console.log(colorize(`📨 Message de: ${cleanSender}`, 'cyan'));
                console.log(colorize(`🤖 Bot ID: ${botId}`, 'yellow'));
                console.log(colorize(`👑 Est propriétaire: ${isOwner ? 'OUI' : 'NON'}`, isOwner ? 'green' : 'red'));
                console.log(colorize(`🔑 Est autorisé: ${isAuthorized ? 'OUI' : 'NON'}`, isAuthorized ? 'green' : 'red'));
                console.log(colorize(`⚡ Peut utiliser commandes owner: ${canUseOwnerCommands ? 'OUI' : 'NON'}`, canUseOwnerCommands ? 'green' : 'red'));
                console.log(colorize(`💬 Texte: ${text}`, 'white'));
                console.log(colorize(`📌 Dans groupe: ${isGroup ? 'OUI' : 'NON'}`, 'magenta'));
                console.log(colorize(`📌 FromMe: ${msg.key.fromMe ? 'OUI' : 'NON'}`, 'magenta'));
                console.log(colorize('═══════════════════════════════════════', 'cyan'));
            }

            // Vérifier si c'est une commande
            if (!text || !text.startsWith(config.PREFIXE_COMMANDE)) return;

            const args = text.slice(config.PREFIXE_COMMANDE.length).trim().split(/ +/);
            const commandName = args.shift()?.toLowerCase();

            // Charger les configurations
            const privateConfig = loadPrivate();
            const bannedData = loadBanned();

            // === VÉRIFICATION DU MODE PRIVÉ (avec allowedIds) ===
            if (privateConfig.enabled && !canUseOwnerCommands) {
                const isAllowed = privateConfig.allowedIds && privateConfig.allowedIds.includes(cleanSender);
                if (!isAllowed) {
                    console.log(colorize(`🔒 Message bloqué (mode privé): ${cleanSender}`, 'yellow'));
                    return;
                }
            }

            // === VÉRIFICATION DU BAN ===
            if (bannedData.banned.includes(cleanSender) && commandName !== 'menu' && commandName !== 'ping') {
                console.log(colorize(`⛔ Message bloqué (banni): ${cleanSender}`, 'red'));

                // Envoyer un message d'avertissement (mais pas trop souvent)
                const lastWarnKey = `ban_warn_${cleanSender}`;
                const now = Date.now();
                const lastWarn = global[lastWarnKey] || 0;

                if (now - lastWarn > 60000 && !msg.key.fromMe) { // 1 minute
                    global[lastWarnKey] = now;
                    await sock.sendMessage(from, {
                        text: '⛔ Vous êtes banni(e) du bot.'
                    }, { quoted: msg });
                }
                return;
            }

            // Chercher la commande
            const command = global.commands[commandName];
            if (!command) {
                // Répondre même aux messages du bot si la commande n'existe pas
                await sock.sendMessage(from, {
                    text: `❌ Commande inconnue. Tapez ${config.PREFIXE_COMMANDE}menu pour voir les commandes.`
                }, { quoted: msg });
                return;
            }

            // === VÉRIFICATION DES COMMANDES OWNER ===
            if (command.ownerOnly && !canUseOwnerCommands) {
                await sock.sendMessage(from, {
                    text: '❌ Cette commande est réservée au propriétaire.'
                }, { quoted: msg });
                return;
            }

            try {
                // Vérifier si l'utilisateur est admin dans le groupe (pour les commandes groupe)
                let isAdmin = false;
                let botAdmin = false;

                if (isGroup) {
                    try {
                        const groupMetadata = await sock.groupMetadata(from);
                        const botNumber = sock.user.id.split(':')[0] + '@s.whatsapp.net';

                        botAdmin = groupMetadata.participants.some(p => p.id === botNumber && (p.admin === 'admin' || p.admin === 'superadmin'));
                        isAdmin = groupMetadata.participants.some(p => p.id === senderJid && (p.admin === 'admin' || p.admin === 'superadmin'));
                    } catch (e) {
                        console.error('Erreur vérification admin:', e);
                    }
                }

                // Contexte pour les commandes
                const commandContext = {
                    database: loadDatabase(),
                    saveDatabase,
                    banned: bannedData,
                    saveBanned,
                    private: privateConfig,
                    savePrivate,
                    acces: accesConfig,
                    saveAcces,
                    botNumber: getBareNumber(sock.user?.id),
                    botId: botId,
                    isOwner: isOwner,
                    isAuthorized: isAuthorized,
                    canUseOwnerCommands: canUseOwnerCommands,
                    isGroup,
                    isAdmin,
                    botAdmin,
                    prefix: config.PREFIXE_COMMANDE,
                    cleanId: cleanId,
                    reply: async (text) => {
                        await sock.sendMessage(from, { text }, { quoted: msg });
                    }
                };

                // Exécuter la commande
                console.log(colorize(`⚡ Exécution de la commande: ${commandName}`, 'green'));
                await command.execute(sock, msg, args, from, commandContext);

                // Ajouter une réaction (pour tous les messages, y compris ceux du bot)
                try {
                    await sock.sendMessage(from, {
                        react: { text: "🐉", key: msg.key }
                    });
                } catch (e) {
                    // Ignorer les erreurs de réaction
                }

            } catch (err) {
                logger.error(`Erreur ${commandName}:`, err);
                await sock.sendMessage(from, {
                    text: `❌ Erreur: ${err.message}`
                }, { quoted: msg });
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
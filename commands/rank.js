import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '../db/rank.json');

const LEVEL_CONFIG = {
    1: { min: 0, title: "🌱 Novice", emoji: "🌱" },
    2: { min: 10, title: "🔰 Apprenti", emoji: "🔰" },
    3: { min: 50, title: "🔥 Actif", emoji: "🔥" },
    4: { min: 200, title: "💫 Expert", emoji: "💫" },
    5: { min: 500, title: "👑 Élite", emoji: "👑" },
    6: { min: 1000, title: "⚜️ Maître", emoji: "⚜️" },
    7: { min: 2000, title: "💎 Légende", emoji: "💎" },
    8: { min: 5000, title: "🏆 Dieu", emoji: "🏆" }
};

function loadDatabase() {
    try {
        if (!fs.existsSync(path.dirname(DB_PATH))) {
            fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
        }
        
        if (fs.existsSync(DB_PATH)) {
            const data = fs.readFileSync(DB_PATH, 'utf8');
            return JSON.parse(data);
        } else {
            const defaultData = { users: {} };
            fs.writeFileSync(DB_PATH, JSON.stringify(defaultData, null, 2));
            return defaultData;
        }
    } catch (error) {
        console.error('Erreur chargement DB rank:', error);
        return { users: {} };
    }
}

function saveDatabase(data) {
    try {
        fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
        return true;
    } catch (error) {
        console.error('Erreur sauvegarde DB rank:', error);
        return false;
    }
}

function getUserInfo(userId) {
    const db = loadDatabase();
    return db.users[userId] || {
        messages: 0,
        commands: 0,
        level: 1,
        firstSeen: new Date().toISOString(),
        lastSeen: new Date().toISOString()
    };
}

export default {
    name: 'rank',
    description: 'Voir votre rang et statistiques',
    
    async execute(sock, m, args, from, context) {
        const { reply } = context;
        
        const sender = m.key.participant || m.key.remoteJid;
        
        let targetId = sender;
        let targetName = 'vous';
        
        if (m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
            targetId = m.message.extendedTextMessage.contextInfo.mentionedJid[0];
            targetName = '@' + targetId.split('@')[0];
        } else if (args[0]) {
            const num = args[0].replace(/[^0-9]/g, '');
            if (num) {
                targetId = num + '@s.whatsapp.net';
                targetName = '@' + num;
            }
        }
        
        const userInfo = getUserInfo(targetId);
        const levelConfig = LEVEL_CONFIG[userInfo.level] || LEVEL_CONFIG[1];
        
        const rankMessage = `
${levelConfig.emoji} *RANG & STATISTIQUES*

👤 *Utilisateur:* ${targetName}
📊 *Messages:* ${userInfo.messages}
⚡ *Commandes:* ${userInfo.commands}
🏆 *Niveau ${userInfo.level}:* ${levelConfig.emoji} ${levelConfig.title}

💡 *Gagnez des niveaux en étant actif !*`;
        
        const mentions = targetId !== sender ? [targetId] : [];
        
        await sock.sendMessage(m.key.remoteJid, {
            text: rankMessage,
            mentions: mentions
        }, { quoted: m });
    }
};
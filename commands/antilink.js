const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '../db/antilinks.json');

// Fonction pour lire la base de données
function readDatabase() {
    try {
        if (!fs.existsSync(dbPath)) {
            const defaultData = {
                antilink: { groupes: {} },
                antilink_whatsapp: { groupes: {} },
                antidemote: { groupes: {} },
                antipromote: { groupes: {} }
            };
            fs.writeFileSync(dbPath, JSON.stringify(defaultData, null, 2));
            return defaultData;
        }
        return JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
    } catch (error) {
        console.error('Erreur lecture DB:', error);
        return { 
            antilink: { groupes: {} }, 
            antilink_whatsapp: { groupes: {} },
            antidemote: { groupes: {} },
            antipromote: { groupes: {} }
        };
    }
}

// Fonction pour écrire dans la base de données
function writeDatabase(data) {
    try {
        fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('Erreur écriture DB:', error);
    }
}

// Expression régulière pour détecter les liens
const LINK_REGEX = /(https?:\/\/[^\s]+)|(www\.[^\s]+)|([a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(?:\/[^\s]*)?)/gi;
const WHATSAPP_LINK_REGEX = /(chat\.whatsapp\.com\/[a-zA-Z0-9]+)|(whatsapp\.com\/channel\/[a-zA-Z0-9]+)|(invite\.whatsapp\.com\/[a-zA-Z0-9]+)/gi;

module.exports = {
    name: 'antilink',
    description: 'Activer/désactiver l\'anti-lien (supprime les messages contenant des liens)',
    
    async execute(sock, m, args, from, context) {
        const { reply, isGroup, isAdmin, prefix } = context;

        if (!isGroup) {
            return reply('❌ Cette commande ne peut être utilisée que dans un groupe.');
        }

        if (!isAdmin) {
            return reply('❌ Vous devez être administrateur pour utiliser cette commande.');
        }

        const groupId = m.key.remoteJid;
        const action = args[0]?.toLowerCase();
        const type = args[1]?.toLowerCase();

        const db = readDatabase();

        if (!db.antilink) db.antilink = { groupes: {} };
        if (!db.antilink_whatsapp) db.antilink_whatsapp = { groupes: {} };

        // Afficher le statut
        if (!action) {
            const allLinks = db.antilink.groupes[groupId] ? '✅ Activé' : '❌ Désactivé';
            const whatsappLinks = db.antilink_whatsapp.groupes[groupId] ? '✅ Activé' : '❌ Désactivé';

            return await reply(`📋 *STATUT ANTI-LIEN*\n\n` +
                `▸ *Tous les liens*: ${allLinks}\n` +
                `▸ *Liens WhatsApp*: ${whatsappLinks}\n\n` +
                `*Utilisation:*\n` +
                `• ${prefix}antilink all on/off - Tous les liens\n` +
                `• ${prefix}antilink wa on/off - Uniquement liens WhatsApp\n` +
                `• ${prefix}antilink off - Désactiver tout`);
        }

        // Gérer les commandes
        if (action === 'all') {
            if (type === 'on' || type === 'enable' || type === '1') {
                db.antilink.groupes[groupId] = true;
                writeDatabase(db);
                await reply('✅ *Anti-liens (tous) activé !*\n\nTous les messages contenant des liens seront supprimés.');
            } 
            else if (type === 'off' || type === 'disable' || type === '0') {
                if (db.antilink.groupes[groupId]) {
                    delete db.antilink.groupes[groupId];
                    writeDatabase(db);
                }
                await reply('❌ *Anti-liens (tous) désactivé.*');
            }
        }
        else if (action === 'wa') {
            if (type === 'on' || type === 'enable' || type === '1') {
                db.antilink_whatsapp.groupes[groupId] = true;
                writeDatabase(db);
                await reply('✅ *Anti-liens WhatsApp activé !*\n\nLes messages contenant des liens WhatsApp seront supprimés.');
            } 
            else if (type === 'off' || type === 'disable' || type === '0') {
                if (db.antilink_whatsapp.groupes[groupId]) {
                    delete db.antilink_whatsapp.groupes[groupId];
                    writeDatabase(db);
                }
                await reply('❌ *Anti-liens WhatsApp désactivé.*');
            }
        }
        else if (action === 'off') {
            let modified = false;
            if (db.antilink.groupes[groupId]) {
                delete db.antilink.groupes[groupId];
                modified = true;
            }
            if (db.antilink_whatsapp.groupes[groupId]) {
                delete db.antilink_whatsapp.groupes[groupId];
                modified = true;
            }
            if (modified) {
                writeDatabase(db);
                await reply('❌ *Tous les anti-liens ont été désactivés.*');
            } else {
                await reply('⚠️ Aucun anti-lien n\'était activé.');
            }
        }
    }
};
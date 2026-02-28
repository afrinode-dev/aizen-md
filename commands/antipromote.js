const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '../db/antilinks.json');

// Fonction pour lire la base de données
function readDatabase() {
    try {
        if (!fs.existsSync(dbPath)) {
            const defaultData = {
                antipromote: { groupes: {} },
                antidemote: { groupes: {} },
                antilink: { groupes: {} },
                antilink_whatsapp: { groupes: {} }
            };
            fs.writeFileSync(dbPath, JSON.stringify(defaultData, null, 2));
            return defaultData;
        }
        return JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
    } catch (error) {
        console.error('Erreur lecture DB:', error);
        return { 
            antipromote: { groupes: {} }, 
            antidemote: { groupes: {} },
            antilink: { groupes: {} },
            antilink_whatsapp: { groupes: {} }
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

module.exports = {
    name: 'antipromote',
    description: 'Activer/désactiver l\'anti-promotion (démet automatiquement les nouveaux admins)',
    
    async execute(sock, m, args, from, context) {
        const { reply, isGroup, isAdmin } = context;

        if (!isGroup) {
            return reply('❌ Cette commande ne peut être utilisée que dans un groupe.');
        }

        if (!isAdmin) {
            return reply('❌ Vous devez être administrateur pour utiliser cette commande.');
        }

        const groupId = m.key.remoteJid;
        const action = args[0]?.toLowerCase();

        const db = readDatabase();

        if (!db.antipromote) db.antipromote = { groupes: {} };
        if (!db.antipromote.groupes) db.antipromote.groupes = {};

        if (action === 'on' || action === 'enable' || action === '1') {
            db.antipromote.groupes[groupId] = true;
            writeDatabase(db);
            await reply('✅ *Anti-promotion activé !*\n\nDésormais, toute nouvelle promotion dans ce groupe sera automatiquement annulée.');
        } 
        else if (action === 'off' || action === 'disable' || action === '0') {
            if (db.antipromote.groupes[groupId]) {
                delete db.antipromote.groupes[groupId];
            }
            writeDatabase(db);
            await reply('❌ *Anti-promotion désactivé.*');
        }
        else {
            const status = db.antipromote.groupes[groupId] ? '✅ Activé' : '❌ Désactivé';
            await reply(`📋 *Statut Anti-promotion*\n\nGroupe: ${status}\n\nUtilisation:\n- *antipromote on* : Activer\n- *antipromote off* : Désactiver`);
        }
    }
};
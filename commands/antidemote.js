const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '../db/antilinks.json');

// Fonction pour lire la base de données
function readDatabase() {
    try {
        if (!fs.existsSync(dbPath)) {
            const defaultData = {
                antidemote: { groupes: {} },
                antipromote: { groupes: {} },
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
            antidemote: { groupes: {} }, 
            antipromote: { groupes: {} },
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
    name: 'antidemote',
    description: 'Activer/désactiver l\'anti-démotion (rétrograde automatiquement les admins qui démettent)',
    
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

        if (!db.antidemote) db.antidemote = { groupes: {} };
        if (!db.antidemote.groupes) db.antidemote.groupes = {};

        if (action === 'on' || action === 'enable' || action === '1') {
            db.antidemote.groupes[groupId] = true;
            writeDatabase(db);
            await reply('✅ *Anti-démotion activé !*\n\nDésormais, si quelqu\'un rétrograde un administrateur, il sera automatiquement rétrogradé à son tour.');
        } 
        else if (action === 'off' || action === 'disable' || action === '0') {
            if (db.antidemote.groupes[groupId]) {
                delete db.antidemote.groupes[groupId];
            }
            writeDatabase(db);
            await reply('❌ *Anti-démotion désactivé.*');
        }
        else {
            const status = db.antidemote.groupes[groupId] ? '✅ Activé' : '❌ Désactivé';
            await reply(`📋 *Statut Anti-démotion*\n\nGroupe: ${status}\n\nUtilisation:\n- *antidemote on* : Activer\n- *antidemote off* : Désactiver`);
        }
    }
};
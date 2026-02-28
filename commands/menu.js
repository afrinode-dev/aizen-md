import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getTheme, getDefaultTheme, getRandomThemeImage, listThemes } from '../Themes/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
    name: 'menu',
    description: 'Affiche le menu du bot avec image du thème',
    
    async execute(sock, m, args, from, context) {
        const prefix = process.env.PREFIX || ".";
        const commandsDir = path.join(__dirname);
        
        // Récupérer le thème actuel DIRECTEMENT depuis index.js
        const currentThemeName = getDefaultTheme();
        const currentTheme = getTheme(currentThemeName);
        const themeImage = getRandomThemeImage(currentTheme);
        
        // Récupérer les infos du bot depuis le thème
        const botName = currentTheme.STRINGS?.global?.botName || "AIZEN-MD";
        const botEmoji = currentTheme.STRINGS?.global?.emojii || "🤖";
        const botGreet = currentTheme.STRINGS?.global?.greet || "Bienvenue sur le bot";
        const botFooter = currentTheme.STRINGS?.global?.footer || "C'est lionel le créateur.";
        
        // Obtenir l'heure du Gabon (UTC+1)
        const now = new Date();
        const gabonTime = new Date(now.toLocaleString('en-US', { timeZone: 'Africa/Libreville' }));
        const heure = gabonTime.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        const date = gabonTime.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
        
        // Lire les fichiers de commandes
        let files = [];
        try {
            files = fs.readdirSync(commandsDir).filter(f => f.endsWith('.js') && f !== 'menu.js');
        } catch (error) {
            console.log('❌ Erreur lecture dossier commands:', error.message);
        }
        
        // Compter et lister les commandes
        let publicCommands = [];
        let ownerCommands = [];
        
        for (const file of files) {
            try {
                const module = await import(`./${file}`);
                const cmd = module.default || module;
                if (cmd.name) {
                    if (cmd.ownerOnly) {
                        ownerCommands.push(cmd);
                    } else {
                        publicCommands.push(cmd);
                    }
                }
            } catch (err) {
                console.log(`❌ Erreur lecture ${file}:`, err.message);
            }
        }
        
        // Ajouter la commande theme si elle n'est pas déjà comptée
        if (!publicCommands.find(cmd => cmd.name === 'theme') && !ownerCommands.find(cmd => cmd.name === 'theme')) {
            publicCommands.push({ name: 'theme', description: 'Changer ou voir les thèmes du bot' });
        }
        
        // Trier les commandes par nom
        publicCommands.sort((a, b) => a.name.localeCompare(b.name));
        ownerCommands.sort((a, b) => a.name.localeCompare(b.name));
        
        // Construire le menu texte
        let menuText = `╭───❍ *${botName} ${botEmoji}*\n`;
        menuText += `│\n`;
        menuText += `│ 👋 *Salutation:* ${botGreet}\n`;
        menuText += `│ 🎨 *Thème actuel:* ${currentTheme.theme || currentThemeName}\n`;
        menuText += `│ 📍 *Ville:* Libreville\n`;
        menuText += `│ 🌍 *Pays:* Gabon\n`;
        menuText += `│ ⏰ *Heure:* ${heure}\n`;
        menuText += `│ 📅 *Date:* ${date}\n`;
        menuText += `│ ✨ *Préfixe:* ${prefix}\n`;
        menuText += `│ 📊 *Commandes:* ${publicCommands.length + ownerCommands.length} total\n`;
        menuText += `│\n`;
        menuText += `│ 📋 *COMMANDES PUBLIQUES (${publicCommands.length})*\n`;
        
        publicCommands.forEach(cmd => {
            menuText += `│    ◦ *${prefix}${cmd.name}* : ${cmd.description || 'Aucune description'}\n`;
        });
        
        if (ownerCommands.length > 0) {
            menuText += `│\n`;
            menuText += `│ 🔒 *COMMANDES OWNER (${ownerCommands.length})*\n`;
            ownerCommands.forEach(cmd => {
                menuText += `│    ◦ *${prefix}${cmd.name}* : ${cmd.description || 'Aucune description'}\n`;
            });
        }
        
        menuText += `│\n`;
        menuText += `│ 📁 *Thèmes disponibles:* ${listThemes().join(', ')}\n`;
        menuText += `│ 💡 *Pour changer de thème:* ${prefix}theme NOM_DU_THEME\n`;
        menuText += `│\n`;
        menuText += `╰───❍ *${botFooter}*`;
        
        // Envoyer l'image avec le menu en caption (un seul message)
        if (themeImage) {
            await sock.sendMessage(from, {
                image: { url: themeImage },
                caption: menuText
            }, { quoted: m });
        } else {
            // Fallback si pas d'image
            await sock.sendMessage(from, { text: menuText }, { quoted: m });
        }
    }
};
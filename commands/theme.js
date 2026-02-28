const fs = require('fs');
const path = require('path');
const { getTheme, setDefaultTheme, listThemes, getDefaultTheme, getRandomThemeImage } = require('../Themes/index.js');

module.exports = {
    name: 'theme',
    description: 'Changer ou voir les thèmes du bot',
    
    async execute(sock, m, args, from, context) {
        const prefix = process.env.PREFIX || ".";
        const sender = m.key.participant || m.key.remoteJid;
        const senderNum = sender.split('@')[0];
        
        // Récupérer les settings
        const OWNER_NUMBER = process.env.OWNER_NUMBER || "24176209643";
        
        // Vérification du propriétaire
        const ownerJid = OWNER_NUMBER.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
        const isOwner = sender === ownerJid || senderNum === OWNER_NUMBER;
        
        // Récupérer le thème actuel DIRECTEMENT depuis index.js
        const currentThemeName = getDefaultTheme();
        const currentTheme = getTheme(currentThemeName);
        const themeImage = getRandomThemeImage(currentTheme);
        
        // Si pas d'arguments, afficher le thème actuel
        if (args.length === 0) {
            return await showCurrentTheme(sock, m, from, prefix, themeImage, currentTheme, currentThemeName);
        }
        
        const action = args[0].toLowerCase();
        const availableThemes = listThemes();
        
        // Gestion des différentes sous-commandes
        switch (action) {
            case 'list':
                return await showThemesList(sock, m, from, prefix, themeImage, availableThemes, currentThemeName);
                
            case 'preview':
                if (args[1]) {
                    return await previewTheme(sock, m, from, args[1].toUpperCase(), prefix);
                }
                return await showCurrentTheme(sock, m, from, prefix, themeImage, currentTheme, currentThemeName);
                
            case 'info':
                if (args[1]) {
                    return await showThemeInfo(sock, m, from, args[1].toUpperCase(), prefix);
                }
                return await showCurrentTheme(sock, m, from, prefix, themeImage, currentTheme, currentThemeName);
                
            case 'current':
                return await showCurrentTheme(sock, m, from, prefix, themeImage, currentTheme, currentThemeName);
                
            default:
                // Si c'est directement un nom de thème (ex: .theme GOKU)
                const themeName = args[0].toUpperCase();
                
                // Vérifier si le thème existe
                if (!availableThemes.includes(themeName)) {
                    return await sock.sendMessage(from, {
                        text: `❌ Thème "${themeName}" non trouvé !\n\n📁 *Thèmes disponibles:*\n${availableThemes.map(t => `• ${t}`).join('\n')}\n\n💡 Utilisez: ${prefix}theme NOM_DU_THEME`
                    }, { quoted: m });
                }
                
                // Changer le thème
                return await changeTheme(sock, m, from, themeName, prefix);
        }
    }
};

// Fonction pour mettre à jour settings.js
async function updateSettingsTheme(themeName) {
    try {
        const settingsPath = path.join(process.cwd(), 'settings.js');
        if (!fs.existsSync(settingsPath)) return false;
        
        let settingsContent = fs.readFileSync(settingsPath, 'utf8');
        const themeRegex = /(BOT_THEME:\s*['"`])([^'"`]*)(['"`],?)/;
        
        if (themeRegex.test(settingsContent)) {
            settingsContent = settingsContent.replace(themeRegex, `$1${themeName}$3`);
            fs.writeFileSync(settingsPath, settingsContent, 'utf8');
            return true;
        }
        return false;
    } catch (error) {
        console.log('❌ Erreur mise à jour settings.js:', error.message);
        return false;
    }
}

// Changer le thème
async function changeTheme(sock, m, from, themeName, prefix) {
    if (setDefaultTheme(themeName)) {
        await updateSettingsTheme(themeName);
        
        // Récupérer le nouveau thème APRÈS l'avoir changé
        const newTheme = getTheme(themeName);
        const newImage = getRandomThemeImage(newTheme);
        
        const successMsg = `✅ *Thème changé avec succès !*\n\n` +
            `🎨 *Nouveau thème:* ${newTheme.theme || themeName}\n` +
            `👤 *Auteur:* ${newTheme.AUTHOR || 'Warren lionel'}\n` +
            `😊 *Emoji:* ${newTheme.STRINGS?.global?.emojii || '👑'}\n` +
            `🖼️ *Images:* ${newTheme.STRINGS?.global?.images?.length || 0} disponibles\n\n` +
            `📋 Tapez ${prefix}menu pour voir le nouveau thème.`;
        
        // Envoyer l'image si disponible
        if (newImage) {
            await sock.sendMessage(from, {
                image: { url: newImage },
                caption: successMsg
            }, { quoted: m });
        } else {
            await sock.sendMessage(from, { text: successMsg }, { quoted: m });
        }
    } else {
        await sock.sendMessage(from, {
            text: '❌ Erreur lors du changement de thème !'
        }, { quoted: m });
    }
}

// Afficher le thème actuel
async function showCurrentTheme(sock, m, from, prefix, themeImage, currentTheme, currentThemeName) {
    const info = `🎨 *THÈME ACTUEL*\n\n` +
        `📁 *Nom:* ${currentThemeName}\n` +
        `🎯 *Titre:* ${currentTheme.theme || currentThemeName}\n` +
        `👤 *Auteur:* ${currentTheme.AUTHOR || 'Warren lionel'}\n` +
        `🌐 *Langue:* ${currentTheme.LANGUAGE || 'Français'}\n` +
        `🖼️ *Images:* ${currentTheme.STRINGS?.global?.images?.length || 0} disponibles\n` +
        `😊 *Emoji:* ${currentTheme.STRINGS?.global?.emojii || '👑'}\n\n` +
        `💡 *Pour changer:* ${prefix}theme NOM_DU_THEME\n` +
        `📋 *Liste des thèmes:* ${prefix}theme list`;
    
    // Envoyer l'image si disponible
    if (themeImage) {
        await sock.sendMessage(from, {
            image: { url: themeImage },
            caption: info
        }, { quoted: m });
    } else {
        await sock.sendMessage(from, { text: info }, { quoted: m });
    }
}

// Afficher la liste des thèmes
async function showThemesList(sock, m, from, prefix, themeImage, availableThemes, currentThemeName) {
    let themeList = `📁 *THÈMES DISPONIBLES* (${availableThemes.length})\n\n`;
    
    availableThemes.forEach(theme => {
        const themeData = getTheme(theme);
        const isCurrent = theme === currentThemeName ? ' 🟢 (actuel)' : '';
        themeList += `• *${theme}*${isCurrent}\n`;
        themeList += `  └─ ${themeData.theme || theme} (${themeData.STRINGS?.global?.images?.length || 0} images)\n`;
    });
    
    themeList += `\n💡 *Utilisation:* ${prefix}theme NOM_DU_THEME\n`;
    themeList += `👀 *Aperçu:* ${prefix}theme preview NOM\n`;
    themeList += `ℹ️ *Infos:* ${prefix}theme info NOM`;
    
    // Envoyer l'image du thème actuel avec la liste
    if (themeImage) {
        await sock.sendMessage(from, {
            image: { url: themeImage },
            caption: themeList
        }, { quoted: m });
    } else {
        await sock.sendMessage(from, { text: themeList }, { quoted: m });
    }
}

// Aperçu d'un thème
async function previewTheme(sock, m, from, themeName, prefix) {
    const availableThemes = listThemes();
    
    if (!availableThemes.includes(themeName)) {
        return await sock.sendMessage(from, {
            text: `❌ Thème "${themeName}" non trouvé !\n\n📁 *Thèmes disponibles:*\n${availableThemes.map(t => `• ${t}`).join('\n')}`
        }, { quoted: m });
    }
    
    const themeData = getTheme(themeName);
    const themeImage = getRandomThemeImage(themeData);
    
    const preview = `👀 *APERÇU DU THÈME: ${themeData.theme || themeName}*\n\n` +
        `📁 *Nom:* ${themeName}\n` +
        `👤 *Auteur:* ${themeData.AUTHOR || 'Warren lionel'}\n` +
        `🌐 *Langue:* ${themeData.LANGUAGE || 'Français'}\n` +
        `😊 *Emoji:* ${themeData.STRINGS?.global?.emojii || '👑'}\n` +
        `🤖 *Nom du bot:* ${themeData.STRINGS?.global?.botName || themeData.theme || 'N/A'}\n` +
        `🖼️ *Images:* ${themeData.STRINGS?.global?.images?.length || 0} disponibles\n\n` +
        `💡 *Pour appliquer:* ${prefix}theme ${themeName}`;
    
    if (themeImage) {
        await sock.sendMessage(from, {
            image: { url: themeImage },
            caption: preview
        }, { quoted: m });
    } else {
        await sock.sendMessage(from, { text: preview }, { quoted: m });
    }
}

// Afficher les informations détaillées d'un thème
async function showThemeInfo(sock, m, from, themeName, prefix) {
    const availableThemes = listThemes();
    
    if (!availableThemes.includes(themeName)) {
        return await sock.sendMessage(from, {
            text: `❌ Thème "${themeName}" non trouvé !\n\n📁 *Thèmes disponibles:*\n${availableThemes.map(t => `• ${t}`).join('\n')}`
        }, { quoted: m });
    }
    
    const themeData = getTheme(themeName);
    const currentTheme = getDefaultTheme();
    const isCurrent = themeName === currentTheme ? ' 🟢 (Actuel)' : '';
    
    let info = `🎨 *INFORMATIONS DÉTAILLÉES*${isCurrent}\n\n`;
    info += `📁 *Nom fichier:* ${themeName}\n`;
    info += `🎯 *Nom d'affichage:* ${themeData.theme || themeName}\n`;
    info += `👤 *Auteur:* ${themeData.AUTHOR || 'Warren lionel'}\n`;
    info += `🌐 *Langue:* ${themeData.LANGUAGE || 'Français'}\n`;
    info += `😊 *Emoji principal:* ${themeData.STRINGS?.global?.emojii || '👑'}\n`;
    info += `🤖 *Nom du bot:* ${themeData.STRINGS?.global?.botName || themeData.theme || 'N/A'}\n`;
    info += `📝 *Salutation:* ${themeData.STRINGS?.global?.greet || 'N/A'}\n`;
    info += `🖼️ *Images disponibles:* ${themeData.STRINGS?.global?.images?.length || 0}\n\n`;
    
    if (themeData.STRINGS?.global?.images && themeData.STRINGS.global.images.length > 0) {
        info += `🖼️ *Première image:*\n${themeData.STRINGS.global.images[0]}`;
    }
    
    await sock.sendMessage(from, { text: info }, { quoted: m });
}
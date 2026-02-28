const fs = require('fs');
const path = require('path');

// Charger tous les thèmes du dossier Themes
function loadAllThemes() {
    const themes = {};
    const themesDir = path.join(process.cwd(), 'Themes');
    
    try {
        if (!fs.existsSync(themesDir)) {
            console.log('❌ Dossier "Themes" non trouvé');
            return themes;
        }
        
        const files = fs.readdirSync(themesDir);
        
        files.forEach(file => {
            if (file.endsWith('.json') && file !== 'config.json') {
                const themeName = file.replace('.json', '');
                try {
                    const filePath = path.join(themesDir, file);
                    const fileContent = fs.readFileSync(filePath, 'utf8');
                    themes[themeName] = JSON.parse(fileContent);
                    console.log(`✅ Thème chargé: ${themeName}`);
                } catch (error) {
                    console.log(`❌ Erreur chargement ${file}:`, error.message);
                }
            }
        });
        
    } catch (error) {
        console.log('❌ Erreur lecture dossier Themes:', error.message);
    }
    
    return themes;
}

// Charger la configuration des thèmes
function loadThemeConfig() {
    const configPath = path.join(process.cwd(), 'Themes', 'config.json');
    
    try {
        if (fs.existsSync(configPath)) {
            const configContent = fs.readFileSync(configPath, 'utf8');
            return JSON.parse(configContent);
        }
    } catch (error) {
        console.log('❌ Erreur chargement config thèmes:', error.message);
    }
    
    // Lire depuis settings.js si config.json n'existe pas
    try {
        const settingsPath = path.join(process.cwd(), 'settings.js');
        if (fs.existsSync(settingsPath)) {
            const settingsContent = fs.readFileSync(settingsPath, 'utf8');
            const match = settingsContent.match(/BOT_THEME:\s*['"`]([^'"`]*)['"`]/);
            if (match && match[1]) {
                return {
                    defaultTheme: match[1],
                    availableThemes: Object.keys(loadAllThemes())
                };
            }
        }
    } catch (error) {
        console.log('❌ Erreur lecture settings.js:', error.message);
    }
    
    // Config par défaut
    return {
        defaultTheme: 'AIZEN',
        availableThemes: ['AIZEN', 'GOKU', 'GOJO', 'TYLA']
    };
}

// Sauvegarder la configuration des thèmes
function saveThemeConfig(config) {
    const configPath = path.join(process.cwd(), 'Themes', 'config.json');
    
    try {
        // Créer le dossier Themes s'il n'existe pas
        const themesDir = path.join(process.cwd(), 'Themes');
        if (!fs.existsSync(themesDir)) {
            fs.mkdirSync(themesDir, { recursive: true });
        }
        
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        console.log(`✅ Configuration thèmes sauvegardée: ${config.defaultTheme}`);
        return true;
    } catch (error) {
        console.log('❌ Erreur sauvegarde config thèmes:', error.message);
        return false;
    }
}

// Charger tous les thèmes et la config au démarrage
const allThemes = loadAllThemes();
let themeConfig = loadThemeConfig();

// Vérifier que le thème par défaut existe
if (!allThemes[themeConfig.defaultTheme] && Object.keys(allThemes).length > 0) {
    themeConfig.defaultTheme = Object.keys(allThemes)[0];
    saveThemeConfig(themeConfig);
}

// Fonction pour obtenir un thème spécifique
function getTheme(themeName = null) {
    const themeToLoad = themeName || themeConfig.defaultTheme;
    return allThemes[themeToLoad] || allThemes[themeConfig.defaultTheme] || getDefaultThemeObject();
}

// Fonction pour changer le thème par défaut
function setDefaultTheme(themeName) {
    if (allThemes[themeName]) {
        // Mettre à jour la configuration en mémoire
        themeConfig.defaultTheme = themeName;
        
        // Sauvegarder dans le fichier
        if (saveThemeConfig(themeConfig)) {
            console.log(`✅ Thème changé en mémoire: ${themeName}`);
            return true;
        }
    }
    return false;
}

// Fonction pour lister les thèmes disponibles
function listThemes() {
    return Object.keys(allThemes);
}

// Obtenir le thème par défaut actuel
function getDefaultTheme() {
    return themeConfig.defaultTheme;
}

// Obtenir une image aléatoire du thème
function getRandomThemeImage(theme) {
    try {
        if (!theme || !theme.STRINGS || !theme.STRINGS.global || !theme.STRINGS.global.images) {
            return null;
        }
        
        const images = theme.STRINGS.global.images;
        if (!Array.isArray(images) || images.length === 0) {
            return null;
        }
        
        const randomIndex = Math.floor(Math.random() * images.length);
        return images[randomIndex];
        
    } catch (error) {
        console.log('❌ Erreur image aléatoire:', error.message);
        return null;
    }
}

// Obtenir les messages d'un thème
function getThemeMessages(theme) {
    try {
        if (!theme || !theme.STRINGS || !theme.STRINGS.global) {
            return getDefaultMessages();
        }
        
        const global = theme.STRINGS.global;
        return {
            wait: global.wait || '⏳ Veuillez patienter...',
            succes: global.success || '✅ Terminé !',
            error: global.error?.text || '❌ Une erreur est survenue',
            owner: global.owner || '❌ Cette commande est réservée au propriétaire ! ❌',
            admin: global.admin || '❌ Cette commande est réservée aux administrateurs ! ❌',
            group: global.group || '❌ Cette commande ne peut être utilisée que dans les groupes ! ❌',
            private: global.private || '❌ Cette commande est réservée au propriétaire ! ❌',
            botAdmin: global.botAdmin || '❌ Le bot doit être administrateur ! ❌',
            badFormat: global.badFormat || '*❌ Mauvais format / texte manquant ❌*\n\n*Exemple :* ',
            ...global
        };
        
    } catch (error) {
        console.log('❌ Erreur messages thème:', error.message);
        return getDefaultMessages();
    }
}

// Recharger la configuration des thèmes depuis le fichier
function reloadThemeConfig() {
    themeConfig = loadThemeConfig();
    console.log(`🔄 Configuration thèmes rechargée: ${themeConfig.defaultTheme}`);
    return themeConfig;
}

// Thème par défaut (utilisé si aucun thème n'est trouvé)
function getDefaultThemeObject() {
    return {
        theme: "Default",
        AUTHOR: "System",
        LANGUAGE: "French",
        STRINGS: {
            global: {
                botName: "AIZEN",
                title: "AIZEN",
                footer: "Powered by lionel",
                greet: "Bienvenue sur le bot",
                emojii: "🤖",
                wait: "⏳ Traitement en cours...",
                success: "✅ Terminé",
                error: { text: "❌ Une erreur est survenue" },
                images: []
            }
        }
    };
}

// Messages par défaut
function getDefaultMessages() {
    return {
        wait: '⏳ Veuillez patienter...',
        succes: '✅ Terminé !',
        error: '❌ Une erreur est survenue',
        owner: '❌ Cette commande est réservée au propriétaire ! ❌',
        admin: '❌ Cette commande est réservée aux administrateurs ! ❌',
        group: '❌ Cette commande ne peut être utilisée que dans les groupes ! ❌',
        private: '❌ Cette commande est réservée au propriétaire ! ❌',
        botAdmin: '❌ Le bot doit être administrateur ! ❌',
        badFormat: '*❌ Mauvais format / texte manquant ❌*\n\n*Exemple :* '
    };
}

// Exporter toutes les fonctions
module.exports = {
    getTheme,
    setDefaultTheme,
    listThemes,
    getDefaultTheme,
    getRandomThemeImage,
    getThemeMessages,
    reloadThemeConfig
};
// CaseHandler.js - Version avec débogage
import settings from './settings.js';
import axios from "axios";
import util from "util";
import fetch from "node-fetch";
import { spawn, exec, execSync } from 'child_process';
import pkg from 'gifted-baileys';
const {
  makeWASocket,
  proto,
  generateWAMessage,
  generateWAMessageFromContent,
  getContentType,
  prepareWAMessageMedia,
  downloadContentFromMessage,
  jidDecode
} = pkg;
import chalk from 'chalk';
import fs from 'fs';
import jimp from "jimp";
import moment from 'moment-timezone';
import ms from 'parse-ms';
import { yushi, shadow, danscot } from './library/couleur.js';
import { getTheme, getThemeMessages } from './Themes/index.js';
import {
  sms, sleep, runtime, getBuffer, fetchJson, isUrl,
  formatSize, getSizeMedia, generateMessageTag, smsg
} from './library/myfunc.js';
import permissionsManager from './library/permissions.js';
import permissionsDB from './db/permissionsDB.js';
import isOwner from './library/isOwner.js';

// IMPORT DYNAMIQUE DES COMMANDES
import * as allCommands from './plugins/index.js';

// Import des handlers
import { handleAntilink } from './plugins/antilink.js';
import handleWelcome from './plugins/welcome.js';
import { loadBannedUsers } from './plugins/ban.js';
import { handleStatusUpdate, isAutoStatusEnabled } from './plugins/autostatus.js';
import { isAntipromoteEnabled } from './plugins/antipromote.js';
import { isAntidemoteEnabled } from './plugins/antidemote.js';
import { sendAutoReaction } from './plugins/autoreaction.js';

// ✅ PRÉPARATION DES PLUGINS
let plugins = {};

// Fonction pour charger les commandes avec débogage
function loadCommands() {
    try {
        console.log(yushi('🔍 Chargement des commandes...', 'yellow'));
        
        // Afficher la structure de allCommands
        console.log(yushi('📊 Structure allCommands:', 'cyan'));
        console.log('allCommands type:', typeof allCommands);
        console.log('allCommands keys:', Object.keys(allCommands));
        
        // Si allCommands a une propriété default, on l'utilise
        if (allCommands.default && typeof allCommands.default === 'object') {
            plugins = allCommands.default;
            console.log(yushi('✅ Utilisation de allCommands.default', 'green'));
        } 
        // Sinon on utilise allCommands directement
        else if (allCommands && typeof allCommands === 'object') {
            plugins = allCommands;
            console.log(yushi('✅ Utilisation de allCommands directement', 'green'));
        }
        
        // Filtrer pour ne garder que les fonctions
        const commandNames = Object.keys(plugins).filter(key => typeof plugins[key] === 'function');
        const commandCount = commandNames.length;
        
        console.log(yushi(`📦 ${commandCount} commandes chargées:`, 'green'));
        console.log(yushi(`📋 Liste: ${commandNames.join(', ')}`, 'cyan'));
        
        // Vérifier spécifiquement si ping est présent
        if (plugins['ping']) {
            console.log(yushi('✅ Commande "ping" trouvée!', 'green'));
            console.log('Type de ping:', typeof plugins['ping']);
        } else {
            console.log(yushi('❌ Commande "ping" NON trouvée!', 'red'));
        }
        
        return true;
    } catch (error) {
        console.error(yushi(`❌ Erreur chargement commandes: ${error.message}`, 'red'));
        console.error(error);
        return false;
    }
}

// Charger les commandes au démarrage
loadCommands();

// Fonction d'extraction du body
const getBody = (m) => {
  if (!m.message) return "";
  const msg = m.message;

  return (
    msg.conversation ||
    msg.extendedTextMessage?.text ||
    msg.imageMessage?.caption ||
    msg.videoMessage?.caption ||
    ""
  );
};

// Fonction pour vérifier si l'utilisateur est owner
function isUserOwner(senderNumber, settings) {
    const ownerNumbers = [
        settings.OWNER_NUMBER + '@s.whatsapp.net',
    ].filter(num => num && num !== 'undefined@s.whatsapp.net');
    
    return ownerNumbers.includes(senderNumber);
}

// Handler principal
export default async function CaseHandler(crazyNotDev, m, chatUpdate, store) {
    try {
        // Variables de base
        const isGroup = m.isGroup || false;
        const senderNumber = m.sender;
        const botNumber = crazyNotDev.user?.id || `${settings.OWNER_NUMBER}@s.whatsapp.net`;
        
        // Extraire le texte du message
        const body = getBody(m);
        
        // LOG DE DÉBOGAGE - Afficher tous les messages reçus
        console.log(yushi('📨 Message reçu:', 'blue'));
        console.log('Body:', body);
        console.log('From:', senderNumber);
        
        // Extraction de la commande
        const prefix = settings.PREFIX || '.';
        let command = '';
        let args = [];
        let text = '';
        
        // Vérifier si c'est un message texte et qu'il commence par le préfixe
        if (body && typeof body === 'string' && body.startsWith(prefix)) {
            const argsFull = body.slice(prefix.length).trim().split(/ +/);
            command = argsFull[0].toLowerCase();
            args = argsFull.slice(1);
            text = args.join(' ');
            
            console.log(yushi(`🔍 Commande détectée: ${command}`, 'cyan'));
            console.log(yushi(`📝 Args: ${args.join(' ') || 'aucun'}`, 'cyan'));
        } else {
            console.log(yushi(`💬 Message normal (pas une commande): ${body}`, 'gray'));
        }

        const version = "1.0.0";

        // Vérifier si l'utilisateur est owner
        const isOwnerUser = isUserOwner(senderNumber, settings);

        // Vérifier les permissions
        const permissions = await permissionsManager.checkPermissions(crazyNotDev, m.chat, senderNumber);
        const { isAdmin: isGroupAdmins, isBotAdmin: isBotGroupAdmins, canUseAdminCommands } = permissions;

        // Charger le thème
        const currentTheme = getTheme();
        const mess = getThemeMessages(currentTheme);
        
        // Auto-réaction
        await sendAutoReaction(crazyNotDev, m);

        // Auto-status
        if (chatUpdate && isAutoStatusEnabled()) {
            await handleStatusUpdate(crazyNotDev, chatUpdate);
        }

        // Infos groupe
        let groupMetadata = {};
        let groupName = "";

        if (isGroup) {
            try {
                groupMetadata = await crazyNotDev.groupMetadata(m.chat) || {};
                groupName = groupMetadata.subject || "";
            } catch (error) {
                console.log("Erreur metadata groupe:", error.message);
            }
        }

        // Photo
        let monimage = null;
        try {
            const themeImages = currentTheme.STRINGS.global.images;
            if (themeImages && Array.isArray(themeImages) && themeImages.length > 0) {
                const randomIndex = Math.floor(Math.random() * themeImages.length);
                monimage = themeImages[randomIndex];
            } else {
                monimage = fs.readFileSync('./media/mini.jpeg');
            }
        } catch (error) {
            console.log('Image non trouvée');
        }

        // Logging - SEULEMENT POUR LES COMMANDES
        if (command) {
            console.log(danscot("AIZEN BOT"), 'deeppink');
            console.log('\x1b[30m--------------------\x1b[0m');
            console.log(chalk.bgHex("#e74c3c").bold(`▢ Nouvelle Commande`));
            console.log(
                chalk.bgHex("#00FF00").black(
                    `   ⌬ Date: ${new Date().toLocaleString()} \n` +
                    `   ⌬ Commande: ${command} \n` +
                    `   ⌬ Args: ${args.join(' ') || 'aucun'} \n` +
                    `   ⌬ Sender: ${m.pushname} \n` +
                    `   ⌬ JID: ${senderNumber} \n` +
                    `   ⌬ Owner: ${isOwnerUser ? 'OUI' : 'NON'}`
                )
            );
            if (isGroup) {
                console.log(
                    chalk.bgHex("#00FF00").black(
                        `   ⌬ Groupe: ${groupName} \n` +
                        `   ⌬ Admin: ${isGroupAdmins ? 'OUI' : 'NON'}`
                    )
                );
            }
            console.log();
        }

        // Handler pour les événements de groupe
        if (m.message?.protocolMessage?.type === 'GROUP_PARTICIPANT_UPDATE') {
            const update = m.message.protocolMessage;
            if (update.participants) {
                await handleWelcome(crazyNotDev, update.participants, m.chat);
            }
        }

        // Handler anti-lien
        if (body) {
            await handleAntilink(crazyNotDev, m);
        }

        // Helper resize
        const resize = async (image, width, height) => {
            try {
                const img = await jimp.read(image);
                return await img.resize(width, height).getBufferAsync(jimp.MIME_JPEG);
            } catch (error) {
                console.error('Erreur resize:', error);
                return image;
            }
        };

        // Helper reponse
        async function reponse(content) {
            try {
                if (typeof content === 'string') {
                    await crazyNotDev.sendMessage(m.chat, {
                        text: content
                    }, { quoted: m });
                } else if (content.image) {
                    await crazyNotDev.sendMessage(m.chat, {
                        image: content.image,
                        caption: content.caption || ''
                    }, { quoted: m });
                } else if (content.text && content.mentions) {
                    await crazyNotDev.sendMessage(m.chat, {
                        text: content.text,
                        mentions: content.mentions
                    }, { quoted: m });
                } else {
                    await crazyNotDev.sendMessage(m.chat, content, { quoted: m });
                }
            } catch (error) {
                console.error('Erreur reponse:', error);
                if (typeof content === 'string') {
                    await crazyNotDev.sendMessage(m.chat, { text: content }, { quoted: m });
                }
            }
        }

        // Contexte pour les plugins
        const context = {
            crazyNotDev,
            m,
            store,
            isGroup,
            senderNumber,
            botNumber,
            command,
            args,
            text,
            prefix,
            Access: isOwnerUser,
            isOwner: isOwnerUser,
            version,
            groupMetadata,
            groupName,
            isGroupAdmins,
            isBotGroupAdmins,
            canUseAdminCommands,
            monimage,
            reponse,
            resize,
            settings,
            mess,
            currentTheme,
            permissionsManager,
            permissionsDB
        };

        // 🔴 SI CE N'EST PAS UNE COMMANDE, ON SORT
        if (!command) {
            return;
        }

        // VÉRIFICATION BANNISSEMENT
        try {
            const bannedUsers = await loadBannedUsers();
            const usersArray = Array.isArray(bannedUsers) ? bannedUsers : [];
            const isBanned = usersArray.includes(senderNumber);
            
            if (isBanned) {
                return await reponse(`❌ *VOUS ÊTES BANNI*\n\nVous ne pouvez plus utiliser les commandes.`);
            }
        } catch (banError) {
            console.log('Erreur vérification bannissement:', banError);
        }

        // ✅ EXÉCUTION DE LA COMMANDE
        console.log(yushi(`🎯 Recherche de la commande: "${command}"`, 'yellow'));
        console.log(yushi(`📦 Commandes disponibles: ${Object.keys(plugins).length}`, 'cyan'));
        console.log('Clés disponibles:', Object.keys(plugins).slice(0, 20)); // Affiche les 20 premières clés

        // Chercher la commande dans plugins
        const cmdFunction = plugins[command];
        
        if (cmdFunction && typeof cmdFunction === 'function') {
            console.log(yushi(`✅ Commande ${command} trouvée, exécution...`, 'green'));
            try {
                await cmdFunction(context);
                console.log(yushi(`✅ Commande ${command} exécutée avec succès`, 'green'));
            } catch (execError) {
                console.error(yushi(`❌ Erreur exécution: ${execError.message}`, 'red'));
                console.error(execError);
                await reponse(`❌ Erreur: ${execError.message}`);
            }
        } else {
            // Commande inconnue
            console.log(yushi(`❌ Commande ${command} non trouvée`, 'red'));
            if (cmdFunction) {
                console.log('Type de cmdFunction:', typeof cmdFunction);
            }
            
            const unknownCmdMessage = `
❌ *COMMANDE INCONNUE*

La commande *${command}* n'existe pas.

Utilise *${prefix}menu* pour voir toutes les commandes disponibles.

_AIZEN BOT - Tapez ${prefix}menu_`;

            await reponse(unknownCmdMessage);
        }

    } catch (err) {
        console.error("❌ Erreur dans CaseHandler:", err);
        try {
            await crazyNotDev.sendMessage(m.chat, 
                { text: `❌ Erreur: ${err.message}` }, 
                { quoted: m }
            );
        } catch (sendError) {
            console.error("Impossible d'envoyer le message d'erreur:", sendError);
        }
    }
}
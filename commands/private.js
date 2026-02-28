const fs = require('fs-extra');

const PRIVATE_PATH = "./db/private.json";

// Charger la configuration privée
const loadPrivateConfig = () => {
  try {
    return JSON.parse(fs.readFileSync(PRIVATE_PATH, 'utf-8'));
  } catch {
    return { enabled: false, allowedIds: [] };
  }
};

const savePrivateConfig = (data) => {
  fs.writeFileSync(PRIVATE_PATH, JSON.stringify(data, null, 2));
};

module.exports = {
  name: "private",
  description: "Gérer le mode privé du bot",
  ownerOnly: true,
  
  execute: async (sock, m, args, from, context) => {
    const privateConfig = loadPrivateConfig();
    const subCommand = args[0]?.toLowerCase();
    
    // Vérifier si c'est une réponse à un message
    const quotedMessage = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const quotedParticipant = m.message?.extendedTextMessage?.contextInfo?.participant;
    const quotedJid = quotedParticipant || m.message?.extendedTextMessage?.contextInfo?.remoteJid;
    
    // Afficher l'état actuel
    if (!subCommand || subCommand === 'status') {
      let status = `🔒 *Mode Privé*\n\n`;
      status += `État: ${privateConfig.enabled ? '✅ Activé' : '❌ Désactivé'}\n\n`;
      
      if (privateConfig.allowedIds && privateConfig.allowedIds.length > 0) {
        status += `👥 *IDs autorisés:*\n`;
        privateConfig.allowedIds.forEach((id, i) => {
          status += `${i + 1}. ${id}\n`;
        });
      } else {
        status += `👥 Aucun ID autorisé supplémentaire`;
      }
      
      status += `\n\n*Commandes:*\n`;
      status += `▸ ${context.prefix}private on - Activer\n`;
      status += `▸ ${context.prefix}private off - Désactiver\n`;
      status += `▸ *Répondez à un message* avec ${context.prefix}private add\n`;
      status += `▸ *Répondez à un message* avec ${context.prefix}private remove\n`;
      status += `▸ ${context.prefix}private list - Lister les IDs\n`;
      status += `▸ ${context.prefix}private clear - Supprimer tous les IDs`;
      
      return await sock.sendMessage(from, { text: status }, { quoted: m });
    }
    
    // Activer le mode privé
    if (subCommand === 'on') {
      privateConfig.enabled = true;
      // S'assurer que allowedIds existe
      if (!privateConfig.allowedIds) privateConfig.allowedIds = [];
      savePrivateConfig(privateConfig);
      return await sock.sendMessage(from, { 
        text: '✅ Mode privé activé. Seuls le propriétaire et les IDs autorisés peuvent utiliser le bot.' 
      }, { quoted: m });
    }
    
    // Désactiver le mode privé
    if (subCommand === 'off') {
      privateConfig.enabled = false;
      savePrivateConfig(privateConfig);
      return await sock.sendMessage(from, { 
        text: '✅ Mode privé désactivé. Tout le monde peut utiliser le bot.' 
      }, { quoted: m });
    }
    
    // Ajouter un ID en répondant à un message
    if (subCommand === 'add') {
      // Vérifier qu'on répond à un message
      if (!quotedMessage) {
        return await sock.sendMessage(from, { 
          text: '❌ Veuillez répondre au message de la personne que vous voulez autoriser.' 
        }, { quoted: m });
      }
      
      const targetId = quotedJid.split('@')[0].split(':')[0];
      
      if (targetId === context.botId) {
        return await sock.sendMessage(from, { 
          text: '⚠️ Le bot est déjà propriétaire par défaut.' 
        }, { quoted: m });
      }
      
      // S'assurer que allowedIds existe
      if (!privateConfig.allowedIds) privateConfig.allowedIds = [];
      
      if (privateConfig.allowedIds.includes(targetId)) {
        return await sock.sendMessage(from, { 
          text: `⚠️ L'ID ${targetId} est déjà dans la liste.` 
        }, { quoted: m });
      }
      
      privateConfig.allowedIds.push(targetId);
      savePrivateConfig(privateConfig);
      
      return await sock.sendMessage(from, { 
        text: `✅ ID ${targetId} ajouté à la liste des utilisateurs autorisés.` 
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
      
      const targetId = quotedJid.split('@')[0].split(':')[0];
      
      if (!privateConfig.allowedIds) privateConfig.allowedIds = [];
      const index = privateConfig.allowedIds.indexOf(targetId);
      
      if (index === -1) {
        return await sock.sendMessage(from, { 
          text: `❌ L'ID ${targetId} n'est pas dans la liste.` 
        }, { quoted: m });
      }
      
      privateConfig.allowedIds.splice(index, 1);
      savePrivateConfig(privateConfig);
      
      return await sock.sendMessage(from, { 
        text: `✅ ID ${targetId} supprimé de la liste.` 
      }, { quoted: m });
    }
    
    // Lister les IDs
    if (subCommand === 'list') {
      if (!privateConfig.allowedIds || privateConfig.allowedIds.length === 0) {
        return await sock.sendMessage(from, { 
          text: '👥 Aucun ID autorisé supplémentaire.' 
        }, { quoted: m });
      }
      
      let list = '👥 *IDs autorisés:*\n\n';
      privateConfig.allowedIds.forEach((id, i) => {
        list += `${i + 1}. ${id}\n`;
      });
      
      return await sock.sendMessage(from, { text: list }, { quoted: m });
    }
    
    // Supprimer tous les IDs
    if (subCommand === 'clear') {
      privateConfig.allowedIds = [];
      savePrivateConfig(privateConfig);
      return await sock.sendMessage(from, { 
        text: '✅ Tous les IDs autorisés ont été supprimés.' 
      }, { quoted: m });
    }
    
    // Commande inconnue
    return await sock.sendMessage(from, { 
      text: `❌ Commande inconnue. Tapez ${context.prefix}private pour voir les options.` 
    }, { quoted: m });
  }
};
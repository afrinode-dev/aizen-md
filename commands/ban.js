// commands/ban.js
module.exports = {
  name: "ban",
  description: "Bannir un utilisateur du bot (répondez à son message)",
  ownerOnly: true,
  
  execute: async (sock, m, args, from, context) => {
    const { banned, saveBanned, botId, isOwner } = context;
    
    // Vérifier si c'est une réponse à un message
    const quotedMessage = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const quotedParticipant = m.message?.extendedTextMessage?.contextInfo?.participant;
    const quotedJid = quotedParticipant || m.message?.extendedTextMessage?.contextInfo?.remoteJid;
    
    if (!args[0]) {
      let list = '⛔ *Liste des utilisateurs bannis*\n\n';
      if (banned.banned.length === 0) {
        list += 'Aucun utilisateur banni.';
      } else {
        banned.banned.forEach((id, i) => {
          list += `${i + 1}. ${id}\n`;
        });
      }
      
      list += `\n\n*Comment utiliser:*\n`;
      list += `▸ Répondez au message de quelqu'un avec ${context.prefix}ban add\n`;
      list += `▸ Répondez au message de quelqu'un avec ${context.prefix}ban remove\n`;
      list += `▸ ${context.prefix}ban list - Voir la liste\n`;
      list += `▸ ${context.prefix}ban clear - Supprimer tous les bannis`;
      
      return await sock.sendMessage(from, { text: list }, { quoted: m });
    }
    
    const subCommand = args[0].toLowerCase();
    
    // === BANIR EN RÉPONDANT À UN MESSAGE ===
    if (subCommand === 'add') {
      // Vérifier qu'on répond à un message
      if (!quotedMessage) {
        return await sock.sendMessage(from, { 
          text: '❌ Veuillez répondre au message de la personne que vous voulez bannir.' 
        }, { quoted: m });
      }
      
      // Nettoyer l'ID de la personne ciblée
      const targetId = quotedJid.split('@')[0].split(':')[0];
      
      if (targetId === botId) {
        return await sock.sendMessage(from, { 
          text: '⚠️ Vous ne pouvez pas bannir le bot lui-même.' 
        }, { quoted: m });
      }
      
      if (targetId === botId && isOwner) {
        return await sock.sendMessage(from, { 
          text: '⚠️ Vous ne pouvez pas bannir le propriétaire.' 
        }, { quoted: m });
      }
      
      if (banned.banned.includes(targetId)) {
        return await sock.sendMessage(from, { 
          text: `⚠️ L'utilisateur ${targetId} est déjà banni.` 
        }, { quoted: m });
      }
      
      banned.banned.push(targetId);
      saveBanned(banned);
      
      // Essayer de récupérer le nom de la personne
      let name = targetId;
      try {
        const contact = await sock.onWhatsApp(quotedJid);
        if (contact && contact[0]?.exists) {
          name = `@${targetId}`;
        }
      } catch (e) {}
      
      return await sock.sendMessage(from, { 
        text: `✅ Utilisateur ${name} a été banni du bot.`,
        mentions: [quotedJid]
      }, { quoted: m });
    }
    
    // === DÉBANIR EN RÉPONDANT À UN MESSAGE ===
    if (subCommand === 'remove') {
      // Vérifier qu'on répond à un message
      if (!quotedMessage) {
        return await sock.sendMessage(from, { 
          text: '❌ Veuillez répondre au message de la personne que vous voulez débannir.' 
        }, { quoted: m });
      }
      
      const targetId = quotedJid.split('@')[0].split(':')[0];
      const index = banned.banned.indexOf(targetId);
      
      if (index === -1) {
        return await sock.sendMessage(from, { 
          text: `❌ L'utilisateur ${targetId} n'est pas dans la liste des bannis.` 
        }, { quoted: m });
      }
      
      banned.banned.splice(index, 1);
      saveBanned(banned);
      
      return await sock.sendMessage(from, { 
        text: `✅ Utilisateur ${targetId} a été débanni.` 
      }, { quoted: m });
    }
    
    // === LISTER LES BANNIS ===
    if (subCommand === 'list') {
      let list = '⛔ *Liste des utilisateurs bannis*\n\n';
      if (banned.banned.length === 0) {
        list += 'Aucun utilisateur banni.';
      } else {
        banned.banned.forEach((id, i) => {
          list += `${i + 1}. ${id}\n`;
        });
      }
      return await sock.sendMessage(from, { text: list }, { quoted: m });
    }
    
    // === SUPPRIMER TOUS LES BANNIS ===
    if (subCommand === 'clear') {
      banned.banned = [];
      saveBanned(banned);
      return await sock.sendMessage(from, { 
        text: '✅ Tous les utilisateurs ont été débannis.' 
      }, { quoted: m });
    }
    
    return await sock.sendMessage(from, { 
      text: '❌ Commande inconnue. Utilisez: add, remove, clear, ou list' 
    }, { quoted: m });
  }
};
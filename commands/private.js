export default {
    name: 'private',
    description: 'Gérer le mode privé du bot',
    ownerOnly: true,
    
    async execute(sock, m, args, from, context) {
        const subCommand = args[0]?.toLowerCase();
        const privateData = context.private;
        
        if (!subCommand) {
            const status = privateData.enabled ? '✅ ACTIVÉ' : '❌ DÉSACTIVÉ';
            const allowedList = privateData.allowed.length > 0 
                ? privateData.allowed.map(num => `- @${num}`).join('\n')
                : 'Aucun utilisateur autorisé';
            
            return await sock.sendMessage(from, {
                text: `🔒 *GESTION DU MODE PRIVÉ*\n\n` +
                      `📊 Statut: ${status}\n` +
                      `👥 Utilisateurs autorisés (${privateData.allowed.length}):\n${allowedList}\n\n` +
                      `*Commandes disponibles:*\n` +
                      `▸ ${context.bot.owner ? '' : '.'}private on - Activer\n` +
                      `▸ ${context.bot.owner ? '' : '.'}private off - Désactiver\n` +
                      `▸ ${context.bot.owner ? '' : '.'}private add @user - Ajouter\n` +
                      `▸ ${context.bot.owner ? '' : '.'}private remove @user - Retirer\n` +
                      `▸ ${context.bot.owner ? '' : '.'}private list - Liste des autorisés`,
                mentions: privateData.allowed.map(num => num + '@s.whatsapp.net')
            }, { quoted: m });
        }
        
        // Activer le mode privé
        if (subCommand === 'on') {
            privateData.enabled = true;
            context.savePrivate(privateData);
            
            return await sock.sendMessage(from, {
                text: '✅ Mode privé *activé*. Seuls les utilisateurs autorisés peuvent utiliser le bot.'
            }, { quoted: m });
        }
        
        // Désactiver le mode privé
        if (subCommand === 'off') {
            privateData.enabled = false;
            context.savePrivate(privateData);
            
            return await sock.sendMessage(from, {
                text: '✅ Mode privé *désactivé*. Tout le monde peut utiliser le bot.'
            }, { quoted: m });
        }
        
        // Ajouter un utilisateur
        if (subCommand === 'add') {
            // Récupérer la cible
            let target = m.message?.extendedTextMessage?.contextInfo?.participant;
            
            if (!target && m.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
                target = m.message.extendedTextMessage.contextInfo.participant;
            }
            
            if (!target && args[1]) {
                target = args[1].replace(/[^0-9]/g, '') + '@s.whatsapp.net';
            }
            
            if (!target) {
                return await sock.sendMessage(from, {
                    text: '❌ Mentionne ou reply le message de l\'utilisateur à ajouter.\nEx: .private add @user'
                }, { quoted: m });
            }
            
            const targetNum = target.split('@')[0];
            
            // Empêcher d'ajouter l'owner
            if (targetNum === context.owner || targetNum === context.ownerNumber?.replace(/[^0-9]/g, '')) {
                return await sock.sendMessage(from, {
                    text: '❌ Le propriétaire est déjà autorisé automatiquement.'
                }, { quoted: m });
            }
            
            if (!privateData.allowed.includes(targetNum)) {
                privateData.allowed.push(targetNum);
                context.savePrivate(privateData);
                
                await sock.sendMessage(from, {
                    text: `✅ @${targetNum} a été ajouté à la liste des utilisateurs autorisés.`,
                    mentions: [target]
                }, { quoted: m });
            } else {
                await sock.sendMessage(from, {
                    text: `⚠️ @${targetNum} est déjà dans la liste des autorisés.`,
                    mentions: [target]
                }, { quoted: m });
            }
            
            return;
        }
        
        // Retirer un utilisateur
        if (subCommand === 'remove' || subCommand === 'rm') {
            let target = m.message?.extendedTextMessage?.contextInfo?.participant;
            
            if (!target && m.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
                target = m.message.extendedTextMessage.contextInfo.participant;
            }
            
            if (!target && args[1]) {
                target = args[1].replace(/[^0-9]/g, '') + '@s.whatsapp.net';
            }
            
            if (!target) {
                return await sock.sendMessage(from, {
                    text: '❌ Mentionne ou donne le numéro à retirer.\nEx: .private remove @user'
                }, { quoted: m });
            }
            
            const targetNum = target.split('@')[0];
            const index = privateData.allowed.indexOf(targetNum);
            
            if (index !== -1) {
                privateData.allowed.splice(index, 1);
                context.savePrivate(privateData);
                
                await sock.sendMessage(from, {
                    text: `✅ @${targetNum} a été retiré de la liste des autorisés.`,
                    mentions: [target]
                }, { quoted: m });
            } else {
                await sock.sendMessage(from, {
                    text: `ℹ️ @${targetNum} n'est pas dans la liste des autorisés.`,
                    mentions: [target]
                }, { quoted: m });
            }
            
            return;
        }
        
        // Liste des utilisateurs autorisés
        if (subCommand === 'list') {
            if (privateData.allowed.length === 0) {
                return await sock.sendMessage(from, {
                    text: '📋 Aucun utilisateur autorisé pour le moment.'
                }, { quoted: m });
            }
            
            const list = privateData.allowed.map((num, i) => `${i + 1}. @${num}`).join('\n');
            
            return await sock.sendMessage(from, {
                text: `📋 *Utilisateurs autorisés (${privateData.allowed.length})*\n\n${list}`,
                mentions: privateData.allowed.map(num => num + '@s.whatsapp.net')
            }, { quoted: m });
        }
        
        // Commande inconnue
        await sock.sendMessage(from, {
            text: `❌ Sous-commande inconnue. Utilisez .private sans arguments pour voir l'aide.`
        }, { quoted: m });
    }
};
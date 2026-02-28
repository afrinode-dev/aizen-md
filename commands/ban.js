export default {
    name: 'ban',
    description: 'Bannir un utilisateur du bot',
    ownerOnly: true,
    
    async execute(sock, m, args, from, context) {
        // Récupérer la cible (mention ou reply)
        let target = m.message?.extendedTextMessage?.contextInfo?.participant;
        
        if (!target && m.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
            target = m.message.extendedTextMessage.contextInfo.participant;
        }
        
        if (!target && args[0]) {
            // Nettoyer le numéro (enlever @s.whatsapp.net si présent, espaces, etc.)
            const cleanNumber = args[0].replace(/[^0-9]/g, '');
            if (cleanNumber) {
                target = cleanNumber + '@s.whatsapp.net';
            }
        }
        
        if (!target) {
            return await sock.sendMessage(from, { 
                text: '❌ Mentionne, reply ou donne le numéro.\nEx: .ban @user ou .ban 22512345678' 
            }, { quoted: m });
        }
        
        const targetNum = target.split('@')[0];
        
        // Vérifier que le numéro est valide (au moins 7 chiffres)
        if (targetNum.length < 7) {
            return await sock.sendMessage(from, {
                text: '❌ Numéro invalide. Assurez-vous d\'avoir un numéro valide.'
            }, { quoted: m });
        }
        
        // Empêcher de bannir le propriétaire (appareil connecté)
        if (targetNum === context.owner) {
            return await sock.sendMessage(from, { 
                text: '❌ Tu ne peux pas bannir le propriétaire (appareil connecté).' 
            }, { quoted: m });
        }
        
        // Empêcher de bannir le numéro owner défini dans settings
        if (targetNum === context.ownerNumber?.replace(/[^0-9]/g, '')) {
            return await sock.sendMessage(from, { 
                text: '❌ Tu ne peux pas bannir le numéro propriétaire défini dans settings.' 
            }, { quoted: m });
        }
        
        // Empêcher de bannir le bot lui-même
        if (targetNum === context.botNumber) {
            return await sock.sendMessage(from, {
                text: '❌ Tu ne peux pas bannir le bot lui-même.'
            }, { quoted: m });
        }
        
        // Vérifier si l'utilisateur est déjà banni
        if (!context.banned.banned.includes(targetNum)) {
            // Ajouter aux bannis
            context.banned.banned.push(targetNum);
            context.saveBanned(context.banned);
            
            // Message de confirmation
            await sock.sendMessage(from, { 
                text: `✅ @${targetNum} a été banni du bot.\n\n` +
                      `Il ne pourra plus utiliser aucune commande.`,
                mentions: [target]
            }, { quoted: m });
            
            // Optionnel: envoyer un message à l'utilisateur banni pour l'informer
            try {
                await sock.sendMessage(target, {
                    text: `⛔ Vous avez été banni du bot par le propriétaire.\n\n` +
                          `Vous ne pouvez plus utiliser les commandes.`
                });
            } catch (e) {
                // Ignorer si le message ne peut pas être envoyé
            }
            
        } else {
            await sock.sendMessage(from, { 
                text: `⚠️ @${targetNum} est déjà dans la liste des bannis.`,
                mentions: [target]
            }, { quoted: m });
        }
    }
};
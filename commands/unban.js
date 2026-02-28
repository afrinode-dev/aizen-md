export default {
    name: 'unban',
    description: 'Débannir un utilisateur',
    ownerOnly: true,
    
    async execute(sock, m, args, from, context) {
        // Récupérer la cible
        let target = m.message?.extendedTextMessage?.contextInfo?.participant;
        
        if (!target && m.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
            target = m.message.extendedTextMessage.contextInfo.participant;
        }
        
        if (!target && args[0]) {
            const cleanNumber = args[0].replace(/[^0-9]/g, '');
            if (cleanNumber) {
                target = cleanNumber + '@s.whatsapp.net';
            }
        }
        
        if (!target) {
            return await sock.sendMessage(from, { 
                text: '❌ Mentionne, reply ou donne le numéro.\nEx: .unban @user ou .unban 22512345678' 
            }, { quoted: m });
        }
        
        const targetNum = target.split('@')[0];
        
        // Vérifier que le numéro est valide
        if (targetNum.length < 7) {
            return await sock.sendMessage(from, {
                text: '❌ Numéro invalide.'
            }, { quoted: m });
        }
        
        // Vérifier si l'utilisateur est dans la liste des bannis
        const index = context.banned.banned.indexOf(targetNum);
        
        if (index !== -1) {
            // Retirer des bannis
            context.banned.banned.splice(index, 1);
            context.saveBanned(context.banned);
            
            await sock.sendMessage(from, { 
                text: `✅ @${targetNum} a été débanni.\n\n` +
                      `Il peut maintenant utiliser le bot normalement.`,
                mentions: [target]
            }, { quoted: m });
            
            // Optionnel: informer l'utilisateur qu'il est débanni
            try {
                await sock.sendMessage(target, {
                    text: `✅ Vous avez été débanni du bot.\n\n` +
                          `Vous pouvez à nouveau utiliser les commandes.\n` +
                          `Tapez ${context.prefix || '.'}menu pour commencer.`
                });
            } catch (e) {
                // Ignorer
            }
            
        } else {
            await sock.sendMessage(from, { 
                text: `ℹ️ @${targetNum} n'est pas dans la liste des bannis.`,
                mentions: [target]
            }, { quoted: m });
        }
    }
};
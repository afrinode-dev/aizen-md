export default {
    name: 'dev',
    description: 'Informations développeur',
    
    async execute(sock, m, args, from, context) {
        const { reply } = context;
        
        const devMessage = `
👨‍💻 *AIZEN - DÉVELOPPEURS*

╭───────────────╮
│  *👥 ÉQUIPE*  │
╰───────────────╯

┌─ *Développeur*
│ 👑 Nom: 𝙸’𝚊𝚖 𝚕𝚒𝚘𝚗𝚎𝚕
│ 📞 Tel: +24176209643
│ 📧 Email: lionel9bc@gmail.com
│ 🌍 Pays: Gabon
│ 🏠 Adresse: fromager
│
╰─────────────────

*Merci pour votre confiance !*`;

        await sock.sendMessage(m.key.remoteJid, {
            text: devMessage
        }, { quoted: m });
    }
};

export const contact = {
    name: 'contact',
    description: 'Envoyer le contact du développeur',
    
    async execute(sock, m, args, from, context) {
        const { reply } = context;
        
        const vcard = 'BEGIN:VCARD\nVERSION:3.0\nFN:𝙸’𝚊𝚖 𝚕𝚒𝚘𝚗𝚎𝚕\nTEL;type=CELL;waid=24176209643:+24176209643\nEND:VCARD';
        
        await sock.sendMessage(m.key.remoteJid, {
            contacts: {
                displayName: '𝙸’𝚊𝚖 𝚕𝚒𝚘𝚗𝚎𝚕',
                contacts: [{ vcard }]
            }
        }, { quoted: m });
    }
};